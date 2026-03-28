import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  predictionCandidateBatches,
  predictionCandidates,
  predictionFeatureSnapshots,
  predictionOutcomes,
  scannedTicketOutcomes,
  rankerVersions,
  type InsertPredictionCandidateBatch,
  type InsertPredictionCandidate,
  type InsertPredictionFeatureSnapshot,
  type InsertPredictionOutcome,
  type InsertRankerVersion,
} from "../drizzle/schema";
import { getDb, getModelPerformanceStats, withMySqlNamedLock } from "./db";
import {
  RANKER_V2_ALGORITHM,
  RANKER_V2_FEATURE_SET,
  buildTrainingExamplesWithSourceWeights,
  computeRewardScore,
  rewardTier,
  trainOnlineLogisticRegression,
  type RankerState,
  type TrainingExample,
  getDefaultRankerState,
} from "./ranker-v2";
import { FLORIDA_GAMES, type GameType } from "../shared/lottery";
import {
  getPendingScannedTicketTrainingExamplesForGame,
  markScannedTicketOutcomesBlockedForGlobal,
  markScannedTicketOutcomesConsumed,
} from "./scanned-ticket-learning";
import {
  evaluatePromotionEligibility,
  trainPersonalRankersForDraw,
} from "./personal-ranker-db";

