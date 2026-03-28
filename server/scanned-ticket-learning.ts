import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  drawResults,
  scannedTicketFeatureSnapshots,
  scannedTicketOutcomes,
  scannedTicketRows,
  scannedTickets,
  type InsertScannedTicketFeatureSnapshot,
  type InsertScannedTicketOutcome,
} from "../drizzle/schema";
import { FLORIDA_GAMES, type GameType } from "../shared/lottery";
import { getDb, getDrawResults, getModelPerformanceStats } from "./db";
import {
  RANKER_V2_FEATURE_SET,
  computeRewardScore,
  rewardTier,
  computeScannedTicketFeatures,
} from "./ranker-v2";

export type TicketOrigin = "user_selected" | "quick_pick" | "unknown";

export interface ScannedTicketFeatureContext {
  gameType: string;
  mainNumbers: number[];
  specialNumbers: number[];
  ticketOrigin: TicketOrigin;
  sourceModelName?: string | null;
  sourceConfidence?: number | null;
}

function resolveModelStats(
  stats: Array<{ modelName: string; avgMainHits: number }>,
  sourceModelName?: string | null
): { avgHits: number; weightPrior: number } {
  if (!sourceModelName) return { avgHits: 0, weightPrior: 0.5 };
  const row = stats.find(s => s.modelName === sourceModelName);
  if (!row) return { avgHits: 0, weightPrior: 0.5 };
  return {
    avgHits: Number(row.avgMainHits) || 0,
    weightPrior: Math.max(0.3, Math.min(1, 0.3 + (Number(row.avgMainHits) || 0) * 0.15)),
  };
}

function parseNumberArray(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map(Number).filter(Number.isFinite);
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(Number).filter(Number.isFinite);
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeTicketOrigin(value: unknown): TicketOrigin {
  const str = String(value ?? "").trim().toLowerCase();
  if (str === "quick_pick") return "quick_pick";
  if (str === "user_selected") return "user_selected";
  return "unknown";
}

function readParsedPayloadField<T>(payload: unknown, key: string): T | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return (value as T) ?? null;
}

function computeScannedTrainingWeight(ticketOrigin: TicketOrigin): number {
  if (ticketOrigin === "quick_pick") return 0.4;
  if (ticketOrigin === "user_selected") return 0.35;
  return 0.3;
}

export async function computeScannedTicketFeatureSnapshot(
  input: ScannedTicketFeatureContext
): Promise<Record<string, number>> {
  const cfg = FLORIDA_GAMES[input.gameType as GameType];
  if (!cfg) {
    throw new Error(`Unsupported game type for scanned ticket features: ${input.gameType}`);
  }

  const history = await getDrawResults(input.gameType, 200);
  const historyDepth = history.length;
  const perf = await getModelPerformanceStats(input.gameType);
  const perfLite = perf.map(p => ({
    modelName: p.modelName,
    avgMainHits: Number(p.avgMainHits) || 0,
  }));
  const modelStats = resolveModelStats(perfLite, input.sourceModelName);

  return computeScannedTicketFeatures({
    cfg,
    mainNumbers: input.mainNumbers,
    specialNumbers: input.specialNumbers,
    ticketOrigin: input.ticketOrigin,
    sourceModelWeight: modelStats.weightPrior,
    sourceModelAvgHits: modelStats.avgHits,
    historyDepth,
    sourceConfidence: Number(input.sourceConfidence ?? 0.5),
  });
}

export function computeScannedTicketOutcome(params: {
  gameType: string;
  mainNumbers: number[];
  specialNumbers: number[];
  winningMain: number[];
  winningSpecial: number[];
}) {
  const cfg = FLORIDA_GAMES[params.gameType as GameType];
  if (!cfg) {
    throw new Error(`Unsupported game type for scanned ticket outcomes: ${params.gameType}`);
  }
  const winningMainSet = new Set(params.winningMain);
  const winningSpecialSet = new Set(params.winningSpecial);
  const mainHits = params.mainNumbers.filter(n => winningMainSet.has(n)).length;
  const specialHits = params.specialNumbers.filter(n => winningSpecialSet.has(n)).length;
  const rewardScore = computeRewardScore(cfg, mainHits, specialHits);
  const outcomeTier = rewardTier(cfg, mainHits, specialHits, rewardScore);
  return { mainHits, specialHits, rewardScore, outcomeTier };
}

