import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getModelPerformanceStats, getModelWeights } from "../db";
import { gameTypeSchema } from "./routerUtils";

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
});
