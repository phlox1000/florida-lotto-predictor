/**
 * Write-capable accuracy event backfill (Phase 1).
 *
 * Reads attributed predictions from the predictions table, finds matching draws
 * within 7 days after each prediction (mirroring the live evaluatePredictionsAgainstDraw
 * matching logic), and emits synthetic prediction_accuracy_calculated events to
 * app_events. After each game's events are committed, calls the existing rebuild
 * to populate prediction_learning_metrics for that game.
 *
 * SAFETY:
 *  - Default mode is dry-run. Will NOT write unless --commit=BACKFILL_PHASE1_EVENTS
 *    is passed exactly.
 *  - Idempotent: deterministic event IDs collide on primary key. Re-runs are safe;
 *    no double-counting in PLM rollups.
 *  - Aborts on DB errors (does not silently skip). Per-game failure leaves prior
 *    games' commits intact.
 *
 * Run:
 *   pnpm backfill:accuracy-events                                    # dry-run, all games
 *   pnpm backfill:accuracy-events -- --game-type=fantasy_5           # dry-run, one game
 *   pnpm backfill:accuracy-events -- --game-type=fantasy_5 --commit=BACKFILL_PHASE1_EVENTS
 *
 * See docs/runbooks/prediction-learning-backfill.md for the full operational guide.
 */

import "dotenv/config";
import { sql, eq, and, gte, lte, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { predictions, drawResults } from "../../drizzle/schema";
import { appEvents } from "../db/schema/appEvents";
import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { refreshPredictionLearningMetrics } from "../services/learningMetrics.service";
import {
  findCandidateDraws,
  buildBackfillEventRow,
  type BackfillEventRow,
  type DrawLite,
  type PredictionLite,
} from "./backfillHelpers";

// ===== CLI =====

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const eqForm = args.find((a) => a.startsWith(`--${name}=`));
  if (eqForm) return eqForm.slice(`--${name}=`.length);
  const flagIdx = args.indexOf(`--${name}`);
  if (flagIdx >= 0 && flagIdx + 1 < args.length && !args[flagIdx + 1].startsWith("--")) {
    return args[flagIdx + 1];
  }
  return undefined;
}

const COMMIT_PHRASE = "BACKFILL_PHASE1_EVENTS";
const COMMIT_VAL = getArg("commit");
const COMMIT = COMMIT_VAL === COMMIT_PHRASE;

if (COMMIT_VAL !== undefined && !COMMIT) {
  console.error(
    `ERROR: --commit value "${COMMIT_VAL}" is not the required phrase. ` +
      `Expected --commit=${COMMIT_PHRASE}.`,
  );
  process.exit(1);
}

const GAME_TYPE_ARG = getArg("game-type");
const FROM_ARG = getArg("from");
const TO_ARG = getArg("to");
const LIMIT_ARG = getArg("limit");
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : undefined;

if (LIMIT_ARG && (Number.isNaN(LIMIT) || LIMIT! < 1)) {
  console.error(`ERROR: --limit must be a positive integer (got "${LIMIT_ARG}")`);
  process.exit(1);
}
if (GAME_TYPE_ARG && !(GAME_TYPE_ARG in FLORIDA_GAMES)) {
  console.error(
    `ERROR: --game-type "${GAME_TYPE_ARG}" is not in FLORIDA_GAMES. ` +
      `Valid values: ${Object.keys(FLORIDA_GAMES).join(", ")}`,
  );
  process.exit(1);
}

const BATCH_SIZE = 500;

