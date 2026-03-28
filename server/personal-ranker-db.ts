import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  personalRankerPromotionAudit,
  personalRankerVersions,
  scannedTicketFeatureSnapshots,
  scannedTicketOutcomes,
  type InsertPersonalRankerPromotionAudit,
  type InsertPersonalRankerVersion,
} from "../drizzle/schema";
import { getDb, withMySqlNamedLock } from "./db";
import {
  RANKER_V2_ALGORITHM,
  RANKER_V2_FEATURE_SET,
  trainOnlineLogisticRegression,
  type RankerState,
} from "./ranker-v2";

export interface PersonalRankerState extends RankerState {
  userId: number;
  isActive: number;
  sourcePersonalRankerVersionId: number | null;
}

export interface PersonalPromotionStatus {
  promotionEnabled: boolean;
  eligible: boolean;
  blockedReasons: string[];
  minOutcomes: number;
  minUsers: number;
  maxPromotedPerUser: number;
  recentOutcomes: number;
  distinctUsers: number;
  promotedExamples: number;
}

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

function toPersonalRankerState(row: {
  id: number;
  userId: number;
  gameType: string;
  algorithm: string;
  featureSetVersion: string;
  intercept: number;
  coefficients: unknown;
  learningRate: number;
  l2Lambda: number;
  trainedExamples: number;
  isActive: number;
  sourcePersonalRankerVersionId: number | null;
}): PersonalRankerState {
  return {
    id: row.id,
    userId: row.userId,
    gameType: row.gameType,
    algorithm: row.algorithm,
    featureSetVersion: row.featureSetVersion,
    intercept: Number(row.intercept) || 0,
    coefficients: (row.coefficients as Record<string, number>) || {},
    learningRate: Number(row.learningRate) || 0.05,
    l2Lambda: Number(row.l2Lambda) || 0.001,
    trainedExamples: Number(row.trainedExamples) || 0,
    isActive: Number(row.isActive) || 0,
    sourcePersonalRankerVersionId: row.sourcePersonalRankerVersionId ?? null,
  };
}

function personalSeedState(userId: number, gameType: string): PersonalRankerState {
  return {
    id: undefined,
    userId,
    gameType,
    algorithm: `${RANKER_V2_ALGORITHM}_personal`,
    featureSetVersion: RANKER_V2_FEATURE_SET,
    intercept: -0.2,
    coefficients: {
      base_confidence: 0.4,
      model_weight_prior: 0.25,
      model_avg_hits_prior: 0.2,
      odd_balance: 0.05,
      spread_norm: 0.05,
      unique_ratio: 0.1,
      source_scanned_ticket: 0.2,
      ticketOrigin_user_selected: 0.05,
      ticketOrigin_quick_pick: 0.05,
      ticketOrigin_imported_historical: 0.03,
      ticketOrigin_ai_generated_purchased: -0.03,
      insufficient_penalty: -0.2,
    },
    learningRate: 0.04,
    l2Lambda: 0.002,
    trainedExamples: 0,
    isActive: 1,
    sourcePersonalRankerVersionId: null,
  };
}

function parseIntEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] || "");
  if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  return fallback;
}

export function getPersonalizationConfig() {
  return {
    minExamplesToApply: parseIntEnv("PERSONAL_RANKER_MIN_EXAMPLES", 8),
    rampExamples: parseIntEnv("PERSONAL_RANKER_RAMP_EXAMPLES", 40),
    maxBlendWeight: Math.max(0, Math.min(1, Number(process.env.PERSONAL_RANKER_MAX_BLEND_WEIGHT || 0.35))),
    maxPerCandidateDelta: Math.max(0, Math.min(1, Number(process.env.PERSONAL_RANKER_MAX_DELTA || 0.2))),
    retrainBatchMinExamples: parseIntEnv("PERSONAL_RANKER_RETRAIN_MIN_EXAMPLES", 1),
    promotionEnabled: process.env.PERSONAL_RANKER_PROMOTION_ENABLED === "true",
    promotionMinOutcomes: parseIntEnv("PERSONAL_RANKER_PROMOTION_MIN_OUTCOMES", 250),
    promotionMinUsers: parseIntEnv("PERSONAL_RANKER_PROMOTION_MIN_USERS", 20),
    promotionMaxPerUser: parseIntEnv("PERSONAL_RANKER_PROMOTION_MAX_PER_USER", 25),
    promotionLookbackDays: parseIntEnv("PERSONAL_RANKER_PROMOTION_LOOKBACK_DAYS", 90),
  };
}

