import { z } from "zod";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getDrawResults, getLatestDrawResults, getAllDrawResults } from "../db";
import { gameTypeSchema } from "./routerUtils";
import { addManualDraw } from "../services/draws.service";
import { emitDrawResultEntered } from "../services/eventService";

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
    .mutation(async ({ input, ctx }) => {
      const result = await addManualDraw({
        gameType: input.gameType,
        drawDate: input.drawDate,
        mainNumbers: input.mainNumbers,
        specialNumbers: input.specialNumbers || [],
        drawTime: input.drawTime,
      });
      const drawDateStr = new Date(input.drawDate).toISOString().split("T")[0];
      emitDrawResultEntered({
        userId: ctx.user.id,
        game: input.gameType,
        drawDate: drawDateStr,
        winningNumbers: input.mainNumbers,
        occurredAt: new Date(),
        platformVersion: "1.0.0",
        schemaVersion: "1.0",
      }).catch(err => console.error("[event]", err));
      return result;
    }),
});
