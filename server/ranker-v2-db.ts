import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  predictionCandidateBatches,
  predictionCandidates,
  predictionFeatureSnapshots,
  predictionOutcomes,
  rankerVersions,
  type InsertPredictionCandidateBatch,
  type InsertPredictionCandidate,
  type InsertPredictionFeatureSnapshot,
  type InsertPredictionOutcome,
  type InsertRankerVersion,
} from "../drizzle/schema";
import { getDb, getModelPerformanceStats } from "./db";
import {
  RANKER_V2_ALGORITHM,
  RANKER_V2_FEATURE_SET,
  computeRewardScore,
  rewardTier,
  trainOnlineLogisticRegression,
  type RankerState,
  type TrainingExample,
  getDefaultRankerState,
} from "./ranker-v2";
import { FLORIDA_GAMES, type GameType } from "../shared/lottery";

function toRankerState(row: {
  id: number;
  gameType: string;
  algorithm: string;
  featureSetVersion: string;
  intercept: number;
  coefficients: unknown;
  learningRate: number;
  l2Lambda: number;
  trainedExamples: number;
}): RankerState {
  return {
    id: row.id,
    gameType: row.gameType,
    algorithm: row.algorithm,
    featureSetVersion: row.featureSetVersion,
    intercept: Number(row.intercept) || 0,
    coefficients: (row.coefficients as Record<string, number>) || {},
    learningRate: Number(row.learningRate) || 0.05,
    l2Lambda: Number(row.l2Lambda) || 0.001,
    trainedExamples: Number(row.trainedExamples) || 0,
  };
}

export async function getOrCreateActiveRankerVersion(gameType: string): Promise<RankerState> {
  const db = await getDb();
  if (!db) return getDefaultRankerState(gameType);

  const existing = await db
    .select({
      id: rankerVersions.id,
      gameType: rankerVersions.gameType,
      algorithm: rankerVersions.algorithm,
      featureSetVersion: rankerVersions.featureSetVersion,
      intercept: rankerVersions.intercept,
      coefficients: rankerVersions.coefficients,
      learningRate: rankerVersions.learningRate,
      l2Lambda: rankerVersions.l2Lambda,
      trainedExamples: rankerVersions.trainedExamples,
    })
    .from(rankerVersions)
    .where(and(eq(rankerVersions.gameType, gameType), eq(rankerVersions.isActive, 1)))
    .orderBy(desc(rankerVersions.id))
    .limit(1);

  if (existing.length > 0) return toRankerState(existing[0]);

  const seed = getDefaultRankerState(gameType);
  const [insertResult] = await db.insert(rankerVersions).values({
    gameType,
    algorithm: seed.algorithm,
    featureSetVersion: seed.featureSetVersion,
    intercept: seed.intercept,
    coefficients: seed.coefficients,
    learningRate: seed.learningRate,
    l2Lambda: seed.l2Lambda,
    trainedExamples: seed.trainedExamples,
    isActive: 1,
    notes: "Initial V2 ranker bootstrap",
  } satisfies InsertRankerVersion);

  return { ...seed, id: Number((insertResult as any)?.insertId || 0) || undefined };
}

export async function getModelAverageHitsMap(gameType: string): Promise<Record<string, number>> {
  const stats = await getModelPerformanceStats(gameType);
  const result: Record<string, number> = {};
  for (const row of stats) {
    result[row.modelName] = Number(row.avgMainHits) || 0;
  }
  return result;
}

export async function createPredictionCandidateBatch(
  data: InsertPredictionCandidateBatch
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(predictionCandidateBatches).values(data);
  return Number((result as any)?.insertId || 0) || null;
}

export interface StoredCandidateInput {
  userId: number | null;
  gameType: string;
  modelName: string;
  candidateKey: string;
  mainNumbers: number[];
  specialNumbers: number[];
  baseConfidenceScore: number;
  rankerScore: number;
  rankerProbability: number;
  rankPosition: number;
  selectedForFinal: boolean;
  isInsufficientData: boolean;
  metadata: Record<string, unknown>;
  featureSetVersion: string;
  features: Record<string, number>;
  rankerVersionId: number | null;
  batchId: number;
}

