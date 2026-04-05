import { z } from "zod";
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getModelPerformanceStats, getModelWeights, getModelTrends } from "../db";
import { gameTypeSchema } from "./routerUtils";

export const leaderboardRouter = router({
  /** Get comprehensive leaderboard data across all games */
  all: publicProcedure.query(async () => {
    const { getDb } = await import("../db");
    const { modelPerformance } = await import("../../drizzle/schema");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return { models: [], totalEvaluations: 0 };

    const rows = await db.select({
      modelName: modelPerformance.modelName,
      totalPredictions: sql<number>`COUNT(*)`,
      avgMainHits: sql<number>`AVG(${modelPerformance.mainHits})`,
      avgSpecialHits: sql<number>`AVG(${modelPerformance.specialHits})`,
      maxMainHits: sql<number>`MAX(${modelPerformance.mainHits})`,
      totalMainHits: sql<number>`SUM(${modelPerformance.mainHits})`,
      totalSpecialHits: sql<number>`SUM(${modelPerformance.specialHits})`,
      perfectMatches: sql<number>`SUM(CASE WHEN ${modelPerformance.mainHits} >= 4 THEN 1 ELSE 0 END)`,
      zeroMatches: sql<number>`SUM(CASE WHEN ${modelPerformance.mainHits} = 0 THEN 1 ELSE 0 END)`,
    }).from(modelPerformance)
      .groupBy(modelPerformance.modelName);

    const perGame = await db.select({
      modelName: modelPerformance.modelName,
      gameType: modelPerformance.gameType,
      totalPredictions: sql<number>`COUNT(*)`,
      avgMainHits: sql<number>`AVG(${modelPerformance.mainHits})`,
      maxMainHits: sql<number>`MAX(${modelPerformance.mainHits})`,
    }).from(modelPerformance)
      .groupBy(modelPerformance.modelName, modelPerformance.gameType);

    const gameBreakdown: Record<string, Array<{ gameType: string; total: number; avgHits: number; maxHits: number }>> = {};
    for (const row of perGame) {
      if (!gameBreakdown[row.modelName]) gameBreakdown[row.modelName] = [];
      gameBreakdown[row.modelName].push({
        gameType: row.gameType,
        total: Number(row.totalPredictions) || 0,
        avgHits: Number(Number(row.avgMainHits).toFixed(3)),
        maxHits: Number(row.maxMainHits) || 0,
      });
    }

    const totalEvaluations = rows.reduce((s, r) => s + (Number(r.totalPredictions) || 0), 0);

    const models = rows.map(r => {
      const total = Number(r.totalPredictions) || 0;
      const avgHits = Number(Number(r.avgMainHits).toFixed(3));
      const maxHits = Number(r.maxMainHits) || 0;
      const totalHits = Number(r.totalMainHits) || 0;
      const perfect = Number(r.perfectMatches) || 0;
      const zeros = Number(r.zeroMatches) || 0;
      const hitRate = total > 0 ? (totalHits / total) : 0;
      const consistency = total > 0 ? (1 - (zeros / total)) : 0;

      return {
        modelName: r.modelName,
        totalEvaluated: total,
        avgMainHits: avgHits,
        avgSpecialHits: Number(Number(r.avgSpecialHits).toFixed(3)),
        maxMainHits: maxHits,
        totalMainHits: totalHits,
        totalSpecialHits: Number(r.totalSpecialHits) || 0,
        perfectMatches: perfect,
        zeroMatches: zeros,
        hitRate: Number(hitRate.toFixed(3)),
        consistency: Number(consistency.toFixed(3)),
        compositeScore: Number((avgHits * 0.5 + consistency * 0.3 + (maxHits / 6) * 0.2).toFixed(3)),
        gameBreakdown: gameBreakdown[r.modelName] || [],
      };
    }).sort((a, b) => b.compositeScore - a.compositeScore);

    return { models, totalEvaluations };
  }),

  /** Backfill evaluations: run all stored predictions against all stored draws to populate the leaderboard */
  backfill: adminProcedure
    .input(z.object({ gameType: gameTypeSchema.optional(), sampleSize: z.number().min(5).max(200).optional() }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("../db");
      const { drawResults: drawsTable, modelPerformance: perfTable } = await import("../../drizzle/schema");
      const { eq, and, desc: descOp } = await import("drizzle-orm");
      const { runAllModels } = await import("../predictions");
      const db = await getDb();
      if (!db) return { evaluated: 0, skipped: 0, error: "Database not available" };

      const gamesToProcess = input.gameType ? [input.gameType] : GAME_TYPES;
      const sampleSize = input.sampleSize || 10;
      let totalEvaluated = 0;
      let totalSkipped = 0;

      for (const gt of gamesToProcess) {
        const gameCfg = FLORIDA_GAMES[gt];
        if (!gameCfg) continue;

        const allDraws = await db.select().from(drawsTable)
          .where(eq(drawsTable.gameType, gt))
          .orderBy(descOp(drawsTable.drawDate));

        if (allDraws.length < 30) continue;

        allDraws.reverse();

        const minTrainingSize = 20;
        const testStart = Math.max(minTrainingSize, allDraws.length - sampleSize);

        for (let i = testStart; i < allDraws.length; i++) {
          const targetDraw = allDraws[i];
          const trainingDraws = allDraws.slice(0, i).map(d => ({
            mainNumbers: d.mainNumbers as number[],
            specialNumbers: (d.specialNumbers as number[]) || [],
            drawDate: new Date(d.drawDate).getTime(),
          }));

          const existing = await db.select({ id: perfTable.id }).from(perfTable)
            .where(and(
              eq(perfTable.drawResultId, targetDraw.id),
              eq(perfTable.gameType, gt)
            )).limit(1);

          if (existing.length > 0) {
            totalSkipped++;
            continue;
          }

          const predictions = runAllModels(gameCfg, trainingDraws);

          const resultMainSet = new Set(targetDraw.mainNumbers as number[]);
          const resultSpecialSet = new Set((targetDraw.specialNumbers as number[]) || []);

          for (const pred of predictions) {
            if (pred.mainNumbers.length === 0) continue;
            const mainHits = pred.mainNumbers.filter((n: number) => resultMainSet.has(n)).length;
            const specialHits = (pred.specialNumbers || []).filter((n: number) => resultSpecialSet.has(n)).length;

            await db.insert(perfTable).values({
              modelName: pred.modelName,
              gameType: gt,
              drawResultId: targetDraw.id,
              predictionId: null,
              mainHits,
              specialHits,
            });
            totalEvaluated++;
          }
        }
      }

      return { evaluated: totalEvaluated, skipped: totalSkipped };
    }),

  /** Get model accuracy trends over time (weekly rolling average) */
  trends: publicProcedure
    .input(z.object({
      gameType: gameTypeSchema.optional(),
      weeksBack: z.number().min(4).max(52).default(12),
    }))
    .query(async ({ input }) => {
      const rows = await getModelTrends(input.gameType, input.weeksBack);
      if (rows.length === 0) return { weeks: [], models: {} as Record<string, Array<{ week: string; avgHits: number; count: number }>> };

      const weekSet = new Set<string>();
      const modelMap: Record<string, Array<{ week: string; avgHits: number; count: number }>> = {};

      for (const row of rows) {
        const week = row.weekStart;
        weekSet.add(week);
        if (!modelMap[row.modelName]) modelMap[row.modelName] = [];
        modelMap[row.modelName].push({
          week,
          avgHits: Number(Number(row.avgMainHits).toFixed(3)),
          count: Number(row.evaluationCount) || 0,
        });
      }

      const weeks = [...weekSet].sort();
      return { weeks, models: modelMap };
    }),

  /** Get per-model game affinity tags (which games each model excels at) */
  affinity: publicProcedure.query(async () => {
    const { getModelGameAffinity } = await import("../db");
    const affinityData = await getModelGameAffinity();
    return { models: affinityData };
  }),

  /** Get prediction streak data (consecutive draws with 3+ hits) */
  streaks: publicProcedure
    .input(z.object({ minHits: z.number().min(1).max(6).default(3) }))
    .query(async ({ input }) => {
      const { getModelStreaks } = await import("../db");
      const streakData = await getModelStreaks(input.minHits);
      const hotStreaks = streakData.filter(s => s.isHot);
      const allStreaks = streakData;
      return { hotStreaks, allStreaks };
    }),

  /** Head-to-Head comparison of two models */
  headToHead: publicProcedure
    .input(z.object({
      modelA: z.string(),
      modelB: z.string(),
    }))
    .query(async ({ input }) => {
      const { getDb } = await import("../db");
      const { modelPerformance } = await import("../../drizzle/schema");
      const { sql, eq, inArray } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { modelA: input.modelA, modelB: input.modelB, games: [], summary: null };

      const rows = await db.select({
        modelName: modelPerformance.modelName,
        gameType: modelPerformance.gameType,
        total: sql<number>`COUNT(*)`,
        avgMainHits: sql<number>`AVG(${modelPerformance.mainHits})`,
        avgSpecialHits: sql<number>`AVG(${modelPerformance.specialHits})`,
        maxMainHits: sql<number>`MAX(${modelPerformance.mainHits})`,
        totalMainHits: sql<number>`SUM(${modelPerformance.mainHits})`,
        perfectMatches: sql<number>`SUM(CASE WHEN ${modelPerformance.mainHits} >= 4 THEN 1 ELSE 0 END)`,
        zeroMatches: sql<number>`SUM(CASE WHEN ${modelPerformance.mainHits} = 0 THEN 1 ELSE 0 END)`,
      }).from(modelPerformance)
        .where(inArray(modelPerformance.modelName, [input.modelA, input.modelB]))
        .groupBy(modelPerformance.modelName, modelPerformance.gameType);

      const gameMap: Record<string, { a: any; b: any }> = {};
      for (const r of rows) {
        const gt = r.gameType;
        if (!gameMap[gt]) gameMap[gt] = { a: null, b: null };
        const stats = {
          total: Number(r.total) || 0,
          avgMainHits: Number(Number(r.avgMainHits).toFixed(3)),
          avgSpecialHits: Number(Number(r.avgSpecialHits).toFixed(3)),
          maxMainHits: Number(r.maxMainHits) || 0,
          totalMainHits: Number(r.totalMainHits) || 0,
          perfectMatches: Number(r.perfectMatches) || 0,
          zeroMatches: Number(r.zeroMatches) || 0,
          consistency: Number(r.total) > 0 ? Number((1 - (Number(r.zeroMatches) || 0) / Number(r.total)).toFixed(3)) : 0,
        };
        if (r.modelName === input.modelA) gameMap[gt].a = stats;
        else gameMap[gt].b = stats;
      }

      const games = Object.entries(gameMap).map(([gameType, { a, b }]) => ({
        gameType,
        gameName: FLORIDA_GAMES[gameType as GameType]?.name || gameType,
        modelA: a || { total: 0, avgMainHits: 0, avgSpecialHits: 0, maxMainHits: 0, totalMainHits: 0, perfectMatches: 0, zeroMatches: 0, consistency: 0 },
        modelB: b || { total: 0, avgMainHits: 0, avgSpecialHits: 0, maxMainHits: 0, totalMainHits: 0, perfectMatches: 0, zeroMatches: 0, consistency: 0 },
        winner: !a && !b ? "tie" : !a ? "b" : !b ? "a" : a.avgMainHits > b.avgMainHits ? "a" : b.avgMainHits > a.avgMainHits ? "b" : "tie",
      }));

      const aWins = games.filter(g => g.winner === "a").length;
      const bWins = games.filter(g => g.winner === "b").length;
      const ties = games.filter(g => g.winner === "tie").length;
      const aOverall = games.reduce((s, g) => s + g.modelA.avgMainHits * g.modelA.total, 0);
      const bOverall = games.reduce((s, g) => s + g.modelB.avgMainHits * g.modelB.total, 0);
      const aTotal = games.reduce((s, g) => s + g.modelA.total, 0);
      const bTotal = games.reduce((s, g) => s + g.modelB.total, 0);

      return {
        modelA: input.modelA,
        modelB: input.modelB,
        games,
        summary: {
          aWins, bWins, ties,
          aOverallAvg: aTotal > 0 ? Number((aOverall / aTotal).toFixed(3)) : 0,
          bOverallAvg: bTotal > 0 ? Number((bOverall / bTotal).toFixed(3)) : 0,
          aTotal, bTotal,
          overallWinner: aTotal === 0 && bTotal === 0 ? "tie" : (aTotal > 0 ? aOverall / aTotal : 0) > (bTotal > 0 ? bOverall / bTotal : 0) ? "a" : (bTotal > 0 ? bOverall / bTotal : 0) > (aTotal > 0 ? aOverall / aTotal : 0) ? "b" : "tie",
        },
      };
    }),

  /** Get leaderboard for a specific game */
  byGame: publicProcedure
    .input(z.object({ gameType: gameTypeSchema }))
    .query(async ({ input }) => {
      const stats = await getModelPerformanceStats(input.gameType);
      const models = stats.map(s => {
        const total = Number(s.totalPredictions) || 0;
        const avgHits = Number(Number(s.avgMainHits).toFixed(3));
        return {
          modelName: s.modelName,
          totalEvaluated: total,
          avgMainHits: avgHits,
          avgSpecialHits: Number(Number(s.avgSpecialHits).toFixed(3)),
          maxMainHits: Number(s.maxMainHits) || 0,
        };
      }).sort((a, b) => b.avgMainHits - a.avgMainHits);
      return { models, gameType: input.gameType };
    }),
});
