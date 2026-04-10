import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { eq, and, desc as descOp } from "drizzle-orm";
import { drawResults as drawsTable, predictions as predsTable } from "../../drizzle/schema";
import { getDb } from "../db";

export async function exportDrawResultsCsv(gameType: string | undefined, limit: number) {
  const db = await getDb();
  if (!db) return { csv: "", count: 0 };

  const conditions = gameType ? eq(drawsTable.gameType, gameType) : undefined;
  const rows = conditions
    ? await db.select().from(drawsTable).where(conditions).orderBy(descOp(drawsTable.drawDate)).limit(limit)
    : await db.select().from(drawsTable).orderBy(descOp(drawsTable.drawDate)).limit(limit);

  const headers = ["Date", "Game", "Draw Time", "Main Numbers", "Special Numbers", "Source"];
  const csvRows = rows.map(r => {
    const date = new Date(r.drawDate).toLocaleDateString("en-US");
    const game = FLORIDA_GAMES[r.gameType as GameType]?.name || r.gameType;
    const mainNums = (r.mainNumbers as number[]).join(" - ");
    const specialNums = r.specialNumbers ? (r.specialNumbers as number[]).join(" - ") : "";
    return [date, game, r.drawTime || "evening", mainNums, specialNums, r.source || "manual"].map(v => `"${v}"`).join(",");
  });

  const csv = [headers.join(","), ...csvRows].join("\n");
  return { csv, count: rows.length };
}

export async function exportPredictionsCsv(userId: number, gameType: string | undefined, limit: number) {
  const db = await getDb();
  if (!db) return { csv: "", count: 0 };

  const conditions = [eq(predsTable.userId, userId)];
  if (gameType) conditions.push(eq(predsTable.gameType, gameType));

  const rows = await db.select().from(predsTable)
    .where(and(...conditions))
    .orderBy(descOp(predsTable.createdAt))
    .limit(limit);

  const headers = ["Date", "Game", "Model", "Main Numbers", "Special Numbers", "Confidence"];
  const csvRows = rows.map(r => {
    const date = new Date(r.createdAt).toLocaleString("en-US");
    const game = FLORIDA_GAMES[r.gameType as GameType]?.name || r.gameType;
    const mainNums = (r.mainNumbers as number[]).join(" - ");
    const specialNums = r.specialNumbers ? (r.specialNumbers as number[]).join(" - ") : "";
    const confidence = Math.round(r.confidenceScore * 100) + "%";
    return [date, game, r.modelName, mainNums, specialNums, confidence].map(v => `"${v}"`).join(",");
  });

  const csv = [headers.join(","), ...csvRows].join("\n");
  return { csv, count: rows.length };
}
