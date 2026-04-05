import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { addFavorite, getUserFavorites, removeFavorite, incrementFavoriteUsage } from "../db";
import { gameTypeSchema } from "./routerUtils";

export const favoritesRouter = router({
  /** List user's favorites, optionally filtered by game */
  list: protectedProcedure
    .input(z.object({ gameType: gameTypeSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getUserFavorites(ctx.user.id, input?.gameType);
    }),

  /** Add a number combination to favorites */
  add: protectedProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      label: z.string().max(128).optional(),
      mainNumbers: z.array(z.number()),
      specialNumbers: z.array(z.number()).default([]),
      modelSource: z.string().optional(),
      confidence: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await addFavorite({
        userId: ctx.user.id,
        gameType: input.gameType,
        label: input.label || null,
        mainNumbers: input.mainNumbers,
        specialNumbers: input.specialNumbers,
        modelSource: input.modelSource || null,
        confidence: input.confidence || null,
      });
      return { success: true };
    }),

  /** Remove a favorite */
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await removeFavorite(input.id, ctx.user.id);
      return { success: true };
    }),

  /** Increment usage count when a favorite is re-used */
  use: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await incrementFavoriteUsage(input.id);
      return { success: true };
    }),
});
