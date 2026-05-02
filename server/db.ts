import { eq, desc, and, sql, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  drawResults, InsertDrawResult,
  predictions, InsertPrediction,
  ticketSelections, InsertTicketSelection,
  modelPerformance, InsertModelPerformance,
  favorites, InsertFavorite,
  pushSubscriptions, InsertPushSubscription,
  pdfUploads, InsertPdfUpload,
  purchasedTickets, InsertPurchasedTicket,
  personalizationMetrics, InsertPersonalizationMetric,
  autoFetchRuns, AutoFetchRun,
  predictionLearningMetrics,
} from "../drizzle/schema";
import { appEvents } from "./db/schema/appEvents";
import { ENV } from './_core/env';
import { FLORIDA_GAMES, type GameType } from '@shared/lottery';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── User queries ───────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot get user: database not available"); return undefined; }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot get user: database not available"); return undefined; }
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUser(data: {
  openId: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string | null;
  role: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(users).values({
    openId: data.openId,
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    passwordSalt: data.passwordSalt ?? undefined,
    role: data.role as "user" | "admin",
    loginMethod: "email",
  });
  const result = await db.select().from(users).where(eq(users.openId, data.openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  return result[0]?.count ?? 0;
}

// ─── Draw Results ───────────────────────────────────────────────────────────────

/** Check if a draw result already exists (same game, date, numbers, and draw time) */
export async function drawResultExists(
  gameType: string,
  drawDate: number,
  mainNumbers: number[],
  drawTime?: string | null
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  // Allow a 24-hour window for date matching (timestamps may differ slightly)
  const dayStart = drawDate - (drawDate % 86400000);
  const dayEnd = dayStart + 86400000;
  
  const conditions = [
    eq(drawResults.gameType, gameType),
    gte(drawResults.drawDate, dayStart),
    sql`${drawResults.drawDate} < ${dayEnd}`,
  ];
  
  if (drawTime) {
    conditions.push(eq(drawResults.drawTime, drawTime));
  }
  
  const existing = await db.select({ id: drawResults.id, mainNumbers: drawResults.mainNumbers })
    .from(drawResults)
    .where(and(...conditions))
    .limit(10);
  
  // Check if any existing row has the same main numbers
  const sortedNew = [...mainNumbers].sort((a, b) => a - b).join(",");
  return existing.some(row => {
    const rowNums = row.mainNumbers as number[];
    return [...rowNums].sort((a, b) => a - b).join(",") === sortedNew;
  });
}

export async function insertDrawResult(data: InsertDrawResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check for duplicates before inserting
  const exists = await drawResultExists(
    data.gameType,
    data.drawDate as number,
    data.mainNumbers as number[],
    data.drawTime
  );
  
  if (exists) {
    const legacyRow = { insertId: 0 };
    return {
      status: "duplicate" as const,
      insertId: 0,
      legacyResult: [legacyRow],
      0: legacyRow,
    };
  }

  const result = await db.insert(drawResults).values(data);
  const insertId = Number((result as any)?.[0]?.insertId ?? 0);
  const legacyRow = { insertId };
  return {
    status: "inserted" as const,
    insertId,
    legacyResult: [legacyRow],
    0: legacyRow,
  };
}

export async function getDrawResults(gameType: string, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(drawResults)
    .where(eq(drawResults.gameType, gameType))
    .orderBy(desc(drawResults.drawDate))
    .limit(limit);
}

export async function getLatestDrawResults(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(drawResults)
    .orderBy(desc(drawResults.drawDate))
    .limit(limit);
}

export async function getAllDrawResults(limit = 500) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(drawResults)
    .orderBy(desc(drawResults.drawDate))
    .limit(limit);
}

/** Get the count of draw results for a game type */
export async function getDrawResultCount(gameType: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`COUNT(*)` })
    .from(drawResults)
    .where(eq(drawResults.gameType, gameType));
  return result[0]?.count ?? 0;
}

/** Get draw counts grouped by drawTime for a specific game (used for Cash Pop coverage). */
export async function getDrawResultCountByDrawTime(gameType: string): Promise<Array<{ drawTime: string; count: number }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    drawTime: drawResults.drawTime,
    count: sql<number>`COUNT(*)`,
  })
    .from(drawResults)
    .where(eq(drawResults.gameType, gameType))
    .groupBy(drawResults.drawTime);
  return rows.map(r => ({ drawTime: r.drawTime || "unknown", count: Number(r.count) || 0 }));
}

// ─── Predictions ────────────────────────────────────────────────────────────────
export async function insertPredictions(data: InsertPrediction[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return;
  await db.insert(predictions).values(data);
}

export async function getUserPredictions(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(predictions)
    .where(eq(predictions.userId, userId))
    .orderBy(desc(predictions.createdAt))
    .limit(limit);
}

export async function getRecentPredictions(gameType: string, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(predictions)
    .where(eq(predictions.gameType, gameType))
    .orderBy(desc(predictions.createdAt))
    .limit(limit);
}

// ─── Ticket Selections ─────────────────────────────────────────────────────────
export async function insertTicketSelection(data: InsertTicketSelection) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(ticketSelections).values(data);
}

export async function getUserTicketSelections(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ticketSelections)
    .where(eq(ticketSelections.userId, userId))
    .orderBy(desc(ticketSelections.createdAt))
    .limit(limit);
}