export async function storePredictionCandidatesAndFeatures(
  candidates: StoredCandidateInput[]
): Promise<Array<{ candidateId: number; features: Record<string, number> }>> {
  const db = await getDb();
  if (!db || candidates.length === 0) return [];

  const insertRows = candidates.map(c => ({
    batchId: c.batchId,
    rankerVersionId: c.rankerVersionId,
    userId: c.userId,
    gameType: c.gameType,
    modelName: c.modelName,
    candidateKey: c.candidateKey,
    mainNumbers: c.mainNumbers,
    specialNumbers: c.specialNumbers,
    baseConfidenceScore: c.baseConfidenceScore,
    rankerScore: c.rankerScore,
    rankerProbability: c.rankerProbability,
    rankPosition: c.rankPosition,
    selectedForFinal: c.selectedForFinal ? 1 : 0,
    isInsufficientData: c.isInsufficientData ? 1 : 0,
    metadata: c.metadata,
  } satisfies InsertPredictionCandidate));

  const result = await db.insert(predictionCandidates).values(insertRows);
  const firstId = Number((result as any)?.insertId || 0);
  if (!firstId) return [];

  const withIds = candidates.map((candidate, idx) => ({
    candidateId: firstId + idx,
    featureSetVersion: candidate.featureSetVersion,
    features: candidate.features,
  }));

  await db.insert(predictionFeatureSnapshots).values(
    withIds.map(row => ({
      candidateId: row.candidateId,
      featureSetVersion: row.featureSetVersion,
      features: row.features,
    } satisfies InsertPredictionFeatureSnapshot))
  );

  return withIds.map(row => ({ candidateId: row.candidateId, features: row.features }));
}

interface CandidateEvalRow {
  candidateId: number;
  gameType: string;
  mainNumbers: unknown;
  specialNumbers: unknown;
  rankerVersionId: number | null;
  features: unknown;
}

function toArrayNumbers(value: unknown): number[] {
  return Array.isArray(value) ? value.map(v => Number(v)).filter(v => Number.isFinite(v)) : [];
}

