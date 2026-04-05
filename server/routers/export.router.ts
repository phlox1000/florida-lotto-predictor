import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { gameTypeSchema } from "./routerUtils";

export const exportRouter = router({
  /** Generate a printable PDF of ticket selections */
  ticketsPdf: publicProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      gameName: z.string(),
      tickets: z.array(z.object({
        mainNumbers: z.array(z.number()),
        specialNumbers: z.array(z.number()),
        modelSource: z.string(),
        confidence: z.number(),
      })),
      budget: z.number(),
      totalCost: z.number(),
    }))
    .mutation(async ({ input }) => {
      const drawDate = new Date();
      return {
        gameName: input.gameName,
        gameType: input.gameType,
        tickets: input.tickets,
        budget: input.budget,
        totalCost: input.totalCost,
        generatedAt: drawDate.toISOString(),
        ticketCount: input.tickets.length,
      };
    }),
});