export async function getActivePersonalRankerVersion(
  userId: number,
  gameType: string
): Promise<PersonalRankerState | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({
    id: personalRankerVersions.id,
    userId: personalRankerVersions.userId,
    gameType: personalRankerVersions.gameType,
    algorithm: personalRankerVersions.algorithm,
    featureSetVersion: personalRankerVersions.featureSetVersion,
    intercept: personalRankerVersions.intercept,
    coefficients: personalRankerVersions.coefficients,
    learningRate: personalRankerVersions.learningRate,
    l2Lambda: personalRankerVersions.l2Lambda,
    trainedExamples: personalRankerVersions.trainedExamples,
    isActive: personalRankerVersions.isActive,
    sourcePersonalRankerVersionId: personalRankerVersions.sourcePersonalRankerVersionId,
  }).from(personalRankerVersions)
    .where(and(
      eq(personalRankerVersions.userId, userId),
      eq(personalRankerVersions.gameType, gameType),
      eq(personalRankerVersions.isActive, 1),
    ))
    .orderBy(desc(personalRankerVersions.id))
    .limit(1);
  if (rows.length === 0) return null;
  return toPersonalRankerState(rows[0]);
}

async function getOrCreateActivePersonalRankerVersion(
  userId: number,
  gameType: string
): Promise<PersonalRankerState> {
  const existing = await getActivePersonalRankerVersion(userId, gameType);
  if (existing) return existing;

  const db = await getDb();
  if (!db) return personalSeedState(userId, gameType);

  const seed = personalSeedState(userId, gameType);
  const insertResult = await db.insert(personalRankerVersions).values({
    userId,
    gameType,
    algorithm: seed.algorithm,
    featureSetVersion: seed.featureSetVersion,
    intercept: seed.intercept,
    coefficients: seed.coefficients,
    learningRate: seed.learningRate,
    l2Lambda: seed.l2Lambda,
    trainedExamples: seed.trainedExamples,
    generatedCandidateExamples: 0,
    scannedTicketExamples: 0,
    promotedGlobalExamples: 0,
    sourcePersonalRankerVersionId: null,
    isActive: 1,
    notes: "Initial personal ranker bootstrap",
  } satisfies InsertPersonalRankerVersion);

  const insertedId = extractInsertId(insertResult);
  return {
    ...seed,
    id: insertedId ?? undefined,
  };
}

export async function getPersonalTrainingSourceBreakdown(userId: number, gameType: string) {
  const db = await getDb();
  if (!db) {
    return {
      userId,
      gameType,
      pendingScannedExamples: 0,
      consumedScannedExamples: 0,
      latestActiveVersionId: null as number | null,
      latestActiveTrainedExamples: 0,
      latestActiveScannedExamples: 0,
      latestActivePromotedExamples: 0,
    };
  }

  const pendingRows = await db.select({ count: sql<number>`COUNT(*)` })
    .from(scannedTicketOutcomes)
    .where(and(
      eq(scannedTicketOutcomes.userId, userId),
      eq(scannedTicketOutcomes.gameType, gameType),
      sql`${scannedTicketOutcomes.personalConsumedRankerVersionId} IS NULL`
    ));

  const consumedRows = await db.select({ count: sql<number>`COUNT(*)` })
    .from(scannedTicketOutcomes)
    .where(and(
      eq(scannedTicketOutcomes.userId, userId),
      eq(scannedTicketOutcomes.gameType, gameType),
      sql`${scannedTicketOutcomes.personalConsumedRankerVersionId} IS NOT NULL`
    ));

  const active = await getActivePersonalRankerVersion(userId, gameType);
  return {
    userId,
    gameType,
    pendingScannedExamples: Number(pendingRows[0]?.count || 0),
    consumedScannedExamples: Number(consumedRows[0]?.count || 0),
    latestActiveVersionId: active?.id ?? null,
    latestActiveTrainedExamples: Number(active?.trainedExamples || 0),
    latestActiveScannedExamples: active?.id
      ? Number((await db.select({ scanned: personalRankerVersions.scannedTicketExamples })
        .from(personalRankerVersions)
        .where(eq(personalRankerVersions.id, active.id))
        .limit(1))[0]?.scanned || 0)
      : 0,
    latestActivePromotedExamples: active?.id
      ? Number((await db.select({ promoted: personalRankerVersions.promotedGlobalExamples })
        .from(personalRankerVersions)
        .where(eq(personalRankerVersions.id, active.id))
        .limit(1))[0]?.promoted || 0)
      : 0,
  };
}

