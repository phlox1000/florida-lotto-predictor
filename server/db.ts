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
} from "../drizzle/schema";
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
    passwordSalt: data.passwordSalt,
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

export async function getModelWeights(gameType: string): Promise<Record<string, number>> {
  // Check cache first
  const cached = modelWeightsCache.get(gameType);
  if (cached && Date.now() - cached.cachedAt < MODEL_WEIGHTS_TTL_MS) {
    return cached.weights;
  }

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

  // Cache the result
  modelWeightsCache.set(gameType, { weights, cachedAt: Date.now() });
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
    // TRANSACTION: all evaluation rows for this draw are written atomically.
    // A partial write would corrupt leaderboard stats for this draw result.
    await db.transaction(async (tx) => {
      await tx.insert(modelPerformance).values(perfRecords);
    });
  }

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
