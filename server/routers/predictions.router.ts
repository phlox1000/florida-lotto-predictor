import { z, ZodError } from "zod";
import { isAxiosError } from "axios";
import { TRPCError } from "@trpc/server";
import { FLORIDA_GAMES } from "@shared/lottery";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getUserPredictions, getRecentPredictions } from "../db";
import { gameTypeSchema } from "./routerUtils";
import { generatePredictions, generateQuickPicks } from "../services/predictions.service";
import { emitPredictionGenerated, buildPredictionCorrelationId } from "../services/eventService";

function isAuthRelatedError(err: unknown): boolean {
  if (err instanceof TRPCError) return err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN";
  if (isAxiosError(err)) {
    const status = err.response?.status;
    if (status === 401 || status === 403) return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/oauth|unauthor|forbidden|invalid session|token/i.test(msg)) return true;
  return false;
}

function isTimeoutError(err: unknown): boolean {
  if (isAxiosError(err) && err.code === "ECONNABORTED") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|timed out|ETIMEDOUT|ECONNRESET/i.test(msg);
}

export const predictionsRouter = router({
  /** Run all 18 models for a game type, using accuracy-based weights when available */
  generate: publicProcedure
    .input(z.object({ gameType: gameTypeSchema, sumRangeFilter: z.boolean().default(false) }))
    .mutation(async ({ input, ctx }) => {
      const ts = Date.now();
      const correlationId = ctx.user?.id
        ? buildPredictionCorrelationId(ctx.user.id, input.gameType, ts)
        : null;
      try {
        const result = await generatePredictions(
          input.gameType,
          input.sumRangeFilter,
          ctx.user?.id,
          correlationId ?? undefined,
        );
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
      } catch (err) {
        console.error("[predictions.generate] failed", { gameType: input.gameType, error: err });
        if (err instanceof ZodError) {
          throw err;
        }
        if (err instanceof TRPCError) {
          throw err;
        }
        if (isAuthRelatedError(err)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Session or OAuth verification failed. Sign in again.",
            cause: err,
          });
        }
        if (isTimeoutError(err)) {
          throw new TRPCError({
            code: "TIMEOUT",
            message: "The model service took too long to respond. Try again.",
            cause: err,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Prediction generation failed. Try again in a moment.",
          cause: err,
        });
      }
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