export async function getPendingScannedTicketTrainingExamplesForGame(gameType: string): Promise<Array<{
  outcomeId: number;
  features: Record<string, number>;
  rewardScore: number;
  trainingWeight: number;
}>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      outcomeId: scannedTicketOutcomes.id,
      rewardScore: scannedTicketOutcomes.rewardScore,
      trainingWeight: scannedTicketOutcomes.trainingWeight,
      features: scannedTicketFeatureSnapshots.features,
      featureSnapshotId: scannedTicketFeatureSnapshots.id,
    })
    .from(scannedTicketOutcomes)
    .innerJoin(
      scannedTicketFeatureSnapshots,
      eq(scannedTicketFeatureSnapshots.scannedTicketRowId, scannedTicketOutcomes.scannedTicketRowId)
    )
    .where(and(
      eq(scannedTicketOutcomes.gameType, gameType),
      sql`${scannedTicketOutcomes.consumedRankerVersionId} IS NULL`
    ))
    .orderBy(desc(scannedTicketFeatureSnapshots.id))
    .limit(1000);

  const byOutcome = new Map<number, {
    outcomeId: number;
    features: Record<string, number>;
    rewardScore: number;
    trainingWeight: number;
  }>();
  for (const row of rows) {
    if (byOutcome.has(row.outcomeId)) continue;
    byOutcome.set(row.outcomeId, {
      outcomeId: row.outcomeId,
      features: (row.features as Record<string, number>) || {},
      rewardScore: Number(row.rewardScore) || 0,
      trainingWeight: Number(row.trainingWeight) || 0.35,
    });
  }
  return [...byOutcome.values()];
}

export async function markScannedTicketOutcomesConsumed(
  outcomeIds: number[],
  rankerVersionId: number
): Promise<void> {
  const db = await getDb();
  if (!db || outcomeIds.length === 0) return;
  await db.update(scannedTicketOutcomes)
    .set({ consumedRankerVersionId: rankerVersionId })
    .where(inArray(scannedTicketOutcomes.id, outcomeIds));
}