// ─── Model Performance ─────────────────────────────────────────────────────────
export async function insertModelPerformance(data: InsertModelPerformance[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return;
  await db.insert(modelPerformance).values(data);
}

export async function getModelPerformanceStats(gameType: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    modelName: modelPerformance.modelName,
    totalPredictions: sql<number>`COUNT(*)`,
    avgMainHits: sql<number>`AVG(${modelPerformance.mainHits})`,
    avgSpecialHits: sql<number>`AVG(${modelPerformance.specialHits})`,
    maxMainHits: sql<number>`MAX(${modelPerformance.mainHits})`,
  }).from(modelPerformance)
    .where(eq(modelPerformance.gameType, gameType))
    .groupBy(modelPerformance.modelName);
}

/**
 * Calculate model weights based on historical accuracy.
 * Returns a map of modelName -> weight (0-1, higher = better).
 * Models with no performance data get a default weight of 0.5.
 */
// Simple TTL cache for model weights.
// Weights change only when new evaluations are written (after draws).
// 5-minute TTL is safe — weight changes are not time-critical.
const modelWeightsCache = new Map<string, {
  weights: Record<string, number>;
  cachedAt: number;
}>();
const MODEL_WEIGHTS_TTL_MS = 5 * 60 * 1000; // 5 minutes

// PERSONALIZATION LOOP: Personal accuracy (60%) blended with
// global accuracy (40%) when >= 5 user events exist.
// Threshold and blend ratio are tunable — do not hardcode elsewhere.
export async function getModelWeights(gameType: string, userId?: number): Promise<Record<string, number>> {
  const cacheKey = userId != null ? `${gameType}:${userId}` : gameType;

  // Check cache first
  const cached = modelWeightsCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < MODEL_WEIGHTS_TTL_MS) {
    return cached.weights;
  }

  const stats = await getModelPerformanceStats(gameType);
  const globalWeights: Record<string, number> = {};

  if (stats.length === 0) {
    modelWeightsCache.set(cacheKey, { weights: globalWeights, cachedAt: Date.now() });
    return globalWeights; // empty = use defaults
  }

  // Find the max average hits for normalization
  const maxAvg = Math.max(...stats.map(s => Number(s.avgMainHits) || 0), 0.001);

  for (const s of stats) {
    const avg = Number(s.avgMainHits) || 0;
    const total = Number(s.totalPredictions) || 0;
    // Weight = normalized accuracy * confidence factor (more data = more confidence)
    const accuracyNorm = avg / maxAvg;
    const confidenceFactor = Math.min(total / 10, 1); // full confidence after 10 evaluations
    globalWeights[s.modelName] = 0.3 + 0.7 * accuracyNorm * confidenceFactor; // floor at 0.3
  }

  // No userId — return global weights unchanged (no regression)
  if (userId == null) {
    modelWeightsCache.set(cacheKey, { weights: globalWeights, cachedAt: Date.now() });
    return globalWeights;
  }

  // Personalization path: blend personal accuracy history with global weights
  const db = await getDb();
  if (!db) {
    return globalWeights; // DB unavailable — fall back gracefully
  }

  const userEvents = await db.select()
    .from(appEvents)
    .where(and(
      eq(appEvents.event_type, "prediction_accuracy_calculated"),
      eq(appEvents.user_id, userId),
    ))
    .orderBy(desc(appEvents.occurred_at))
    .limit(50);

  if (userEvents.length < 5) {
    // Not enough personal data — return global weights only
    modelWeightsCache.set(cacheKey, { weights: globalWeights, cachedAt: Date.now() });
    return globalWeights;
  }

  // Aggregate per-model accuracy scores from personal events
  const personalScores: Record<string, { total: number; count: number }> = {};
  for (const event of userEvents) {
    const payload = event.payload as { model_scores?: Record<string, number> } | null;
    if (!payload?.model_scores) continue;
    for (const [model, score] of Object.entries(payload.model_scores)) {
      if (!personalScores[model]) personalScores[model] = { total: 0, count: 0 };
      personalScores[model].total += score;
      personalScores[model].count++;
    }
  }

  // Blend: personal 60% + global 40%, then normalize to sum to 1.0
  const blended: Record<string, number> = {};
  for (const model of Object.keys(globalWeights)) {
    const personal = personalScores[model]
      ? personalScores[model].total / personalScores[model].count
      : 0;
    blended[model] = personal * 0.6 + globalWeights[model] * 0.4;
  }

  const weightSum = Object.values(blended).reduce((a, b) => a + b, 0);
  if (weightSum > 0) {
    for (const model of Object.keys(blended)) {
      blended[model] /= weightSum;
    }
  }

  modelWeightsCache.set(cacheKey, { weights: blended, cachedAt: Date.now() });
  return blended;
}

/** Recent prediction accuracy events used to adapt explainable scoring factor weights. */
export async function getRecentPredictionLearningEvents(
  gameType: string,
  userId?: number,
  limit = 200,
) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    eq(appEvents.event_type, "prediction_accuracy_calculated"),
    sql`JSON_UNQUOTE(JSON_EXTRACT(${appEvents.payload}, '$.game')) = ${gameType}`,
  ];
  if (userId != null) {
    conditions.push(eq(appEvents.user_id, userId));
  }

  return db.select({ payload: appEvents.payload })
    .from(appEvents)
    .where(and(...conditions))
    .orderBy(desc(appEvents.occurred_at))
    .limit(limit);
}

type LearningMetricType = "factor" | "model";

