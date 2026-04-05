import { z } from "zod";
import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { gameTypeSchema } from "./routerUtils";

export const csvExportRouter = router({
  /** Export draw results as CSV */
  drawResults: publicProcedure
    .input(z.object({
      gameType: gameTypeSchema.optional(),
      limit: z.number().min(1).max(5000).default(500),
    }))
    .query(async ({ input }) => {
      const { getDb } = await import("../db");
      const { drawResults: drawsTable } = await import("../../drizzle/schema");
      const { eq, desc: descOp } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { csv: "", count: 0 };

      const conditions = input.gameType ? eq(drawsTable.gameType, input.gameType) : undefined;
      const rows = conditions
        ? await db.select().from(drawsTable).where(conditions).orderBy(descOp(drawsTable.drawDate)).limit(input.limit)
        : await db.select().from(drawsTable).orderBy(descOp(drawsTable.drawDate)).limit(input.limit);

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
    }),

  /** Export prediction history as CSV */
  predictions: protectedProcedure
    .input(z.object({
      gameType: gameTypeSchema.optional(),
      limit: z.number().min(1).max(5000).default(500),
    }))
    .query(async ({ ctx, input }) => {
      const { getDb } = await import("../db");
      const { predictions: predsTable } = await import("../../drizzle/schema");
      const { eq, and, desc: descOp } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { csv: "", count: 0 };

      const conditions = [eq(predsTable.userId, ctx.user.id)];
      if (input.gameType) conditions.push(eq(predsTable.gameType, input.gameType));

      const rows = await db.select().from(predsTable)
        .where(and(...conditions))
        .orderBy(descOp(predsTable.createdAt))
        .limit(input.limit);

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
    }),
});