export async function evaluateConfirmedScannedTicketsForDraw(
  drawId: number,
  gameType: string,
  winningMain: number[],
  winningSpecial: number[],
  rankerVersionId: number | null = null
): Promise<{ evaluatedCount: number; newOutcomes: number }> {
  const db = await getDb();
  if (!db) return { evaluatedCount: 0, newOutcomes: 0 };
  const cfg = FLORIDA_GAMES[gameType as GameType];
  if (!cfg) return { evaluatedCount: 0, newOutcomes: 0 };

  const draw = await db.select({
    id: drawResults.id,
    drawDate: drawResults.drawDate,
    drawTime: drawResults.drawTime,
  }).from(drawResults).where(eq(drawResults.id, drawId)).limit(1);
  const drawRow = draw[0];
  if (!drawRow) return { evaluatedCount: 0, newOutcomes: 0 };

  const rowsToEvaluate = await db
    .select({
      scannedTicketId: scannedTickets.id,
      scannedTicketRowId: scannedTicketRows.id,
      confirmedMainNumbers: scannedTicketRows.confirmedMainNumbers,
      confirmedSpecialNumbers: scannedTicketRows.confirmedSpecialNumbers,
      ticketOrigin: scannedTickets.ticketOrigin,
      parsedPayload: scannedTickets.parsedPayload,
      existingOutcomeId: scannedTicketOutcomes.id,
    })
    .from(scannedTicketRows)
    .innerJoin(scannedTickets, eq(scannedTickets.id, scannedTicketRows.scannedTicketId))
    .leftJoin(
      scannedTicketOutcomes,
      and(
        eq(scannedTicketOutcomes.scannedTicketRowId, scannedTicketRows.id),
        eq(scannedTicketOutcomes.drawResultId, drawId)
      )
    )
    .where(and(
      eq(scannedTicketRows.gameType, gameType),
      eq(scannedTicketRows.drawDate, Number(drawRow.drawDate)),
      eq(scannedTicketRows.drawTime, String(drawRow.drawTime || "evening")),
      eq(scannedTicketRows.rowStatus, "confirmed"),
      eq(scannedTickets.scanStatus, "confirmed"),
      eq(scannedTickets.confirmationStatus, "confirmed"),
      sql`${scannedTicketOutcomes.id} IS NULL`
    ));

  if (rowsToEvaluate.length === 0) return { evaluatedCount: 0, newOutcomes: 0 };

  const rowIds = rowsToEvaluate.map(r => r.scannedTicketRowId);
  const existingSnapshots = rowIds.length > 0
    ? await db.select({
      scannedTicketRowId: scannedTicketFeatureSnapshots.scannedTicketRowId,
    }).from(scannedTicketFeatureSnapshots).where(inArray(scannedTicketFeatureSnapshots.scannedTicketRowId, rowIds))
    : [];
  const snapshotSet = new Set(existingSnapshots.map(r => r.scannedTicketRowId));

  const featureRows: InsertScannedTicketFeatureSnapshot[] = [];
  const outcomeRows: InsertScannedTicketOutcome[] = [];

  for (const row of rowsToEvaluate) {
    const mainNumbers = parseNumberArray(row.confirmedMainNumbers);
    const specialNumbers = parseNumberArray(row.confirmedSpecialNumbers);
    if (mainNumbers.length !== cfg.mainCount) continue;
    if (cfg.specialCount > 0 && specialNumbers.length !== cfg.specialCount) continue;

    const ticketOrigin = normalizeTicketOrigin(row.ticketOrigin);
    const parsedPayload = row.parsedPayload as Record<string, unknown> | null;
    const sourceModelName = readParsedPayloadField<string>(parsedPayload, "matchedModel");
    const sourceConfidence = Number(readParsedPayloadField<number>(parsedPayload, "confidence") ?? 0.5);

    if (!snapshotSet.has(row.scannedTicketRowId)) {
      const features = await computeScannedTicketFeatureSnapshot({
        gameType,
        mainNumbers,
        specialNumbers,
        ticketOrigin,
        sourceModelName,
        sourceConfidence,
      });
      featureRows.push({
        scannedTicketRowId: row.scannedTicketRowId,
        rankerVersionId,
        featureSetVersion: RANKER_V2_FEATURE_SET,
        features,
      });
      snapshotSet.add(row.scannedTicketRowId);
    }

    const outcome = computeScannedTicketOutcome({
      gameType,
      mainNumbers,
      specialNumbers,
      winningMain,
      winningSpecial,
    });

    outcomeRows.push({
      scannedTicketId: row.scannedTicketId,
      scannedTicketRowId: row.scannedTicketRowId,
      drawResultId: drawId,
      gameType,
      mainHits: outcome.mainHits,
      specialHits: outcome.specialHits,
      rewardScore: outcome.rewardScore,
      outcomeTier: outcome.outcomeTier,
      trainingWeight: computeScannedTrainingWeight(ticketOrigin),
    });
  }

  if (featureRows.length > 0) {
    await db.insert(scannedTicketFeatureSnapshots).values(featureRows);
  }
  if (outcomeRows.length > 0) {
    await db.insert(scannedTicketOutcomes).values(outcomeRows);
  }

  console.log(
    `[ScannedTicketLearning] evaluateConfirmedScannedTicketsForDraw drawId=${drawId} gameType=${gameType} evaluated=${rowsToEvaluate.length} featureRows=${featureRows.length} outcomes=${outcomeRows.length}`
  );

  return {
    evaluatedCount: rowsToEvaluate.length,
    newOutcomes: outcomeRows.length,
  };
}
