/**
 * Preview script for prediction accuracy event backfill (Phase 1).
 *
 * READ-ONLY. This script does not write to any table. It reads from
 * predictions and draw_results, computes what synthetic accuracy events
 * PR 3 would emit if a write-capable script were run, and prints a
 * summary plus example payloads.
 *
 * Run via:
 *   pnpm preview:accuracy-backfill
 *   pnpm preview:accuracy-backfill -- --game-type=fantasy_5
 *   pnpm preview:accuracy-backfill -- --game-type=fantasy_5 --limit=10
 *   pnpm preview:accuracy-backfill -- --from=2026-04-23 --to=2026-05-04
 *   pnpm preview:accuracy-backfill -- --verbose
 *
 * See docs/runbooks/prediction-learning-backfill.md for full context.
 */

import "dotenv/config";
import { getDb } from "../db";
import { predictions, drawResults } from "../../drizzle/schema";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";
import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { scorePredictionAgainstDraw } from "../predictions/scorePrediction";
import {
  findCandidateDraws,
  extractFactorSnapshot,
  buildBackfillEventRow,
  type DrawLite,
  type PredictionLite,
} from "./backfillHelpers";

// ===== CLI parsing =====

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  // Supports both --name=value and --name value
  const eqForm = args.find((a) => a.startsWith(`--${name}=`));
  if (eqForm) return eqForm.slice(`--${name}=`.length);
  const flagIdx = args.indexOf(`--${name}`);
  if (flagIdx >= 0 && flagIdx + 1 < args.length && !args[flagIdx + 1].startsWith("--")) {
    return args[flagIdx + 1];
  }
  return undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`) || args.some((a) => a.startsWith(`--${name}=`));
}

// ===== Safety: refuse write flags =====

if (hasFlag("commit") || hasFlag("write") || hasFlag("BACKFILL_SYNTHETIC_EVENTS")) {
  console.error(
    "ERROR: This is a dry-run-only preview script. Write capability is not " +
      "implemented in this file by design. Use the PR 3 backfill script for " +
      "write operations.",
  );
  process.exit(1);
}

// ===== Args =====

const GAME_TYPE_ARG = getArg("game-type");
const FROM_ARG = getArg("from");
const TO_ARG = getArg("to");
const LIMIT_ARG = getArg("limit");
const EXAMPLES_ARG = getArg("examples");
const VERBOSE = hasFlag("verbose");

const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : undefined;
const EXAMPLES = EXAMPLES_ARG ? parseInt(EXAMPLES_ARG, 10) : 3;

if (LIMIT_ARG && (Number.isNaN(LIMIT) || LIMIT! < 1)) {
  console.error(`ERROR: --limit must be a positive integer (got "${LIMIT_ARG}")`);
  process.exit(1);
}
if (EXAMPLES_ARG && (Number.isNaN(EXAMPLES) || EXAMPLES < 0)) {
  console.error(`ERROR: --examples must be a non-negative integer (got "${EXAMPLES_ARG}")`);
  process.exit(1);
}
if (GAME_TYPE_ARG && !(GAME_TYPE_ARG in FLORIDA_GAMES)) {
  console.error(
    `ERROR: --game-type "${GAME_TYPE_ARG}" is not in FLORIDA_GAMES. ` +
      `Valid values: ${Object.keys(FLORIDA_GAMES).join(", ")}`,
  );
  process.exit(1);
}

// ===== Types =====

interface ExampleSeed {
  prediction: PredictionLite;
  draw: DrawLite;
  gameType: string;
}

// ===== Main =====

async function main(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error("ERROR: Database not available. Check DATABASE_URL.");
    process.exit(1);
  }

  const RUN_ID = `preview-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  console.log(`\n========================================`);
  console.log(`Accuracy Event Backfill — DRY RUN PREVIEW`);
  console.log(`========================================`);
  console.log(`Run ID:      ${RUN_ID}`);
  console.log(`Mode:        DRY-RUN (read-only, no writes)`);
  console.log(`gameType:    ${GAME_TYPE_ARG ?? "all in FLORIDA_GAMES"}`);
  console.log(`from:        ${FROM_ARG ?? "(unbounded)"}`);
  console.log(`to:          ${TO_ARG ?? "(unbounded)"}`);
  console.log(`limit:       ${LIMIT ?? "(no limit)"}`);
  console.log(`examples:    ${EXAMPLES}`);
  console.log(``);

  const gameEntries = GAME_TYPE_ARG
    ? ([[GAME_TYPE_ARG, FLORIDA_GAMES[GAME_TYPE_ARG as GameType]]] as const)
    : (Object.entries(FLORIDA_GAMES) as ReadonlyArray<readonly [string, (typeof FLORIDA_GAMES)[GameType]]>);

  let grandTotalEvents = 0;
  let grandTotalPredictions = 0;
  let grandTotalMatched = 0;
  const exampleEvents: ExampleSeed[] = [];

  for (const [gameType, cfg] of gameEntries) {
    if (!cfg) {
      console.log(`[${gameType}] not in FLORIDA_GAMES, skipping`);
      continue;
    }

    // Build prediction query
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
      console.log(`[${gameType}] 0 predictions in range`);
      console.log(``);
      continue;
    }

    // Fetch all draws for the game (in-memory filter per prediction)
    const draws = await db
      .select()
      .from(drawResults)
      .where(eq(drawResults.gameType, gameType))
      .orderBy(drawResults.drawDate);

    let predictionsInRangeWithFactor = 0;
    let matchedPredictionsWithFactor = 0;
    let predictionsMatched = 0;
    let gameEvents = 0;
    const matchRatios: number[] = [];

    for (const pred of preds) {
      const factorSnapshot = extractFactorSnapshot(pred.metadata as Record<string, unknown> | null);
      const hasFactor = Object.keys(factorSnapshot).length > 0;
      if (hasFactor) predictionsInRangeWithFactor++;

      const candidateDraws = findCandidateDraws(
        { createdAt: pred.createdAt as Date },
        draws.map(d => ({ id: d.id, drawDate: d.drawDate, mainNumbers: d.mainNumbers as number[] })),
      );

      if (candidateDraws.length === 0) continue;
      predictionsMatched++;
      if (hasFactor) matchedPredictionsWithFactor++;

      const predLite: PredictionLite = {
        id: pred.id,
        userId: pred.userId!,
        modelName: pred.modelName,
        gameType,
        mainNumbers: pred.mainNumbers as number[],
        metadata: pred.metadata as Record<string, unknown> | null,
        createdAt: pred.createdAt as Date,
      };

      for (const draw of candidateDraws) {
        const { matchRatio } = scorePredictionAgainstDraw(predLite.mainNumbers, draw.mainNumbers);
        matchRatios.push(matchRatio);
        gameEvents++;

        // Capture one example per game, up to EXAMPLES total
        if (
          exampleEvents.length < EXAMPLES &&
          !exampleEvents.some((e) => e.gameType === gameType)
        ) {
          exampleEvents.push({
            prediction: predLite,
            draw,
            gameType,
          });
        }
      }
    }

    // Per-game summary
    console.log(`[${gameType}]`);
    console.log(`  Predictions in range:                ${preds.length}`);
    console.log(`  Draws available for game:            ${draws.length}`);
    console.log(
      `  Predictions matched to >=1 draw:     ${predictionsMatched}` +
        ` (${preds.length > 0 ? Math.round((100 * predictionsMatched) / preds.length) : 0}%)`,
    );
    console.log(`  Events that would be emitted:        ${gameEvents}`);
    console.log(
      `  Avg events per matched prediction:   ${
        predictionsMatched > 0 ? (gameEvents / predictionsMatched).toFixed(2) : "0.00"
      }`,
    );
    console.log(
      `  Predictions in range with factor_snapshot:  ${predictionsInRangeWithFactor}` +
        ` (${preds.length > 0 ? Math.round((100 * predictionsInRangeWithFactor) / preds.length) : 0}%)`,
    );
    console.log(
      `  Matched preds with factor_snapshot:         ${matchedPredictionsWithFactor}` +
        ` (${predictionsMatched > 0 ? Math.round((100 * matchedPredictionsWithFactor) / predictionsMatched) : 0}% of matched)`,
    );
    if (matchRatios.length > 0) {
      const sorted = [...matchRatios].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const median = sorted[Math.floor(sorted.length / 2)];
      const mean = matchRatios.reduce((s, v) => s + v, 0) / matchRatios.length;
      console.log(
        `  Match ratio: min=${min.toFixed(2)} median=${median.toFixed(2)} ` +
          `max=${max.toFixed(2)} mean=${mean.toFixed(3)}`,
      );
    }
    console.log(``);

    grandTotalEvents += gameEvents;
    grandTotalPredictions += preds.length;
    grandTotalMatched += predictionsMatched;
  }

  // Overall summary
  console.log(`========== Overall Summary ==========`);
  console.log(`Predictions scanned:                   ${grandTotalPredictions}`);
  console.log(`Predictions matched to >=1 draw:       ${grandTotalMatched}`);
  console.log(`Events that would be emitted:          ${grandTotalEvents}`);
  console.log(``);

  // Example payloads — built with the same helper the write-capable script uses,
  // so the preview's example output is byte-identical to what PR 3 would insert.
  if (exampleEvents.length > 0) {
    console.log(`========== Example Synthetic Event Payloads (${exampleEvents.length}) ==========`);
    for (let i = 0; i < exampleEvents.length; i++) {
      const e = exampleEvents[i];
      const row = buildBackfillEventRow({
        prediction: e.prediction,
        draw: e.draw,
        backfillRunId: RUN_ID,
      });

      console.log(`\n--- Example ${i + 1} of ${exampleEvents.length} (${e.gameType}) ---`);
      console.log(JSON.stringify(row, null, 2));
    }
    console.log(``);
  }

  console.log(`========== End of Preview (no rows written) ==========\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[preview] error:", err);
  process.exit(1);
});