export function buildLearningRollupsFromAccuracyPayloads(
  payloads: Array<{
    game?: string;
    factor_snapshot?: Record<string, number>;
    model_scores?: Record<string, number>;
    match_ratio?: number;
  }>,
) {
  const factorAgg = new Map<string, { total: number; count: number }>();
  const modelAgg = new Map<string, { total: number; count: number }>();
  const add = (
    map: Map<string, { total: number; count: number }>,
    key: string,
    value: number,
  ) => {
    const row = map.get(key) ?? { total: 0, count: 0 };
    row.total += value;
    row.count += 1;
    map.set(key, row);
  };

  for (const payload of payloads) {
    const game = payload.game;
    if (!game) continue;
    const matchRatio = typeof payload.match_ratio === "number" ? payload.match_ratio : 0;

    if (payload.factor_snapshot) {
      for (const [factor, factorValue] of Object.entries(payload.factor_snapshot)) {
        if (typeof factorValue !== "number") continue;
        add(factorAgg, `${game}|${factor}`, factorValue * matchRatio);
      }
    }
    if (payload.model_scores) {
      for (const [modelName, modelScore] of Object.entries(payload.model_scores)) {
        if (typeof modelScore !== "number") continue;
        add(modelAgg, `${game}|${modelName}`, modelScore);
      }
    }
  }

  return { factorAgg, modelAgg };
}

// One-shot warning flag for the entire process. The prediction_learning_metrics
// table is intentionally absent in some environments (notably the production
// Railway MySQL DB while migration 0012 is still pending), and on every
// generatePredictions call we fan out 2–4 reads + 1 conditional write against
// it. Without this flag we'd spam the log on every request.
let _warnedMissingPredictionLearningMetrics = false;

/**
 * Detect the mysql2 ER_NO_SUCH_TABLE for prediction_learning_metrics by walking
 * the .cause chain. Drizzle wraps driver errors at least once, sometimes twice
 * depending on transaction context, so we walk up to 8 levels deep before
 * giving up and treating it as an unrelated error.
 *
 * Matches on either `code === 'ER_NO_SUCH_TABLE'` or `errno === 1146` so we
 * remain resilient if a future driver upgrade only carries one of the two.
 * The table-name check keeps us from accidentally swallowing a missing-table
 * error from some other table that should be loud.
 */
function isMissingPredictionLearningMetricsTable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (typeof current === "object" && current !== null) {
      const e = current as { code?: unknown; errno?: unknown; sqlMessage?: unknown; message?: unknown; cause?: unknown };
      const codeMatch = e.code === "ER_NO_SUCH_TABLE";
      const errnoMatch = e.errno === 1146;
      if (codeMatch || errnoMatch) {
        const msgFields = [e.sqlMessage, e.message]
          .filter((m): m is string => typeof m === "string")
          .join(" ");
        // If we have any message text, require the table name to appear so we
        // don't mask an ER_NO_SUCH_TABLE for something else. If neither field
        // is present, trust the code/errno match.
        if (!msgFields || msgFields.includes("prediction_learning_metrics")) {
          return true;
        }
      }
      current = e.cause;
    } else {
      break;
    }
  }
  return false;
}

function logPredictionLearningMetricsMissingOnce(): void {
  if (_warnedMissingPredictionLearningMetrics) return;
  _warnedMissingPredictionLearningMetrics = true;
  console.warn("[predictions] prediction_learning_metrics missing — falling back to non-personalized scoring");
}

export async function getPredictionLearningMetrics(
  gameType: string,
  metricType: LearningMetricType,
  windowDays = 90,
) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(predictionLearningMetrics)
      .where(and(
        eq(predictionLearningMetrics.gameType, gameType),
        eq(predictionLearningMetrics.metricType, metricType),
        eq(predictionLearningMetrics.windowDays, windowDays),
      ))
      .orderBy(desc(predictionLearningMetrics.weightedScore));
  } catch (error) {
    if (isMissingPredictionLearningMetricsTable(error)) {
      logPredictionLearningMetricsMissingOnce();
      return [];
    }
    throw error;
  }
}

/**
 * Rebuild rolling learning metrics from prediction_accuracy_calculated events.
 * Safe to run from cron/manual endpoints; deterministic and idempotent.
 */
export async function rebuildPredictionLearningMetricsFromEvents(input?: {
  gameType?: string;
  windowDays?: number;
}) {
  const db = await getDb();
  if (!db) return { updated: 0, factors: 0, models: 0 };

  const windowDays = input?.windowDays ?? 90;
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const conditions = [
    eq(appEvents.event_type, "prediction_accuracy_calculated"),
    gte(appEvents.occurred_at, cutoff),
  ];
  if (input?.gameType) {
    conditions.push(sql`JSON_UNQUOTE(JSON_EXTRACT(${appEvents.payload}, '$.game')) = ${input.gameType}`);
  }

  const events = await db.select({
    payload: appEvents.payload,
  })
    .from(appEvents)
    .where(and(...conditions))
    .orderBy(desc(appEvents.occurred_at))
    .limit(5000);

  const { factorAgg, modelAgg } = buildLearningRollupsFromAccuracyPayloads(
    events.map(evt => (evt.payload || {}) as {
      game?: string;
      factor_snapshot?: Record<string, number>;
      model_scores?: Record<string, number>;
      match_ratio?: number;
    }),
  );

  const upserts: Array<any> = [];
  const toRows = (
    map: Map<string, { total: number; count: number }>,
    metricType: LearningMetricType,
  ) => {
    for (const [key, row] of map.entries()) {
      const [gameType, metricName] = key.split("|");
      const avg = row.count > 0 ? row.total / row.count : 0;
      const confidence = Math.min(row.count / 30, 1);
      const weighted = avg * confidence;
      upserts.push({
        gameType,
        metricType,
        metricName,
        windowDays,
        windowLabel: `rolling_${windowDays}d`,
        sampleCount: row.count,
        averageMatchRatio: avg,
        weightedScore: weighted,
      });
    }
  };

  toRows(factorAgg, "factor");
  toRows(modelAgg, "model");

  if (upserts.length > 0) {
    try {
      await db.insert(predictionLearningMetrics)
        .values(upserts)
        .onDuplicateKeyUpdate({
          set: {
            sampleCount: sql`VALUES(sampleCount)`,
            averageMatchRatio: sql`VALUES(averageMatchRatio)`,
            weightedScore: sql`VALUES(weightedScore)`,
            windowLabel: sql`VALUES(windowLabel)`,
            lastUpdatedAt: new Date(),
          },
        });
    } catch (error) {
      // Approach A: this rebuild runs from the cron auto-fetch path
      // (evaluatePredictionsAgainstDraw → fire-and-forget here). When the
      // table is missing we no-op gracefully so the surrounding draw
      // ingestion flow still succeeds. Same one-time warning as the read
      // path; everything else re-throws.
      if (isMissingPredictionLearningMetricsTable(error)) {
        logPredictionLearningMetricsMissingOnce();
        return { updated: 0, factors: 0, models: 0 };
      }
      throw error;
    }
  }

  return { updated: upserts.length, factors: factorAgg.size, models: modelAgg.size };
}

