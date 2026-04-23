import { z } from "zod";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getUserPdfUploads } from "../db";
import { gameTypeSchema } from "./routerUtils";
import {
  getAutoFetchStatus, triggerAutoFetch,
  fetchLatestForGame, fetchAllGames, fetchHistoryForGame, fetchHistoryChunk,
} from "../services/dataFetch.service";

export const dataFetchRouter = router({
  /** Get auto-fetch cron status (reads latest row from auto_fetch_runs). */
  autoFetchStatus: publicProcedure.query(async () => {
    return getAutoFetchStatus();
  }),

  /** Manually trigger auto-fetch (admin only) */
  triggerAutoFetch: adminProcedure.mutation(async () => {
    return triggerAutoFetch();
  }),

  /** Fetch latest results for a single game from lotteryusa.com */
  fetchLatest: adminProcedure
    .input(z.object({ gameType: gameTypeSchema }))
    .mutation(async ({ input }) => {
      return fetchLatestForGame(input.gameType);
    }),

  /** Fetch latest results for ALL games at once from lotteryusa.com */
  fetchAll: adminProcedure
    .mutation(async () => {
      return fetchAllGames();
    }),

  /** Get user's PDF upload history */
  pdfUploads: protectedProcedure
    .query(async ({ ctx }) => {
      return getUserPdfUploads(ctx.user.id);
    }),

  /** Fetch bulk historical data for a game (parses full history from FL Lottery) */
  fetchHistory: adminProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      drawCount: z.number().min(10).max(5000).default(200),
    }))
    .mutation(async ({ input }) => {
      return fetchHistoryForGame(input.gameType, input.drawCount);
    }),

  /**
   * Chunked variant of fetchHistory designed to stay under Render's 30s
   * request timeout. Call repeatedly with nextOffset until hasMore===false.
   *
   * Returns: { fetched, inserted, hasMore, nextOffset, totalAvailable }
   */
  fetchHistoryChunk: adminProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      offset: z.number().min(0).default(0),
      batchSize: z.number().min(1).max(100).default(50),
    }))
    .mutation(async ({ input }) => {
      return fetchHistoryChunk(input.gameType, input.offset, input.batchSize);
    }),
});
