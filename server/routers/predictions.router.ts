import { z } from "zod";
import { FLORIDA_GAMES } from "@shared/lottery";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getUserPredictions, getRecentPredictions } from "../db";
import { gameTypeSchema } from "./routerUtils";
import { generatePredictions, generateQuickPicks } from "../services/predictions.service";
import { emitPredictionGenerated, buildPredictionCorrelationId } from "../services/eventService";

export const predictionsRouter = router({
  /** Run all 18 models for a game type, using accuracy-based weights when available */
  generate: publicProcedure
    .input(z.object({ gameType: gameTypeSchema, sumRangeFilter: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      const result = await generatePredictions(input.gameType, input.sumRangeFilter, ctx.user?.id);
      const ts = Date.now();
      const correlationId = ctx.user?.id
        ? buildPredictionCorrelationId(ctx.user.id, input.gameType, ts)
        : null;
      if (ctx.user?.id && correlationId) {
        emitPredictionGenerated({
          userId: ctx.user.id,
          game: input.gameType,
          correlationId,
          modelWeights: result.modelWeights,
          picks: result.predictions.map(p => p.mainNumbers),
          confidenceScore: 0,
          platformVersion: "1.0.0",
          schemaVersion: "1.0",
          occurredAt: new Date(ts),
        }).catch(err => console.error("[event]", err));
      }
      return { ...result, correlationId };
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