/**
 * Evaluate predictions against a draw result and record performance.
 * Called after a new draw result is added.
 */
export async function evaluatePredictionsAgainstDraw(
  drawId: number,
  gameType: string,
  mainNumbers: number[],
  specialNumbers: number[],
  drawDate: string = "",
) {
  const db = await getDb();
  if (!db) return { evaluated: 0, highAccuracy: 0 };

  // Get predictions made before this draw (within last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentPreds = await db.select().from(predictions)
    .where(and(
      eq(predictions.gameType, gameType),
      gte(predictions.createdAt, sevenDaysAgo),
    ))
    .orderBy(desc(predictions.createdAt))
    .limit(200);

  if (recentPreds.length === 0) return { evaluated: 0, highAccuracy: 0 };

  const resultMainSet = new Set(mainNumbers);
  const resultSpecialSet = new Set(specialNumbers);
  const perfRecords: InsertModelPerformance[] = [];
  const accuracyEvents: Array<{
    userId: number;
    correlationId: string;
    matchedNumbers: number;
    totalPicks: number;
    modelScores: Record<string, number>;
    factorSnapshot: Record<string, number>;
    game: string;
  }> = [];
  let highAccuracy = 0;

  for (const pred of recentPreds) {
    const predMain = pred.mainNumbers as number[];
    const predSpecial = (pred.specialNumbers as number[]) || [];

    const mainHits = predMain.filter(n => resultMainSet.has(n)).length;
    const specialHits = predSpecial.filter(n => resultSpecialSet.has(n)).length;

    perfRecords.push({
      modelName: pred.modelName,
      gameType,
      drawResultId: drawId,
      predictionId: pred.id,
      mainHits,
      specialHits,
    });

    // Check for high accuracy (60%+ main number match)
    if (mainHits >= Math.ceil(predMain.length * 0.6)) {
      highAccuracy++;
    }

    // Collect accuracy events for attributed predictions (userId required)
    if (pred.userId != null) {
      // Reconstruct correlationId from prediction row — the predictions table does not
      // store the original correlationId, so we approximate using createdAt timestamp.
      const correlationId = `prediction:${gameType}:${pred.userId}:${(pred.createdAt as Date).getTime()}`;
      accuracyEvents.push({
        userId: pred.userId,
        correlationId,
        matchedNumbers: mainHits,
        totalPicks: predMain.length,
        modelScores: { [pred.modelName]: predMain.length > 0 ? mainHits / predMain.length : 0 },
        factorSnapshot: ((pred.metadata as Record<string, any> | null)?.explainable?.factorSnapshot ?? {}) as Record<string, number>,
        game: gameType,
      });
    }
  }

  if (perfRecords.length > 0) {
    // TRANSACTION: all evaluation rows for this draw are written atomically.
    // A partial write would corrupt leaderboard stats for this draw result.
    await db.transaction(async (tx) => {
      await tx.insert(modelPerformance).values(perfRecords);
    });
  }

  // Fire-and-forget accuracy events after the transaction. Dynamic import avoids
  // a circular dependency (eventService imports getDb from this module).
  if (accuracyEvents.length > 0 && drawDate) {
    import("./services/eventService").then(({ emitPredictionAccuracyCalculated, buildDrawCorrelationId }) => {
      const triggeredBy = buildDrawCorrelationId(gameType, drawDate);
      const occurredAt = new Date();
      for (const evt of accuracyEvents) {
        emitPredictionAccuracyCalculated({
          ...evt,
          triggeredBy,
          netOutcome: 0,
          factorSnapshot: evt.factorSnapshot,
          matchRatio: evt.totalPicks > 0 ? evt.matchedNumbers / evt.totalPicks : 0,
          game: evt.game,
          occurredAt,
          platformVersion: "1.0.0",
          schemaVersion: "1.0",
        }).catch(err => console.error("[event]", err));
      }
    }).catch(() => {});
  }

  // Keep compact rolling metrics fresh after evaluation.
  rebuildPredictionLearningMetricsFromEvents({ gameType, windowDays: 90 })
    .catch(err => console.warn("[LearningMetrics] rebuild failed:", err));

  return { evaluated: perfRecords.length, highAccuracy };
}