export async function getPersonalRankerStatus(userId: number, gameType: string) {
  const config = getPersonalizationConfig();
  const active = await getActivePersonalRankerVersion(userId, gameType);
  const breakdown = await getPersonalTrainingSourceBreakdown(userId, gameType);
  const eligible = Number(active?.trainedExamples || 0) >= config.minExamplesToApply;
  return {
    userId,
    gameType,
    activeVersionId: active?.id ?? null,
    hasPersonalRanker: Boolean(active),
    eligible,
    trainedExamples: Number(active?.trainedExamples || 0),
    minExamplesToApply: config.minExamplesToApply,
    blend: {
      rampExamples: config.rampExamples,
      maxBlendWeight: config.maxBlendWeight,
      maxPerCandidateDelta: config.maxPerCandidateDelta,
    },
    breakdown,
  };
}

export async function evaluatePromotionEligibility(gameType: string): Promise<PersonalPromotionStatus> {
  const db = await getDb();
  const config = getPersonalizationConfig();
  if (!db) {
    return {
      promotionEnabled: config.promotionEnabled,
      eligible: false,
      blockedReasons: ["database_unavailable"],
      minOutcomes: config.promotionMinOutcomes,
      minUsers: config.promotionMinUsers,
      maxPromotedPerUser: config.promotionMaxPerUser,
      recentOutcomes: 0,
      distinctUsers: 0,
      promotedExamples: 0,
    };
  }

  const lookback = new Date(Date.now() - config.promotionLookbackDays * 24 * 60 * 60 * 1000);
  const rows = await db.select({
    recentOutcomes: sql<number>`COUNT(*)`,
    distinctUsers: sql<number>`COUNT(DISTINCT ${scannedTicketOutcomes.userId})`,
    promotedExamples: sql<number>`SUM(CASE WHEN ${scannedTicketOutcomes.globalPromotionStatus}='promoted' THEN 1 ELSE 0 END)`,
  }).from(scannedTicketOutcomes)
    .where(and(
      eq(scannedTicketOutcomes.gameType, gameType),
      gte(scannedTicketOutcomes.evaluatedAt, lookback),
    ));

  const row = rows[0] || { recentOutcomes: 0, distinctUsers: 0, promotedExamples: 0 };
  const recentOutcomes = Number(row.recentOutcomes || 0);
  const distinctUsers = Number(row.distinctUsers || 0);
  const promotedExamples = Number(row.promotedExamples || 0);

  const blockedReasons: string[] = [];
  if (!config.promotionEnabled) blockedReasons.push("promotion_disabled");
  if (recentOutcomes < config.promotionMinOutcomes) blockedReasons.push("insufficient_outcomes");
  if (distinctUsers < config.promotionMinUsers) blockedReasons.push("insufficient_users");

  return {
    promotionEnabled: config.promotionEnabled,
    eligible: blockedReasons.length === 0,
    blockedReasons,
    minOutcomes: config.promotionMinOutcomes,
    minUsers: config.promotionMinUsers,
    maxPromotedPerUser: config.promotionMaxPerUser,
    recentOutcomes,
    distinctUsers,
    promotedExamples,
  };
}

