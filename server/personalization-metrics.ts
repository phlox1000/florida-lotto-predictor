import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  personalizationMetrics,
  InsertPersonalizationMetric,
} from "../drizzle/schema";

// ─── Personalization Metrics Queries ──────────────────────────────────────────

export async function insertPersonalizationMetric(
  data: InsertPersonalizationMetric
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(personalizationMetrics).values(data);
  return (result as any)[0]?.insertId;
}

export async function getUserPersonalizationMetrics(
  userId: number,
  gameType?: string,
  metricType?: string,
  limit = 50
) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(personalizationMetrics.userId, userId)];
  if (gameType) conditions.push(eq(personalizationMetrics.gameType, gameType));
  if (metricType)
    conditions.push(eq(personalizationMetrics.metricType, metricType));
  return db
    .select()
    .from(personalizationMetrics)
    .where(and(...conditions))
    .orderBy(desc(personalizationMetrics.createdAt))
    .limit(limit);
}

export async function upsertPersonalizationMetric(
  userId: number,
  gameType: string,
  metricType: string,
  metricValue: number,
  metadata?: unknown
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if a metric already exists for this user/game/type
  const existing = await db
    .select()
    .from(personalizationMetrics)
    .where(
      and(
        eq(personalizationMetrics.userId, userId),
        eq(personalizationMetrics.gameType, gameType),
        eq(personalizationMetrics.metricType, metricType)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    const updateData: Record<string, unknown> = { metricValue };
    if (metadata !== undefined) updateData.metadata = metadata;
    await db
      .update(personalizationMetrics)
      .set(updateData)
      .where(eq(personalizationMetrics.id, existing[0].id));
    return existing[0].id;
  }

  const result = await db.insert(personalizationMetrics).values({
    userId,
    gameType,
    metricType,
    metricValue,
    metadata: metadata ?? null,
  });
  return (result as any)[0]?.insertId;
}

// ─── Debug Status Helper ──────────────────────────────────────────────────────

/**
 * Returns a list of all tables currently in the live database.
 * Used by the debugStatus endpoint to confirm migrations have been applied.
 */
export async function getLiveTableList(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`SHOW TABLES`);
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  return (rows as any[]).map((r: any) => Object.values(r)[0] as string);
}
