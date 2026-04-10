import { z } from "zod";
import { FLORIDA_GAMES } from "@shared/lottery";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getUserPredictions, getRecentPredictions } from "../db";
import { checkRateLimit } from "../lib/rateLimiter";
import { gameTypeSchema } from "./routerUtils";
import { generatePredictions, generateQuickPicks } from "../services/predictions.service";

export const predictionsRouter = router({
  /** Run all 18 models for a game type, using accuracy-based weights when available */
  generate: publicProcedure
    .input(z.object({ gameType: gameTypeSchema, sumRangeFilter: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      const ip = ctx.req?.ip ?? ctx.req?.headers?.["x-forwarded-for"] ?? "unknown";
      const rl = checkRateLimit(String(ip), 10, 60_000);
      if (!rl.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many requests. Please wait before generating again.",
        });
      }
      return generatePredictions(input.gameType, input.sumRangeFilter, ctx.user?.id);
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
      return {
        picks: generateQuickPicks(cfg, input.count),
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