// ─── Favorites ──────────────────────────────────────────────────────────────────
export async function addFavorite(data: InsertFavorite) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(favorites).values(data);
  return result;
}

export async function getUserFavorites(userId: number, gameType?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(favorites.userId, userId)];
  if (gameType) conditions.push(eq(favorites.gameType, gameType));
  return db.select().from(favorites)
    .where(and(...conditions))
    .orderBy(desc(favorites.createdAt));
}

export async function removeFavorite(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(favorites).where(and(eq(favorites.id, id), eq(favorites.userId, userId)));
}

export async function incrementFavoriteUsage(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(favorites)
    .set({ usageCount: sql`${favorites.usageCount} + 1` })
    .where(eq(favorites.id, id));
}

// ─── Push Subscriptions ─────────────────────────────────────────────────────────
export async function upsertPushSubscription(data: InsertPushSubscription) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if subscription with same endpoint exists for this user
  const existing = await db.select().from(pushSubscriptions)
    .where(and(
      eq(pushSubscriptions.userId, data.userId),
    ))
    .limit(1);
  if (existing.length > 0) {
    await db.update(pushSubscriptions)
      .set({
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        enabled: data.enabled ?? 1,
        notifyDrawResults: data.notifyDrawResults ?? 1,
        notifyHighAccuracy: data.notifyHighAccuracy ?? 1,
      })
      .where(eq(pushSubscriptions.id, existing[0].id));
    return existing[0].id;
  }
  const result = await db.insert(pushSubscriptions).values(data);
  return (result as any)[0]?.insertId;
}

export async function getUserPushSubscription(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updatePushPreferences(userId: number, prefs: {
  enabled?: number;
  notifyDrawResults?: number;
  notifyHighAccuracy?: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(pushSubscriptions)
    .set(prefs)
    .where(eq(pushSubscriptions.userId, userId));
}

export async function getActivePushSubscriptions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pushSubscriptions)
    .where(eq(pushSubscriptions.enabled, 1));
}

// ─── PDF Uploads ──────────────────────────────────────────────────────────────
export async function insertPdfUpload(data: InsertPdfUpload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(pdfUploads).values(data);
  return (result as any)[0]?.insertId;
}

export async function updatePdfUploadStatus(
  id: number,
  status: "pending" | "processing" | "completed" | "failed",
  extra?: { drawsExtracted?: number; errorMessage?: string | null }
) {
  const db = await getDb();
  if (!db) return;
  const updateData: Record<string, unknown> = { status };
  if (extra?.drawsExtracted !== undefined) updateData.drawsExtracted = extra.drawsExtracted;
  if (extra?.errorMessage !== undefined) updateData.errorMessage = extra.errorMessage;
  await db.update(pdfUploads).set(updateData).where(eq(pdfUploads.id, id));
}

export async function getUserPdfUploads(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pdfUploads)
    .where(eq(pdfUploads.userId, userId))
    .orderBy(desc(pdfUploads.createdAt))
    .limit(limit);
}

// ─── Purchased Tickets (Win/Loss Tracker) ─────────────────────────────────────
export async function insertPurchasedTicket(data: InsertPurchasedTicket) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(purchasedTickets).values(data);
  return (result as any)[0]?.insertId;
}

export async function getUserPurchasedTickets(userId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(purchasedTickets)
    .where(eq(purchasedTickets.userId, userId))
    .orderBy(desc(purchasedTickets.purchaseDate))
    .limit(limit);
}

export async function updatePurchasedTicketOutcome(
  id: number,
  userId: number,
  outcome: "pending" | "loss" | "win",
  winAmount?: number,
  mainHits?: number,
  specialHits?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = { outcome };
  if (winAmount !== undefined) updateData.winAmount = winAmount;
  if (mainHits !== undefined) updateData.mainHits = mainHits;
  if (specialHits !== undefined) updateData.specialHits = specialHits;
  await db.update(purchasedTickets)
    .set(updateData)
    .where(and(eq(purchasedTickets.id, id), eq(purchasedTickets.userId, userId)));
}

export async function deletePurchasedTicket(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(purchasedTickets)
    .where(and(eq(purchasedTickets.id, id), eq(purchasedTickets.userId, userId)));
}

export async function getUserROIStats(userId: number) {
  const db = await getDb();
  if (!db) return { totalSpent: 0, totalWon: 0, totalTickets: 0, wins: 0, losses: 0, pending: 0, roi: 0 };
  const result = await db.select({
    totalSpent: sql<number>`COALESCE(SUM(${purchasedTickets.cost}), 0)`,
    totalWon: sql<number>`COALESCE(SUM(${purchasedTickets.winAmount}), 0)`,
    totalTickets: sql<number>`COUNT(*)`,
    wins: sql<number>`SUM(CASE WHEN ${purchasedTickets.outcome} = 'win' THEN 1 ELSE 0 END)`,
    losses: sql<number>`SUM(CASE WHEN ${purchasedTickets.outcome} = 'loss' THEN 1 ELSE 0 END)`,
    pending: sql<number>`SUM(CASE WHEN ${purchasedTickets.outcome} = 'pending' THEN 1 ELSE 0 END)`,
  }).from(purchasedTickets)
    .where(eq(purchasedTickets.userId, userId));

  const stats = result[0] || { totalSpent: 0, totalWon: 0, totalTickets: 0, wins: 0, losses: 0, pending: 0 };
  const totalSpent = Number(stats.totalSpent) || 0;
  const totalWon = Number(stats.totalWon) || 0;
  const roi = totalSpent > 0 ? ((totalWon - totalSpent) / totalSpent) * 100 : 0;

  return {
    totalSpent,
    totalWon,
    totalTickets: Number(stats.totalTickets) || 0,
    wins: Number(stats.wins) || 0,
    losses: Number(stats.losses) || 0,
    pending: Number(stats.pending) || 0,
    roi: Math.round(roi * 100) / 100,
  };
}

