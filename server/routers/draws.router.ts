import { z } from "zod";
import { FLORIDA_GAMES } from "@shared/lottery";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";
import {
  getDrawResults, insertDrawResult, getLatestDrawResults,
  getAllDrawResults, evaluatePredictionsAgainstDraw,
} from "../db";
import { gameTypeSchema } from "./routerUtils";

export const drawsRouter = router({
  /** Get latest draw results across all games */
  latest: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      return getLatestDrawResults(input.limit);
    }),

  /** Get draw results for a specific game */
  byGame: publicProcedure
    .input(z.object({ gameType: gameTypeSchema, limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      return getDrawResults(input.gameType, input.limit);
    }),

  /** Get all draw results */
  all: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(500).default(100) }))
    .query(async ({ input }) => {
      return getAllDrawResults(input.limit);
    }),

  /** Admin: manually add a draw result */
  add: adminProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      drawDate: z.number(),
      mainNumbers: z.array(z.number()),
      specialNumbers: z.array(z.number()).optional(),
      drawTime: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await insertDrawResult({
        gameType: input.gameType,
        drawDate: input.drawDate,
        mainNumbers: input.mainNumbers,
        specialNumbers: input.specialNumbers || [],
        drawTime: input.drawTime,
        source: "manual",
      });

      const drawId = (result as any)?.[0]?.insertId ?? 0;
      try {
        const evalResult = await evaluatePredictionsAgainstDraw(
          drawId,
          input.gameType,
          input.mainNumbers,
          input.specialNumbers || []
        );

        if (evalResult.highAccuracy > 3) {
          await notifyOwner({
            title: "High Prediction Accuracy Detected",
            content: `${evalResult.highAccuracy} predictions matched 60%+ of the latest ${FLORIDA_GAMES[input.gameType].name} draw (${input.mainNumbers.join(", ")}). ${evalResult.evaluated} total predictions evaluated.`,
          });
        }
      } catch (e) {
        console.warn("[Draws] Auto-evaluation failed:", e);
      }

      return { success: true };
    }),
});
