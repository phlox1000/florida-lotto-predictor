import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { gameTypeSchema } from "./routerUtils";
import { getCompareResults, getDrawDetail } from "../services/compare.service";

export const compareRouter = router({
  /** Get recent predictions with their actual draw results and hit/miss analysis */
  results: publicProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      return getCompareResults(input.gameType, input.limit);
    }),

  /** Get detailed hit/miss for a specific draw across all models */
  drawDetail: publicProcedure
    .input(z.object({ drawId: z.number() }))
    .query(async ({ input }) => {
      return getDrawDetail(input.drawId);
    }),
});
