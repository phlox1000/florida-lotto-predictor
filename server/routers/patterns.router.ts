import { z } from "zod";
import { FLORIDA_GAMES } from "@shared/lottery";
import { publicProcedure, router } from "../_core/trpc";
import { getDrawResults } from "../db";
import { gameTypeSchema } from "./routerUtils";
import { analyzePatterns, buildHeatmap } from "../services/patterns.service";

export const patternsRouter = router({
  /** Full pattern analysis for a game: frequency, streaks, overdue, pairs */
  analyze: publicProcedure
    .input(z.object({ gameType: gameTypeSchema, lookback: z.number().min(10).max(500).default(100) }))
    .query(async ({ input }) => {
      const draws = await getDrawResults(input.gameType, input.lookback);
      const cfg = FLORIDA_GAMES[input.gameType];
      return analyzePatterns(draws, cfg);
    }),

  /** Heatmap: returns a grid of which numbers appeared on which dates */
  heatmap: publicProcedure
    .input(z.object({ gameType: gameTypeSchema, lookback: z.number().min(10).max(500).default(100) }))
    .query(async ({ input }) => {
      const draws = await getDrawResults(input.gameType, input.lookback);
      const cfg = FLORIDA_GAMES[input.gameType];
      return buildHeatmap(draws, cfg);
    }),
});
