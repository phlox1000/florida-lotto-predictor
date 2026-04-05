import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDrawResults, getModelPerformanceStats } from "../db";
import { gameTypeSchema } from "./routerUtils";

export const compareRouter = router({
  /** Get recent predictions with their actual draw results and hit/miss analysis */
  results: publicProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const drawRows = await getDrawResults(input.gameType, input.limit);
      const perfStats = await getModelPerformanceStats(input.gameType);

      const comparisons = drawRows.map(draw => {
        const mainNums = draw.mainNumbers as number[];
        const specialNums = (draw.specialNumbers as number[]) || [];
        return {
          drawId: draw.id,
          gameType: draw.gameType,
          drawDate: draw.drawDate,
          drawTime: draw.drawTime,
          mainNumbers: mainNums,
          specialNumbers: specialNums,
        };
      });

      const modelSummary = perfStats.map(s => ({
        modelName: s.modelName,
        totalEvaluated: Number(s.totalPredictions) || 0,
        avgMainHits: Number(Number(s.avgMainHits).toFixed(2)),
        avgSpecialHits: Number(Number(s.avgSpecialHits).toFixed(2)),
        maxMainHits: Number(s.maxMainHits) || 0,
      }));

      return { comparisons, modelSummary, gameType: input.gameType };
    }),

  /** Get detailed hit/miss for a specific draw across all models */
  drawDetail: publicProcedure
    .input(z.object({ drawId: z.number() }))
    .query(async ({ input }) => {
      const { getDb } = await import("../db");
      const { modelPerformance, drawResults, predictions } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return { draw: null, modelResults: [] };

      const drawRow = await db.select().from(drawResults).where(eq(drawResults.id, input.drawId)).limit(1);
      if (drawRow.length === 0) return { draw: null, modelResults: [] };
      const draw = drawRow[0];

      const perfRows = await db.select({
        modelName: modelPerformance.modelName,
        mainHits: modelPerformance.mainHits,
        specialHits: modelPerformance.specialHits,
        predictionId: modelPerformance.predictionId,
      }).from(modelPerformance)
        .where(eq(modelPerformance.drawResultId, input.drawId));

      const modelResults = await Promise.all(perfRows.map(async (perf) => {
        let predNumbers: { main: number[]; special: number[] } = { main: [], special: [] };
        if (perf.predictionId) {
          const predRow = await db.select().from(predictions).where(eq(predictions.id, perf.predictionId)).limit(1);
          if (predRow.length > 0) {
            predNumbers = {
              main: predRow[0].mainNumbers as number[],
              special: (predRow[0].specialNumbers as number[]) || [],
            };
          }
        }
        return {
          modelName: perf.modelName,
          mainHits: perf.mainHits,
          specialHits: perf.specialHits,
          predictedMain: predNumbers.main,
          predictedSpecial: predNumbers.special,
        };
      }));

      return {
        draw: {
          id: draw.id,
          gameType: draw.gameType,
          drawDate: draw.drawDate,
          mainNumbers: draw.mainNumbers as number[],
          specialNumbers: (draw.specialNumbers as number[]) || [],
        },
        modelResults: modelResults.sort((a, b) => b.mainHits - a.mainHits),
      };
    }),
});
