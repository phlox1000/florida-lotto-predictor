import { z } from "zod";
import { FLORIDA_GAMES } from "@shared/lottery";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { runAllModels, applySumRangeFilter } from "../predictions";
import {
  getDrawResults, insertPredictions, getUserPredictions,
  getRecentPredictions, getModelWeights,
} from "../db";
import { gameTypeSchema } from "./routerUtils";

export const predictionsRouter = router({
  /** Run all 18 models for a game type, using accuracy-based weights when available */
  generate: publicProcedure
    .input(z.object({ gameType: gameTypeSchema, sumRangeFilter: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      const cfg = FLORIDA_GAMES[input.gameType];
      const historyRows = await getDrawResults(input.gameType, 200);
      const history = historyRows.map(r => ({
        mainNumbers: r.mainNumbers as number[],
        specialNumbers: (r.specialNumbers as number[]) || [],
        drawDate: r.drawDate,
      }));

      const modelWeights = await getModelWeights(input.gameType);
      let allPredictions = runAllModels(cfg, history, Object.keys(modelWeights).length > 0 ? modelWeights : undefined);

      if (input.sumRangeFilter) {
        allPredictions = applySumRangeFilter(allPredictions, cfg, history);
      }

      if (ctx.user) {
        try {
          await insertPredictions(allPredictions.map(p => ({
            userId: ctx.user!.id,
            gameType: input.gameType,
            modelName: p.modelName,
            mainNumbers: p.mainNumbers,
            specialNumbers: p.specialNumbers,
            confidenceScore: p.confidenceScore,
            metadata: p.metadata,
          })));
        } catch (e) {
          console.warn("[Predictions] Failed to persist:", e);
        }
      }

      return {
        predictions: allPredictions,
        gameType: input.gameType,
        gameName: cfg.name,
        weightsUsed: Object.keys(modelWeights).length > 0,
        sumRangeFilterApplied: input.sumRangeFilter,
      };
    }),

  /** Get user's prediction history */
  history: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      return getUserPredictions(ctx.user.id, input.limit);
    }),

  /** Generate Quick Pick random numbers for comparison against model predictions */
  quickPick: publicProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      count: z.number().min(1).max(20).default(5),
    }))
    .mutation(({ input }) => {
      const cfg = FLORIDA_GAMES[input.gameType];
      const picks: Array<{ mainNumbers: number[]; specialNumbers: number[] }> = [];

      for (let i = 0; i < input.count; i++) {
        let mainNumbers: number[];
        if (cfg.isDigitGame) {
          mainNumbers = Array.from({ length: cfg.mainCount }, () => Math.floor(Math.random() * 10));
        } else {
          const pool = Array.from({ length: cfg.mainMax }, (_, i) => i + 1);
          mainNumbers = [];
          for (let j = 0; j < cfg.mainCount; j++) {
            const idx = Math.floor(Math.random() * pool.length);
            mainNumbers.push(pool[idx]);
            pool.splice(idx, 1);
          }
          mainNumbers.sort((a, b) => a - b);
        }

        let specialNumbers: number[] = [];
        if (cfg.specialCount > 0) {
          const specPool = Array.from({ length: cfg.specialMax }, (_, i) => i + 1);
          for (let j = 0; j < cfg.specialCount; j++) {
            const idx = Math.floor(Math.random() * specPool.length);
            specialNumbers.push(specPool[idx]);
            specPool.splice(idx, 1);
          }
          specialNumbers.sort((a, b) => a - b);
        }

        picks.push({ mainNumbers, specialNumbers });
      }

      return {
        picks,
        gameType: input.gameType,
        gameName: cfg.name,
      };
    }),

  /** Get recent predictions for a game (public) */
  recent: publicProcedure
    .input(z.object({ gameType: gameTypeSchema, limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      return getRecentPredictions(input.gameType, input.limit);
    }),
});
