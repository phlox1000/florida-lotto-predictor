import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getModelPerformanceStats, getModelWeights } from "../db";
import { gameTypeSchema } from "./routerUtils";
import { getLearningStatusByGame, runLearningBacktestComparison } from "../services/learningValidation.service";

export const performanceRouter = router({
  /** Get model performance stats for a game */
  stats: publicProcedure
    .input(z.object({ gameType: gameTypeSchema }))
    .query(async ({ input }) => {
      return getModelPerformanceStats(input.gameType);
    }),

  /** Get current model weights based on historical accuracy */
  weights: publicProcedure
    .input(z.object({ gameType: gameTypeSchema }))
    .query(async ({ input }) => {
      return getModelWeights(input.gameType);
    }),

  /** Developer-facing visibility into learning status by game */
  learningStatus: protectedProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      windowDays: z.number().min(7).max(365).default(90),
    }))
    .query(async ({ input, ctx }) => {
      return getLearningStatusByGame(input.gameType, ctx.user.id, input.windowDays);
    }),

  /** Lightweight deterministic comparison: baseline vs event fallback vs table-backed learning */
  learningBacktest: protectedProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      lookbackDraws: z.number().min(5).max(60).default(20),
      windowDays: z.number().min(7).max(365).default(90),
    }))
    .query(async ({ input, ctx }) => {
      return runLearningBacktestComparison({
        gameType: input.gameType,
        lookbackDraws: input.lookbackDraws,
        windowDays: input.windowDays,
        userId: ctx.user.id,
      });
    }),
});