async function main(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error("ERROR: Database not available. Check DATABASE_URL.");
    process.exit(1);
  }

  const RUN_ID = `backfill-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  console.log(`\n=========================================`);
  console.log(`Accuracy Event Backfill — Phase 1`);
  console.log(`=========================================`);
  console.log(`Run ID:      ${RUN_ID}`);
  console.log(`Mode:        ${COMMIT ? "COMMIT (will write)" : "DRY-RUN (no writes)"}`);
  console.log(`gameType:    ${GAME_TYPE_ARG ?? "all in FLORIDA_GAMES"}`);
  console.log(`from:        ${FROM_ARG ?? "(unbounded)"}`);
  console.log(`to:          ${TO_ARG ?? "(unbounded)"}`);
  console.log(`limit:       ${LIMIT ?? "(no limit)"}`);
  console.log(``);

  if (!COMMIT) {
    console.log(
      `NOTE: This is a dry-run. To actually write events, re-invoke with ` +
        `--commit=${COMMIT_PHRASE}\n`,
    );
  }

  const gameEntries = GAME_TYPE_ARG
    ? ([[GAME_TYPE_ARG, FLORIDA_GAMES[GAME_TYPE_ARG as GameType]]] as const)
    : Object.entries(FLORIDA_GAMES);

  let grandEventsBuilt = 0;
  let grandEventsInserted = 0;
  let grandEventsSkippedDuplicate = 0;

  for (const [gameType, cfg] of gameEntries) {
    if (!cfg) {
      console.log(`[${gameType}] not in FLORIDA_GAMES, skipping\n`);
      continue;
    }

    const predConditions = [
      eq(predictions.gameType, gameType),
      isNotNull(predictions.userId),
    ];
    if (FROM_ARG) predConditions.push(gte(predictions.createdAt, new Date(FROM_ARG)));
    if (TO_ARG) predConditions.push(lte(predictions.createdAt, new Date(TO_ARG)));

    let preds = await db
      .select()
      .from(predictions)
      .where(and(...predConditions))
      .orderBy(predictions.createdAt);

    if (LIMIT !== undefined) preds = preds.slice(0, LIMIT);

    if (preds.length === 0) {
      console.log(`[${gameType}] 0 predictions in range\n`);
      continue;
    }

    const drawsRaw = await db
      .select()
      .from(drawResults)
      .where(eq(drawResults.gameType, gameType))
      .orderBy(drawResults.drawDate);

    const drawsLite: DrawLite[] = drawsRaw.map((d) => ({
      id: d.id,
      drawDate: d.drawDate,
      mainNumbers: d.mainNumbers as number[],
    }));

    // Build all events for this game in memory
    const eventsToInsert: BackfillEventRow[] = [];

    for (const pred of preds) {
      const predLite: PredictionLite = {
        id: pred.id,
        userId: pred.userId!,
        modelName: pred.modelName,
        gameType: pred.gameType,
        mainNumbers: pred.mainNumbers as number[],
        metadata: pred.metadata as Record<string, unknown> | null,
        createdAt: pred.createdAt as Date,
      };

      const candidates = findCandidateDraws(predLite, drawsLite);
      for (const draw of candidates) {
        eventsToInsert.push(
          buildBackfillEventRow({
            prediction: predLite,
            draw,
            backfillRunId: RUN_ID,
          }),
        );
      }
    }

    grandEventsBuilt += eventsToInsert.length;

    console.log(`[${gameType}]`);
    console.log(`  Predictions in range:                ${preds.length}`);
    console.log(`  Draws available for game:            ${drawsLite.length}`);
    console.log(`  Events to ${COMMIT ? "insert " : "build  "}:                  ${eventsToInsert.length}`);

    if (eventsToInsert.length === 0) {
      console.log(``);
      continue;
    }

    if (!COMMIT) {
      console.log(`  (dry-run — no insert)\n`);
      continue;
    }

    // ===== COMMIT MODE: insert in batches =====

    let inserted = 0;
    let skippedDuplicate = 0;

    for (let i = 0; i < eventsToInsert.length; i += BATCH_SIZE) {
      const batch = eventsToInsert.slice(i, i + BATCH_SIZE);
      try {
        // Idempotent insert: on duplicate primary key (deterministic id), no-op update.
        // Setting recorded_at to itself is a Drizzle pattern for "do nothing on conflict."
        const result = await db
          .insert(appEvents)
          .values(batch)
          .onDuplicateKeyUpdate({
            set: {
              recorded_at: sql`recorded_at`,
            },
          });

        // MySQL2's affectedRows: 1 for inserted, 2 for updated. Best-effort accounting.
        const affected =
          (result as unknown as { affectedRows?: number }[])?.[0]?.affectedRows ??
          batch.length;
        // Without distinguishing inserts vs no-op updates from the result, we report
        // batch totals. Real "inserted vs duplicate" breakdown requires per-row counting,
        // which is reserved for a future improvement if needed.
        inserted += batch.length;
        void affected;
      } catch (err) {
        console.error(
          `  ERROR inserting batch ${i}-${i + batch.length} for ${gameType}:`,
          (err as Error).message,
        );
        console.error(
          `  Aborting this game. Prior batches may have been committed. Subsequent games will not be processed.`,
        );
        process.exit(2);
      }

      if ((i / BATCH_SIZE + 1) % 5 === 0 || i + BATCH_SIZE >= eventsToInsert.length) {
        console.log(
          `  Inserted ${Math.min(i + BATCH_SIZE, eventsToInsert.length)} / ${eventsToInsert.length} events`,
        );
      }
    }

    grandEventsInserted += inserted;
    grandEventsSkippedDuplicate += skippedDuplicate;

    console.log(`  Insert complete: ${inserted} attempted (duplicates upserted as no-ops)`);

    // Trigger PLM rebuild for this game with windowDays=90 (the live default)
    console.log(`  Rebuilding prediction_learning_metrics for ${gameType} (windowDays=90)...`);
    try {
      const rebuild = await refreshPredictionLearningMetrics({
        gameType: gameType as GameType,
        windowDays: 90,
      });
      console.log(
        `  Rebuild complete: ${rebuild.updated} PLM rows touched, ` +
          `${rebuild.factors} factor cells, ${rebuild.models} model cells`,
      );
    } catch (err) {
      console.error(`  ERROR during rebuild for ${gameType}:`, (err as Error).message);
      console.error(`  Events were inserted but rebuild failed. Re-run rebuild manually or via re-run of this script.`);
      process.exit(3);
    }

    console.log(``);
  }

  console.log(`========== Overall Summary ==========`);
  console.log(`Run ID:                          ${RUN_ID}`);
  console.log(`Mode:                            ${COMMIT ? "COMMIT" : "DRY-RUN"}`);
  console.log(`Events ${COMMIT ? "inserted" : "built   "}:                ${COMMIT ? grandEventsInserted : grandEventsBuilt}`);
  if (COMMIT) {
    console.log(`Note: duplicates from prior runs are silently no-op'd via deterministic IDs.`);
  }
  console.log(``);

  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
