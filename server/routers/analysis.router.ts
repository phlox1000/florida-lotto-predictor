import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { checkRateLimit } from "../lib/rateLimiter";
import { gameTypeSchema } from "./routerUtils";
import { generateAnalysis } from "../services/analysis.service";

export const analysisRouter = router({
  /** Get LLM-powered analysis of predictions and patterns */
  generate: publicProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      analysisType: z.enum(["model_performance", "pattern_analysis", "strategy_recommendation"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const ip = ctx.req?.ip ?? ctx.req?.headers?.["x-forwarded-for"] ?? "unknown";
      const rl = checkRateLimit(String(ip), 3, 60_000);
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many analysis requests. Please wait before trying again.",
        });
      }
      return generateAnalysis(input.gameType, input.analysisType);
    }),
});