export async function getROIByGame(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    gameType: purchasedTickets.gameType,
    totalSpent: sql<number>`COALESCE(SUM(${purchasedTickets.cost}), 0)`,
    totalWon: sql<number>`COALESCE(SUM(${purchasedTickets.winAmount}), 0)`,
    totalTickets: sql<number>`COUNT(*)`,
    wins: sql<number>`SUM(CASE WHEN ${purchasedTickets.outcome} = 'win' THEN 1 ELSE 0 END)`,
  }).from(purchasedTickets)
    .where(eq(purchasedTickets.userId, userId))
    .groupBy(purchasedTickets.gameType);
}

// ─── Model Confidence Trends ──────────────────────────────────────────────────
/**
 * Get model performance over time, grouped by week.
 * Returns weekly average main hits for each model, suitable for trend charts.
 */
export async function getModelTrends(gameType?: string, weeksBack = 12) {
  const db = await getDb();
  if (!db) return [];

  const cutoff = new Date(Date.now() - weeksBack * 7 * 24 * 60 * 60 * 1000);

  // Build parameterized SQL using Drizzle's sql template to avoid only_full_group_by issues
  // Note: column names use camelCase in the actual DB schema (modelName, gameType, mainHits, etc.)
  const rawQuery = gameType
    ? sql`
        SELECT
          modelName,
          DATE_FORMAT(DATE_SUB(createdAt, INTERVAL WEEKDAY(createdAt) DAY), '%Y-%m-%d') AS weekStart,
          AVG(mainHits) AS avgMainHits,
          AVG(specialHits) AS avgSpecialHits,
          COUNT(*) AS evaluationCount
        FROM model_performance
        WHERE createdAt >= ${cutoff} AND gameType = ${gameType}
        GROUP BY modelName, DATE_FORMAT(DATE_SUB(createdAt, INTERVAL WEEKDAY(createdAt) DAY), '%Y-%m-%d')
        ORDER BY weekStart ASC
      `
    : sql`
        SELECT
          modelName,
          DATE_FORMAT(DATE_SUB(createdAt, INTERVAL WEEKDAY(createdAt) DAY), '%Y-%m-%d') AS weekStart,
          AVG(mainHits) AS avgMainHits,
          AVG(specialHits) AS avgSpecialHits,
          COUNT(*) AS evaluationCount
        FROM model_performance
        WHERE createdAt >= ${cutoff}
        GROUP BY modelName, DATE_FORMAT(DATE_SUB(createdAt, INTERVAL WEEKDAY(createdAt) DAY), '%Y-%m-%d')
        ORDER BY weekStart ASC
      `;

  const result = await db.execute(rawQuery);
  // db.execute returns [rows, fields] for mysql2
  const rows = (Array.isArray(result) && Array.isArray(result[0])) ? result[0] : result;
  return (rows as any[]).map(r => ({
    modelName: r.modelName as string,
    weekStart: r.weekStart as string,
    avgMainHits: Number(r.avgMainHits) || 0,
    avgSpecialHits: Number(r.avgSpecialHits) || 0,
    evaluationCount: Number(r.evaluationCount) || 0,
  }));
}

// ─── Model Game Affinity ──────────────────────────────────────────────────────
/**
 * Compute which games each model performs best on.
 * Returns per-model affinity tags with the top game(s) and relative performance.
 */
export async function getModelGameAffinity() {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select({
    modelName: modelPerformance.modelName,
    gameType: modelPerformance.gameType,
    totalPredictions: sql<number>`COUNT(*)`,
    avgMainHits: sql<number>`AVG(${modelPerformance.mainHits})`,
    maxMainHits: sql<number>`MAX(${modelPerformance.mainHits})`,
  }).from(modelPerformance)
    .groupBy(modelPerformance.modelName, modelPerformance.gameType);

  // Group by model
  const modelMap: Record<string, Array<{
    gameType: string;
    total: number;
    avgHits: number;
    maxHits: number;
  }>> = {};

  for (const row of rows) {
    if (!modelMap[row.modelName]) modelMap[row.modelName] = [];
    modelMap[row.modelName].push({
      gameType: row.gameType,
      total: Number(row.totalPredictions) || 0,
      avgHits: Number(Number(row.avgMainHits).toFixed(3)),
      maxHits: Number(row.maxMainHits) || 0,
    });
  }

  // For each model, find the best game(s)
  const result: Array<{
    modelName: string;
    bestGame: string;
    bestGameAvgHits: number;
    affinityTags: Array<{ gameType: string; avgHits: number; label: string }>;
  }> = [];

  for (const [modelName, games] of Object.entries(modelMap)) {
    // Only consider games with at least 3 evaluations
    const qualified = games.filter(g => g.total >= 3);
    if (qualified.length === 0) {
      result.push({ modelName, bestGame: "", bestGameAvgHits: 0, affinityTags: [] });
      continue;
    }

    // Sort by avgHits descending
    qualified.sort((a, b) => b.avgHits - a.avgHits);
    const best = qualified[0];
    const overallAvg = qualified.reduce((s, g) => s + g.avgHits * g.total, 0) / qualified.reduce((s, g) => s + g.total, 0);

    // Tag games where model performs significantly above its own average
    const tags = qualified
      .filter(g => g.avgHits >= overallAvg * 1.05) // at least 5% above average
      .map(g => ({
        gameType: g.gameType,
        avgHits: g.avgHits,
        label: g.gameType === best.gameType ? "Best" : "Strong",
      }));

    result.push({
      modelName,
      bestGame: best.gameType,
      bestGameAvgHits: best.avgHits,
      affinityTags: tags,
    });
  }

  return result;
}