function extractInsertId(result: unknown): number | null {
  const candidates = [
    Number((result as any)?.insertId),
    Number((result as any)?.[0]?.insertId),
    Number((result as any)?.[0]?.[0]?.insertId),
  ];
  for (const value of candidates) {
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function describeInsertResult(result: unknown): string {
  if (Array.isArray(result)) {
    const first = result[0] as any;
    const keys = first && typeof first === "object" ? Object.keys(first).join(",") : typeof first;
    return `array(len=${result.length},firstKeys=${keys})`;
  }
  if (result && typeof result === "object") {
    return `object(keys=${Object.keys(result as Record<string, unknown>).join(",")})`;
  }
  return String(result);
}

function extractMysqlErrorCode(error: unknown): string | number | null {
  if (!error || typeof error !== "object") return null;
  return (error as any).code ?? (error as any).errno ?? null;
}

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
  const insertResult = await db.insert(rankerVersions).values({
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
  let insertedId = extractInsertId(insertResult);
  if (!insertedId) {
    const fallback = await db.select({ id: rankerVersions.id })
      .from(rankerVersions)
      .where(and(
        eq(rankerVersions.gameType, gameType),
        eq(rankerVersions.isActive, 1),
      ))
      .orderBy(desc(rankerVersions.id))
      .limit(1);
    insertedId = fallback[0]?.id ?? null;
  }
  return { ...seed, id: insertedId ?? undefined };
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
  const batchId = extractInsertId(result);
  console.log(
    `[RankerV2] createPredictionCandidateBatch userId=${data.userId ?? "null"} gameType=${data.gameType} batchId=${batchId ?? "null"} resultShape=${describeInsertResult(result)}`
  );
  return batchId;
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
  const insertedCandidateRows = await db.select({
    id: predictionCandidates.id,
  }).from(predictionCandidates)
    .where(eq(predictionCandidates.batchId, candidates[0].batchId))
    .orderBy(desc(predictionCandidates.id))
    .limit(candidates.length);

  const sortedInserted = [...insertedCandidateRows]
    .sort((a, b) => a.id - b.id);

  if (sortedInserted.length !== candidates.length) {
    console.warn(
      `[RankerV2] storePredictionCandidatesAndFeatures unexpected inserted count; batchId=${candidates[0].batchId} expected=${candidates.length} got=${sortedInserted.length} resultShape=${describeInsertResult(result)}`
    );
    return [];
  }

  const withIds = candidates.map((candidate, idx) => ({
    candidateId: sortedInserted[idx].id,
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

  console.log(
    `[RankerV2] storePredictionCandidatesAndFeatures batchId=${candidates[0].batchId} candidatesInserted=${insertRows.length} firstCandidateId=${withIds[0]?.candidateId ?? "null"} lastCandidateId=${withIds[withIds.length - 1]?.candidateId ?? "null"} featureSnapshotsInserted=${withIds.length}`
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
  return withMySqlNamedLock(
    `ranker_train:${gameType}:${drawId}`,
    10,
    async () => {
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

      const cfg = FLORIDA_GAMES[gameType as GameType];
      if (!cfg) return { candidateOutcomes: 0, trainedExamples: 0, newRankerVersionId: null };

      const winningMainSet = new Set(winningMain);
      const winningSpecialSet = new Set(winningSpecial);

      const outcomeRows: InsertPredictionOutcome[] = [];
      const candidateUpdateIds: number[] = [];
      const generatedTrainingExamples: TrainingExample[] = [];

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
        generatedTrainingExamples.push({
          features: (row.features as Record<string, number>) || {},
          rewardScore,
          sourceType: "generated_candidate",
        });
      }

      if (outcomeRows.length > 0) {
        try {
          await db.insert(predictionOutcomes).values(outcomeRows);
        } catch (error) {
          const code = extractMysqlErrorCode(error);
          if (code === "ER_DUP_ENTRY" || code === 1062) {
            console.warn(
              `[RankerV2] prediction_outcomes duplicate insert avoided drawId=${drawId} gameType=${gameType}`
            );
          } else {
            throw error;
          }
        }
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

      const generatedOnlyTraining = buildTrainingExamplesWithSourceWeights({
        generatedExamples: generatedTrainingExamples.map(example => ({
          features: example.features,
          rewardScore: example.rewardScore,
        })),
        scannedExamples: [],
      });

      if (generatedOnlyTraining.examples.length === 0) {
        const personalTrainingNoGlobal = await trainPersonalRankersForDraw({ drawId, gameType });
        console.log(
          `[RankerV2] recordCandidateOutcomesAndTrainRanker gameType=${gameType} drawId=${drawId} outcomesInserted=${outcomeRows.length} generatedExamples=0 scannedExamples=0 totalExamples=0 newRankerVersionId=null personalUsersTrained=${personalTrainingNoGlobal.usersTrained} personalExamples=${personalTrainingNoGlobal.totalExamples}`
        );
        return {
          candidateOutcomes: outcomeRows.length,
          trainedExamples: 0,
          newRankerVersionId: null,
        };
      }

      const active = await getOrCreateActiveRankerVersion(gameType);
      const trained = trainOnlineLogisticRegression(active, generatedOnlyTraining.examples);

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
        generatedCandidateExamples: generatedOnlyTraining.generatedCount,
        scannedTicketExamples: 0,
        sourceRankerVersionId: active.id,
        isActive: 1,
        notes: `Trained on draw ${drawId} with total=${generatedOnlyTraining.examples.length} generated=${generatedOnlyTraining.generatedCount} scanned=0 (personal-only scanned learning)`,
      } satisfies InsertRankerVersion);
      newRankerVersionId = extractInsertId(insertResult);

      const pendingScanned = await getPendingScannedTicketTrainingExamplesForGame(gameType);
      const promotionStatus = await evaluatePromotionEligibility(gameType);
      if (newRankerVersionId && pendingScanned.length > 0) {
        if (promotionStatus.eligible) {
          await markScannedTicketOutcomesConsumed(
            pendingScanned.map(example => example.outcomeId),
            newRankerVersionId
          );
        } else {
          await markScannedTicketOutcomesBlockedForGlobal(
            pendingScanned.map(example => example.outcomeId),
            promotionStatus.blockedReasons.join(",") || "promotion_blocked"
          );
        }
      }

      const personalTraining = await trainPersonalRankersForDraw({ drawId, gameType });
      console.log(
        `[RankerV2] recordCandidateOutcomesAndTrainRanker gameType=${gameType} drawId=${drawId} outcomesInserted=${outcomeRows.length} generatedExamples=${generatedOnlyTraining.generatedCount} scannedExamples=0 totalExamples=${generatedOnlyTraining.examples.length} newRankerVersionId=${newRankerVersionId ?? "null"} promotionEligible=${promotionStatus.eligible} personalUsersTrained=${personalTraining.usersTrained} personalExamples=${personalTraining.totalExamples} insertResultShape=${describeInsertResult(insertResult)}`
      );

      return {
        candidateOutcomes: outcomeRows.length,
        trainedExamples: generatedOnlyTraining.examples.length,
        newRankerVersionId,
      };
    },
    {
      onLockMiss: () => {
        console.warn(
          `[RankerV2] skipped recordCandidateOutcomesAndTrainRanker due to lock contention drawId=${drawId} gameType=${gameType}`
        );
      },
      fallbackResult: { candidateOutcomes: 0, trainedExamples: 0, newRankerVersionId: null },
    }
  );
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
      generatedCandidateExamples: rankerVersions.generatedCandidateExamples,
      scannedTicketExamples: rankerVersions.scannedTicketExamples,
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

export async function getRankerTrainingSourceBreakdown(gameType: string) {
  const db = await getDb();
  if (!db) {
    return {
      generatedCandidateCount: 0,
      scannedTicketCount: 0,
      pendingScannedTicketCount: 0,
    };
  }

  const generatedRows = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(predictionOutcomes)
    .where(eq(predictionOutcomes.gameType, gameType));

  const scannedRows = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(scannedTicketOutcomes)
    .where(and(
      eq(scannedTicketOutcomes.gameType, gameType),
      sql`${scannedTicketOutcomes.personalConsumedRankerVersionId} IS NOT NULL OR ${scannedTicketOutcomes.globalConsumedRankerVersionId} IS NOT NULL`,
    ));

  const pendingRows = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(scannedTicketOutcomes)
    .where(and(
      eq(scannedTicketOutcomes.gameType, gameType),
      sql`${scannedTicketOutcomes.personalConsumedRankerVersionId} IS NULL AND ${scannedTicketOutcomes.globalConsumedRankerVersionId} IS NULL`,
    ));

  const promotedRows = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(scannedTicketOutcomes)
    .where(and(
      eq(scannedTicketOutcomes.gameType, gameType),
      sql`${scannedTicketOutcomes.globalConsumedRankerVersionId} IS NOT NULL`,
    ));

  return {
    generatedCandidateCount: Number(generatedRows[0]?.count || 0),
    scannedTicketCount: Number(scannedRows[0]?.count || 0),
    pendingScannedTicketCount: Number(pendingRows[0]?.count || 0),
    promotedScannedTicketCount: Number(promotedRows[0]?.count || 0),
  };
}
