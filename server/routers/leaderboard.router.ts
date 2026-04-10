import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { gameTypeSchema } from "./routerUtils";
import {
  getAllLeaderboard, backfillEvaluations, getTrends,
  getAffinity, getStreaks, headToHead, getLeaderboardByGame,
} from "../services/leaderboard.service";

export const leaderboardRouter = router({
  /** Get comprehensive leaderboard data across all games */
  all: publicProcedure.query(async () => {
    return getAllLeaderboard();
  }),

  /** Backfill evaluations: run all stored predictions against all stored draws to populate the leaderboard */
  backfill: adminProcedure
    .input(z.object({ gameType: gameTypeSchema.optional(), sampleSize: z.number().min(5).max(200).optional() }))
    .mutation(async ({ input }) => {
      return backfillEvaluations(input.gameType, input.sampleSize);
    }),

  /** Get model accuracy trends over time (weekly rolling average) */
  trends: publicProcedure
    .input(z.object({
      gameType: gameTypeSchema.optional(),
      weeksBack: z.number().min(4).max(52).default(12),
    }))
    .query(async ({ input }) => {
      return getTrends(input.gameType, input.weeksBack);
    }),

  /** Get per-model game affinity tags (which games each model excels at) */
  affinity: publicProcedure.query(async () => {
    return getAffinity();
  }),

  /** Get prediction streak data (consecutive draws with 3+ hits) */
  streaks: publicProcedure
    .input(z.object({ minHits: z.number().min(1).max(6).default(3) }))
    .query(async ({ input }) => {
      return getStreaks(input.minHits);
    }),

  /** Head-to-Head comparison of two models */
  headToHead: publicProcedure
    .input(z.object({
      modelA: z.string(),
      modelB: z.string(),
    }))
    .query(async ({ input }) => {
      return headToHead(input.modelA, input.modelB);
    }),

  /** Get leaderboard for a specific game */
  byGame: publicProcedure
    .input(z.object({ gameType: gameTypeSchema }))
    .query(async ({ input }) => {
      return getLeaderboardByGame(input.gameType);
    }),
});