// ─── Prediction Streak Detection ──────────────────────────────────────────────
/**
 * Detect models that have consecutive draws with 3+ main number hits.
 * Returns streak data for each model across games.
 */
export async function getModelStreaks(minHits = 3) {
  const db = await getDb();
  if (!db) return [];

  // Get recent performance records ordered by draw date
  const rows = await db.select({
    modelName: modelPerformance.modelName,
    gameType: modelPerformance.gameType,
    mainHits: modelPerformance.mainHits,
    drawResultId: modelPerformance.drawResultId,
    createdAt: modelPerformance.createdAt,
  }).from(modelPerformance)
    .orderBy(desc(modelPerformance.createdAt));

  // Group by model+game, compute streaks
  const modelGameMap: Record<string, Array<{ mainHits: number; drawResultId: number | null; createdAt: Date }>> = {};

  for (const row of rows) {
    const key = `${row.modelName}::${row.gameType}`;
    if (!modelGameMap[key]) modelGameMap[key] = [];
    modelGameMap[key].push({
      mainHits: row.mainHits,
      drawResultId: row.drawResultId,
      createdAt: row.createdAt,
    });
  }

  const streaks: Array<{
    modelName: string;
    gameType: string;
    currentStreak: number;
    maxStreak: number;
    isHot: boolean;
    lastHitCount: number;
  }> = [];

  for (const [key, records] of Object.entries(modelGameMap)) {
    const [modelName, gameType] = key.split("::");
    // Records are newest-first
    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;

    // Current streak: count from most recent
    for (const rec of records) {
      if (rec.mainHits >= minHits) currentStreak++;
      else break;
    }

    // Max streak: scan all records (oldest to newest)
    const chronological = [...records].reverse();
    for (const rec of chronological) {
      if (rec.mainHits >= minHits) {
        tempStreak++;
        maxStreak = Math.max(maxStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    if (currentStreak > 0 || maxStreak > 0) {
      streaks.push({
        modelName,
        gameType,
        currentStreak,
        maxStreak,
        isHot: currentStreak >= 3,
        lastHitCount: records[0]?.mainHits || 0,
      });
    }
  }

  // Sort by current streak descending
  streaks.sort((a, b) => b.currentStreak - a.currentStreak);
  return streaks;
}


// ─── Ticket Scanner Helpers ─────────────────────────────────────────────────

export async function getUserPredictionsByGame(userId: number, gameType: string, limit = 250) {
  const db = await getDb();
  return db!
    .select()
    .from(predictions)
    .where(and(eq(predictions.userId, userId), eq(predictions.gameType, gameType)))
    .orderBy(desc(predictions.createdAt))
    .limit(limit);
}

export async function getDrawResultByGameDateTime(
  gameType: string,
  drawDate: number,
  drawTime: string
) {
  const db = await getDb();
  const rows = await db!
    .select()
    .from(drawResults)
    .where(
      and(
        eq(drawResults.gameType, gameType),
        eq(drawResults.drawDate, drawDate),
        eq(drawResults.drawTime, drawTime)
      )
    )
    .limit(1);
  return rows[0] || null;
}

export async function evaluatePurchasedTicketsAgainstDraw(
  gameType: string,
  drawDate: number,
  drawTime: string,
  winningMain: number[],
  winningSpecial: number[]
) {
  const db = await getDb();
  if (!db) return;

  // Get all pending tickets for this game + draw date
  const tickets = await db
    .select()
    .from(purchasedTickets)
    .where(
      and(
        eq(purchasedTickets.gameType, gameType),
        eq(purchasedTickets.drawDate, drawDate),
        eq(purchasedTickets.outcome, "pending")
      )
    );

  const winningMainSet = new Set(winningMain);
  const winningSpecialSet = new Set(winningSpecial);

  const cfg = FLORIDA_GAMES[gameType as GameType];
  if (!cfg) return;

  for (const ticket of tickets) {
    // Note: draw-time filtering relies on ticket.notes containing "draw period: midday"
    // or "draw period: evening". Tickets logged without this format skip time filtering.
    const notesLower = (ticket.notes || "").toLowerCase();
    if (drawTime === "midday" && notesLower.includes("draw period: evening")) continue;
    if (drawTime === "evening" && notesLower.includes("draw period: midday")) continue;

    const ticketMain = (ticket.mainNumbers as number[]) || [];
    const ticketSpecial = (ticket.specialNumbers as number[]) || [];

    const mainHits = ticketMain.filter(n => winningMainSet.has(n)).length;
    const specialHits = ticketSpecial.filter(n => winningSpecialSet.has(n)).length;

    // Determine outcome
    let outcome: "win" | "loss" = "loss";
    let winAmount = 0;

    // Simple win detection: any main hits count as partial win for tracking
    if (mainHits >= 2 || (mainHits >= 1 && specialHits >= 1)) {
      outcome = "win";
      // We don't know exact prize tiers, so just mark as win
    }

    await db
      .update(purchasedTickets)
      .set({
        mainHits,
        specialHits,
        outcome,
        winAmount,
      })
      .where(eq(purchasedTickets.id, ticket.id));
  }
}

// ─── Auto-fetch run history ───────────────────────────────────────────────────
//
// Persists per-run records for the scheduled lottery scrape. The web service
// reads the most recent row to answer the autoFetchStatus tRPC query, which
// is how the admin dashboard surfaces "last run at X, N new draws, M
// evaluations". Pre-migration, that endpoint consulted per-process module
// variables on server/cron.ts, which became unreachable when the scrape
// moved to a standalone cron-runner process in PR #31.

/**
 * Record the start of an auto-fetch run.
 *
 * Returns the new row's id so the caller can update it on completion. Returns
 * null if the database isn't reachable — the caller is expected to still
 * proceed with the scrape (data loss from a missed status row is strictly
 * less bad than skipping a scrape) and treat subsequent `finishAutoFetchRun`
 * calls as best-effort.
 */
export async function insertAutoFetchRunStart(
  trigger: "cron" | "manual",
  startedAt: number = Date.now(),
): Promise<number | null> {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot record auto-fetch start: database not available"); return null; }
  try {
    const result = await db.insert(autoFetchRuns).values({
      startedAt,
      status: "running",
      trigger,
    });
    return Number((result as any)?.[0]?.insertId ?? 0) || null;
  } catch (error) {
    console.error("[Database] Failed to insert auto-fetch run start:", error);
    return null;
  }
}

/**
 * Update an auto-fetch run row with its outcome.
 *
 * `status` should be "failed" only when the scrape itself threw (i.e. the
 * outer try/catch in runAutoFetch fired); per-game errors captured in
 * `errors` while the overall loop kept going remain "completed".
 *
 * Idempotent-ish: if the caller already finished this row and re-runs, the
 * counters are simply overwritten with the same values. We never go back to
 * "running".
 */
export async function finishAutoFetchRun(
  id: number,
  result: {
    status: "completed" | "failed";
    finishedAt?: number;
    gamesProcessed: number;
    totalNewDraws: number;
    totalEvaluations: number;
    highAccuracyAlerts: number;
    gameResults: Record<string, { newDraws: number; evaluations: number; errors: number }>;
    errors: string[];
  },
): Promise<void> {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot finalize auto-fetch run: database not available"); return; }
  try {
    await db.update(autoFetchRuns).set({
      status: result.status,
      finishedAt: result.finishedAt ?? Date.now(),
      gamesProcessed: result.gamesProcessed,
      totalNewDraws: result.totalNewDraws,
      totalEvaluations: result.totalEvaluations,
      highAccuracyAlerts: result.highAccuracyAlerts,
      gameResults: result.gameResults,
      errors: result.errors,
    }).where(eq(autoFetchRuns.id, id));
  } catch (error) {
    console.error("[Database] Failed to finalize auto-fetch run:", error);
  }
}

/**
 * Return the most recently started auto-fetch run, or null if none exist
 * (fresh DB) or the database is unreachable.
 *
 * Called on every poll of the admin dashboard (every 30s) — the
 * `afr_started_at_idx` index keeps this a single-row lookup.
 */
export async function getLatestAutoFetchRun(): Promise<AutoFetchRun | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(autoFetchRuns)
      .orderBy(desc(autoFetchRuns.startedAt))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error("[Database] Failed to read latest auto-fetch run:", error);
    return null;
  }
}

export async function getTicketAnalytics(userId: number) {
  const db = await getDb();
  if (!db) return {
    modelsPlayedMost: [] as { model: string; count: number }[],
    modelsWonMoney: [] as { model: string; profit: number }[],
    hitRateByModel: [] as { model: string; total: number; wins: number; hitRate: number }[],
    middayVsEvening: { midday: 0, evening: 0 },
  };

  const allTickets = await db
    .select()
    .from(purchasedTickets)
    .where(eq(purchasedTickets.userId, userId));

  // Models played most
  const modelCounts: Record<string, number> = {};
  const modelProfit: Record<string, number> = {};
  const modelHits: Record<string, { total: number; wins: number }> = {};
  let middayCount = 0;
  let eveningCount = 0;

  for (const t of allTickets) {
    const model = t.modelSource || "unknown";
    modelCounts[model] = (modelCounts[model] || 0) + 1;
    modelProfit[model] = (modelProfit[model] || 0) + ((t.winAmount || 0) - t.cost);

    if (!modelHits[model]) modelHits[model] = { total: 0, wins: 0 };
    modelHits[model].total++;
    if (t.outcome === "win") modelHits[model].wins++;

    const notesLower = (t.notes || "").toLowerCase();
    if (notesLower.includes("draw period: midday")) middayCount++;
    else eveningCount++;
  }

  const modelsPlayedMost = Object.entries(modelCounts)
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count);

  const modelsWonMoney = Object.entries(modelProfit)
    .map(([model, profit]) => ({ model, profit: Math.round(profit * 100) / 100 }))
    .sort((a, b) => b.profit - a.profit);

  const hitRateByModel = Object.entries(modelHits)
    .map(([model, { total, wins }]) => ({
      model,
      total,
      wins,
      hitRate: total > 0 ? Math.round((wins / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.hitRate - a.hitRate);

  return {
    modelsPlayedMost,
    modelsWonMoney,
    hitRateByModel,
    middayVsEvening: { midday: middayCount, evening: eveningCount },
  };
}