export async function recordCandidateOutcomesAndTrainRanker(
  drawId: number,
  gameType: string,
  winningMain: number[],
  winningSpecial: number[]
): Promise<{ candidateOutcomes: number; trainedExamples: number; newRankerVersionId: number | null }> {
  const db = await getDb();
  if (!db) return { candidateOutcomes: 0, trainedExamples: 0, newRankerVersionId: null };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const candidateRows = await db
    .select({
      candidateId: predictionCandidates.id,
      gameType: predictionCandidates.gameType,
      mainNumbers: predictionCandidates.mainNumbers,
      specialNumbers: predictionCandidates.specialNumbers,
      rankerVersionId: predictionCandidates.rankerVersionId,
      features: predictionFeatureSnapshots.features,
    })
    .from(predictionCandidates)
    .innerJoin(
      predictionFeatureSnapshots,
      eq(predictionFeatureSnapshots.candidateId, predictionCandidates.id)
    )
    .where(and(
      eq(predictionCandidates.gameType, gameType),
      gte(predictionCandidates.createdAt, sevenDaysAgo),
      sql`${predictionCandidates.evaluatedDrawResultId} IS NULL`,
    ))
    .orderBy(desc(predictionCandidates.createdAt))
    .limit(500) as CandidateEvalRow[];

  if (candidateRows.length === 0) {
    return { candidateOutcomes: 0, trainedExamples: 0, newRankerVersionId: null };
  }

  const cfg = FLORIDA_GAMES[gameType as GameType];
  if (!cfg) {
    return { candidateOutcomes: 0, trainedExamples: 0, newRankerVersionId: null };
  }

  const winningMainSet = new Set(winningMain);
  const winningSpecialSet = new Set(winningSpecial);

  const outcomeRows: InsertPredictionOutcome[] = [];
  const candidateUpdateIds: number[] = [];
  const trainingExamples: TrainingExample[] = [];

  for (const row of candidateRows) {
    const main = toArrayNumbers(row.mainNumbers);
    const special = toArrayNumbers(row.specialNumbers);
    const mainHits = main.filter(n => winningMainSet.has(n)).length;
    const specialHits = special.filter(n => winningSpecialSet.has(n)).length;
    const rewardScore = computeRewardScore(cfg, mainHits, specialHits);
    const outcomeTier = rewardTier(cfg, mainHits, specialHits, rewardScore);

    outcomeRows.push({
      candidateId: row.candidateId,
      drawResultId: drawId,
      gameType,
      rankerVersionId: row.rankerVersionId,
      mainHits,
      specialHits,
      rewardScore,
      outcomeTier,
    });
    candidateUpdateIds.push(row.candidateId);
    trainingExamples.push({
      features: (row.features as Record<string, number>) || {},
      rewardScore,
    });
  }

  if (outcomeRows.length > 0) {
    await db.insert(predictionOutcomes).values(outcomeRows);
  }

  if (candidateUpdateIds.length > 0) {
    await db.update(predictionCandidates)
      .set({
        evaluatedDrawResultId: drawId,
        rewardScore: sql`(
          SELECT po.rewardScore
          FROM prediction_outcomes po
          WHERE po.candidateId = ${predictionCandidates.id}
          ORDER BY po.id DESC
          LIMIT 1
        )`,
      })
      .where(inArray(predictionCandidates.id, candidateUpdateIds));
  }

  const active = await getOrCreateActiveRankerVersion(gameType);
  const trained = trainOnlineLogisticRegression(active, trainingExamples);

  let newRankerVersionId: number | null = null;
  if (active.id) {
    await db.update(rankerVersions)
      .set({ isActive: 0 })
      .where(eq(rankerVersions.id, active.id));
  }

  const insertResult = await db.insert(rankerVersions).values({
    gameType: trained.gameType,
    algorithm: trained.algorithm,
    featureSetVersion: trained.featureSetVersion,
    intercept: trained.intercept,
    coefficients: trained.coefficients,
    learningRate: trained.learningRate,
    l2Lambda: trained.l2Lambda,
    trainedExamples: trained.trainedExamples,
    sourceRankerVersionId: active.id,
    isActive: 1,
    notes: `Trained on draw ${drawId} with ${trainingExamples.length} examples`,
  } satisfies InsertRankerVersion);
  newRankerVersionId = Number((insertResult as any)?.insertId || 0) || null;

  return {
    candidateOutcomes: outcomeRows.length,
    trainedExamples: trainingExamples.length,
    newRankerVersionId,
  };
}

export async function getRankerVersionsByGame(gameType: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: rankerVersions.id,
      gameType: rankerVersions.gameType,
      algorithm: rankerVersions.algorithm,
      featureSetVersion: rankerVersions.featureSetVersion,
      intercept: rankerVersions.intercept,
      coefficients: rankerVersions.coefficients,
      learningRate: rankerVersions.learningRate,
      l2Lambda: rankerVersions.l2Lambda,
      trainedExamples: rankerVersions.trainedExamples,
      sourceRankerVersionId: rankerVersions.sourceRankerVersionId,
      isActive: rankerVersions.isActive,
      notes: rankerVersions.notes,
      createdAt: rankerVersions.createdAt,
    })
    .from(rankerVersions)
    .where(eq(rankerVersions.gameType, gameType))
    .orderBy(desc(rankerVersions.createdAt))
    .limit(limit);
}

export async function getPredictionCandidateBatchesByUser(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(predictionCandidateBatches)
    .where(eq(predictionCandidateBatches.userId, userId))
    .orderBy(desc(predictionCandidateBatches.createdAt))
    .limit(limit);
}

export async function getPredictionOutcomesByGame(gameType: string, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(predictionOutcomes)
    .where(eq(predictionOutcomes.gameType, gameType))
    .orderBy(desc(predictionOutcomes.evaluatedAt))
    .limit(limit);
}