export async function trainPersonalRankerForUser(params: {
  drawId: number;
  userId: number;
  gameType: string;
}) {
  return withMySqlNamedLock(
    `personal_ranker:${params.userId}:${params.gameType}:${params.drawId}`,
    10,
    async () => {
      const db = await getDb();
      if (!db) {
        return {
          trainedExamples: 0,
          newPersonalRankerVersionId: null as number | null,
          consumedOutcomeIds: [] as number[],
          promotedOutcomeIds: [] as number[],
        };
      }

      const config = getPersonalizationConfig();
      const pendingRows = await db.select({
        outcomeId: scannedTicketOutcomes.id,
        rewardScore: scannedTicketOutcomes.rewardScore,
        trainingWeight: scannedTicketOutcomes.trainingWeight,
        features: scannedTicketFeatureSnapshots.features,
      }).from(scannedTicketOutcomes)
        .innerJoin(
          scannedTicketFeatureSnapshots,
          eq(scannedTicketFeatureSnapshots.scannedTicketRowId, scannedTicketOutcomes.scannedTicketRowId)
        )
        .where(and(
          eq(scannedTicketOutcomes.userId, params.userId),
          eq(scannedTicketOutcomes.gameType, params.gameType),
          sql`${scannedTicketOutcomes.personalConsumedRankerVersionId} IS NULL`
        ))
        .orderBy(desc(scannedTicketOutcomes.id))
        .limit(500);

      if (pendingRows.length < config.retrainBatchMinExamples) {
        return {
          trainedExamples: 0,
          newPersonalRankerVersionId: null,
          consumedOutcomeIds: [] as number[],
          promotedOutcomeIds: [] as number[],
        };
      }

      const active = await getOrCreateActivePersonalRankerVersion(params.userId, params.gameType);
      const training = pendingRows
        .filter(row => row.features && typeof row.features === "object")
        .map(row => ({
          outcomeId: row.outcomeId,
          features: (row.features as Record<string, number>) || {},
          rewardScore: Number(row.rewardScore) || 0,
          trainingWeight: Math.max(0.01, Math.min(1, Number(row.trainingWeight) || 0.35)),
        }));

      if (training.length === 0) {
        return {
          trainedExamples: 0,
          newPersonalRankerVersionId: null,
          consumedOutcomeIds: [] as number[],
          promotedOutcomeIds: [] as number[],
        };
      }

      const trained = trainOnlineLogisticRegression(active, training.map(row => ({
        features: row.features,
        rewardScore: row.rewardScore,
        sourceType: "scanned_ticket" as const,
        trainingWeight: row.trainingWeight,
      })));

      if (active.id) {
        await db.update(personalRankerVersions)
          .set({ isActive: 0 })
          .where(eq(personalRankerVersions.id, active.id));
      }

      const promotionStatus = await evaluatePromotionEligibility(params.gameType);
      const promotedOutcomeIds: number[] = [];
      if (promotionStatus.eligible) {
        const userPromotedRows = await db.select({ count: sql<number>`COUNT(*)` })
          .from(scannedTicketOutcomes)
          .where(and(
            eq(scannedTicketOutcomes.userId, params.userId),
            eq(scannedTicketOutcomes.gameType, params.gameType),
            eq(scannedTicketOutcomes.globalPromotionStatus, "promoted")
          ));
        const alreadyPromoted = Number(userPromotedRows[0]?.count || 0);
        const remainingSlots = Math.max(0, promotionStatus.maxPromotedPerUser - alreadyPromoted);
        if (remainingSlots > 0) {
          const promotable = training
            .slice(0, remainingSlots)
            .map(row => row.outcomeId);
          if (promotable.length > 0) {
            promotedOutcomeIds.push(...promotable);
          }
        }
      }

      const insertResult = await db.insert(personalRankerVersions).values({
        userId: params.userId,
        gameType: trained.gameType,
        algorithm: trained.algorithm,
        featureSetVersion: trained.featureSetVersion,
        intercept: trained.intercept,
        coefficients: trained.coefficients,
        learningRate: trained.learningRate,
        l2Lambda: trained.l2Lambda,
        trainedExamples: trained.trainedExamples,
        generatedCandidateExamples: 0,
        scannedTicketExamples: training.length,
        promotedGlobalExamples: promotedOutcomeIds.length,
        sourcePersonalRankerVersionId: active.id ?? null,
        isActive: 1,
        notes: `Personal training draw=${params.drawId} scanned=${training.length} promoted=${promotedOutcomeIds.length}`,
      } satisfies InsertPersonalRankerVersion);
      const newId = extractInsertId(insertResult);

      if (newId) {
        const outcomeIds = training.map(row => row.outcomeId);
        const promotedIdSql = promotedOutcomeIds.length > 0
          ? sql.join(promotedOutcomeIds.map(id => sql`${id}`), sql`,`)
          : null;
        const promotionStatusSql = promotedIdSql
          ? sql`CASE WHEN ${scannedTicketOutcomes.id} IN (${promotedIdSql}) THEN 'promoted' ELSE 'blocked' END`
          : sql`'blocked'`;
        const promotionReasonSql = promotedIdSql
          ? sql`CASE WHEN ${scannedTicketOutcomes.id} IN (${promotedIdSql}) THEN NULL ELSE 'policy_blocked_or_cap' END`
          : sql`'policy_blocked_or_cap'`;
        await db.update(scannedTicketOutcomes)
          .set({
            personalConsumedRankerVersionId: newId,
            globalPromotionStatus: promotionStatusSql,
            promotionBlockedReason: promotionReasonSql,
          })
          .where(inArray(scannedTicketOutcomes.id, outcomeIds));

        await db.insert(personalRankerPromotionAudit).values({
          gameType: params.gameType,
          userId: params.userId,
          personalRankerVersionId: newId,
          promotionStatus: promotionStatus.eligible ? "promoted" : "blocked",
          blockedReason: promotionStatus.eligible ? null : promotionStatus.blockedReasons.join(","),
          evaluatedOutcomeCount: training.length,
          promotedOutcomeCount: promotedOutcomeIds.length,
          policySnapshot: promotionStatus as unknown as Record<string, unknown>,
        } satisfies InsertPersonalRankerPromotionAudit);
      }

      console.log(
        `[PersonalRanker] train userId=${params.userId} gameType=${params.gameType} drawId=${params.drawId} trained=${training.length} newVersion=${newId ?? "null"} promoted=${promotedOutcomeIds.length}`
      );

      return {
        trainedExamples: training.length,
        newPersonalRankerVersionId: newId ?? null,
        consumedOutcomeIds: training.map(row => row.outcomeId),
        promotedOutcomeIds,
      };
    },
    {
      onLockMiss: () => {
        console.warn(
          `[PersonalRanker] skipped trainPersonalRankerForUser due to lock contention userId=${params.userId} gameType=${params.gameType} drawId=${params.drawId}`
        );
      },
      fallbackResult: {
        trainedExamples: 0,
        newPersonalRankerVersionId: null as number | null,
        consumedOutcomeIds: [] as number[],
        promotedOutcomeIds: [] as number[],
      },
    }
  );
}

