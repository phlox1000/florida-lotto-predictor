import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getUserTicketSelections, getTicketAnalytics } from "../db";
import { gameTypeSchema } from "./routerUtils";
import { generateTickets } from "../services/tickets.service";

export const ticketsRouter = router({
  /** Generate budget-aware ticket selection (20 tickets, $75 max) */
  generate: publicProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      budget: z.number().min(1).max(75).default(75),
      maxTickets: z.number().min(1).max(20).default(20),
    }))
    .mutation(async ({ input, ctx }) => {
      return generateTickets(
        input.gameType,
        input.budget,
        input.maxTickets,
        ctx.user?.id,
      );
    }),

  /** Get user's ticket selection history */
  history: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      return getUserTicketSelections(ctx.user.id, input.limit);
    }),

  /** Get ticket scanner analytics (models played, profit, hit rate, midday vs evening) */
  ticketAnalytics: protectedProcedure
    .query(async ({ ctx }) => {
      return getTicketAnalytics(ctx.user.id);
    }),
});
