import { eq, desc, and, sql, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  drawResults, InsertDrawResult,
  predictions, InsertPrediction,
  ticketSelections, InsertTicketSelection,
  modelPerformance, InsertModelPerformance,
} from "../drizzle/schema";
import { ENV } from './_core/env';

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

// ─── Draw Results ───────────────────────────────────────────────────────────────
export async function insertDrawResult(data: InsertDrawResult) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(drawResults).values(data);
  return result;
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
export async function getModelWeights(gameType: string): Promise<Record<string, number>> {
  const stats = await getModelPerformanceStats(gameType);
  const weights: Record<string, number> = {};

  if (stats.length === 0) return weights; // empty = use defaults

  // Find the max average hits for normalization
  const maxAvg = Math.max(...stats.map(s => Number(s.avgMainHits) || 0), 0.001);

  for (const s of stats) {
    const avg = Number(s.avgMainHits) || 0;
    const total = Number(s.totalPredictions) || 0;
    // Weight = normalized accuracy * confidence factor (more data = more confidence)
    const accuracyNorm = avg / maxAvg;
    const confidenceFactor = Math.min(total / 10, 1); // full confidence after 10 evaluations
    weights[s.modelName] = 0.3 + 0.7 * accuracyNorm * confidenceFactor; // floor at 0.3
  }

  return weights;
}

/**
 * Evaluate predictions against a draw result and record performance.
 * Called after a new draw result is added.
 */
export async function evaluatePredictionsAgainstDraw(
  drawId: number,
  gameType: string,
  mainNumbers: number[],
  specialNumbers: number[]
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
  }

  if (perfRecords.length > 0) {
    await insertModelPerformance(perfRecords);
  }

  return { evaluated: perfRecords.length, highAccuracy };
}