export async function trainPersonalRankersForDraw(params: {
  drawId: number;
  gameType: string;
}) {
  const db = await getDb();
  if (!db) {
    return {
      usersTrained: 0,
      totalExamples: 0,
      newVersionIds: [] as number[],
    };
  }
  const userRows = await db.select({
    userId: scannedTicketOutcomes.userId,
  }).from(scannedTicketOutcomes)
    .where(and(
      eq(scannedTicketOutcomes.gameType, params.gameType),
      sql`${scannedTicketOutcomes.personalConsumedRankerVersionId} IS NULL`
    ))
    .groupBy(scannedTicketOutcomes.userId);

  let usersTrained = 0;
  let totalExamples = 0;
  const newVersionIds: number[] = [];
  for (const row of userRows) {
    const userId = Number(row.userId || 0);
    if (!userId) continue;
    const result = await trainPersonalRankerForUser({
      drawId: params.drawId,
      userId,
      gameType: params.gameType,
    });
    if (result.trainedExamples > 0) {
      usersTrained++;
      totalExamples += result.trainedExamples;
      if (result.newPersonalRankerVersionId) {
        newVersionIds.push(result.newPersonalRankerVersionId);
      }
    }
  }

  return {
    usersTrained,
    totalExamples,
    newVersionIds,
  };
}

export async function getPromotableScannedTicketExamplesForGame(gameType: string): Promise<Array<{
  outcomeId: number;
  userId: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    outcomeId: scannedTicketOutcomes.id,
    userId: scannedTicketOutcomes.userId,
  }).from(scannedTicketOutcomes)
    .where(and(
      eq(scannedTicketOutcomes.gameType, gameType),
      eq(scannedTicketOutcomes.globalPromotionStatus, "promoted"),
      sql`${scannedTicketOutcomes.globalConsumedRankerVersionId} IS NULL`
    ))
    .orderBy(desc(scannedTicketOutcomes.id))
    .limit(5000);
  return rows.map(row => ({
    outcomeId: Number(row.outcomeId) || 0,
    userId: Number(row.userId) || 0,
  })).filter(row => row.outcomeId > 0 && row.userId > 0);
}

export async function markScannedTicketOutcomesConsumedForGlobal(
  outcomeIds: number[],
  globalRankerVersionId: number
): Promise<void> {
  const db = await getDb();
  if (!db || outcomeIds.length === 0) return;
  await db.update(scannedTicketOutcomes)
    .set({
      consumedRankerVersionId: globalRankerVersionId,
      globalConsumedRankerVersionId: globalRankerVersionId,
      promotionBlockedReason: null,
    })
    .where(inArray(scannedTicketOutcomes.id, outcomeIds));
}
