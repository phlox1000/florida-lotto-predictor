import { z } from "zod";
import { FLORIDA_GAMES } from "@shared/lottery";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { runAllModels, selectBudgetTickets } from "../predictions";
import { scorePlayTonightTickets } from "../play-tonight";
import {
  getDrawResults, getModelWeights, insertTicketSelection,
  getUserTicketSelections, getTicketAnalytics,
} from "../db";
import { gameTypeSchema } from "./routerUtils";

export const ticketsRouter = router({
  /** Generate budget-aware ticket selection (20 tickets, $75 max) */
  generate: publicProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      budget: z.number().min(1).max(75).default(75),
      maxTickets: z.number().min(1).max(20).default(20),
    }))
    .mutation(async ({ input, ctx }) => {
      const cfg = FLORIDA_GAMES[input.gameType];
      const historyRows = await getDrawResults(input.gameType, 200);
      const history = historyRows.map(r => ({
        mainNumbers: r.mainNumbers as number[],
        specialNumbers: (r.specialNumbers as number[]) || [],
        drawDate: r.drawDate,
      }));

      const modelWeights = await getModelWeights(input.gameType);
      const allPredictions = runAllModels(cfg, history, Object.keys(modelWeights).length > 0 ? modelWeights : undefined);
      const selection = selectBudgetTickets(cfg, allPredictions, input.budget, input.maxTickets);

      const scoredTickets = scorePlayTonightTickets(
        selection.tickets,
        allPredictions,
        modelWeights,
        cfg,
        history.map(h => ({ mainNumbers: h.mainNumbers })),
      );

      if (ctx.user) {
        try {
          await insertTicketSelection({
            userId: ctx.user.id,
            gameType: input.gameType,
            budget: input.budget,
            ticketCount: selection.tickets.length,
            tickets: selection.tickets,
          });
        } catch (e) {
          console.warn("[Tickets] Failed to persist:", e);
        }
      }

      return {
        tickets: scoredTickets,
        totalCost: selection.totalCost,
        gameType: input.gameType,
        gameName: cfg.name,
        ticketPrice: cfg.ticketPrice,
      };
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
