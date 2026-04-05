import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { gameTypeSchema } from "./routerUtils";
import { generateAnalysis } from "../services/analysis.service";

export const analysisRouter = router({
  /** Get LLM-powered analysis of predictions and patterns */
  generate: publicProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      analysisType: z.enum(["model_performance", "pattern_analysis", "strategy_recommendation"]),
    }))
    .mutation(async ({ input }) => {
      return generateAnalysis(input.gameType, input.analysisType);
    }),
});
