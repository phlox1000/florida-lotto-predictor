import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  insertPurchasedTicket, getUserPurchasedTickets, updatePurchasedTicketOutcome,
  deletePurchasedTicket, getUserROIStats, getROIByGame,
} from "../db";
import { gameTypeSchema } from "./routerUtils";
import { emitPredictionActedOn } from "../services/eventService";

export const trackerRouter = router({
  /** Log a purchased ticket */
  logPurchase: protectedProcedure
    .input(z.object({
      gameType: gameTypeSchema,
      mainNumbers: z.array(z.number()),
      specialNumbers: z.array(z.number()).optional(),
      purchaseDate: z.number(),
      drawDate: z.number().optional(),
      cost: z.number().min(0),
      notes: z.string().optional(),
      modelSource: z.string().optional(),
      correlationId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = await insertPurchasedTicket({
        userId: ctx.user.id,
        gameType: input.gameType,
        mainNumbers: input.mainNumbers,
        specialNumbers: input.specialNumbers || [],
        purchaseDate: input.purchaseDate,
        drawDate: input.drawDate,
        cost: input.cost,
        notes: input.notes,
        modelSource: input.modelSource,
      });
      const correlationId = input.correlationId ?? `unlinked:${ctx.user.id}:${Date.now()}`;
      emitPredictionActedOn({
        userId: ctx.user.id,
        correlationId,
        action: "purchased",
        ticketCost: input.cost,
        occurredAt: new Date(),
        platformVersion: "1.0.0",
        schemaVersion: "1.0",
      }).catch(err => console.error("[event]", err));
      return { success: true, id };
    }),

  /** Log multiple purchased tickets at once (e.g., from budget selection) */
  logBulkPurchase: protectedProcedure
    .input(z.object({
      tickets: z.array(z.object({
        gameType: gameTypeSchema,
        mainNumbers: z.array(z.number()),
        specialNumbers: z.array(z.number()).optional(),
        cost: z.number().min(0),
        modelSource: z.string().optional(),
      })),
      purchaseDate: z.number(),
      drawDate: z.number().optional(),
      correlationId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const correlationId = input.correlationId ?? `unlinked:${ctx.user.id}:${Date.now()}`;
      let count = 0;
      for (const ticket of input.tickets) {
        try {
          await insertPurchasedTicket({
            userId: ctx.user.id,
            gameType: ticket.gameType,
            mainNumbers: ticket.mainNumbers,
            specialNumbers: ticket.specialNumbers || [],
            purchaseDate: input.purchaseDate,
            drawDate: input.drawDate,
            cost: ticket.cost,
            modelSource: ticket.modelSource,
          });
          count++;
          emitPredictionActedOn({
            userId: ctx.user.id,
            correlationId,
            action: "purchased",
            ticketCost: ticket.cost,
            occurredAt: new Date(),
            platformVersion: "1.0.0",
            schemaVersion: "1.0",
          }).catch(err => console.error("[event]", err));
        } catch (e) {
          console.warn("[Tracker] Failed to log ticket:", e);
        }
      }
      return { success: true, count };
    }),

  /** Update a ticket's outcome (win/loss) */
  updateOutcome: protectedProcedure
    .input(z.object({
      id: z.number(),
      outcome: z.enum(["pending", "loss", "win"]),
      winAmount: z.number().optional(),
      mainHits: z.number().optional(),
      specialHits: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await updatePurchasedTicketOutcome(
        input.id, ctx.user.id, input.outcome,
        input.winAmount, input.mainHits, input.specialHits
      );
      return { success: true };
    }),

  /** Delete a purchased ticket */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await deletePurchasedTicket(input.id, ctx.user.id);
      return { success: true };
    }),

  /** Get user's purchased tickets */
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(100) }))
    .query(async ({ ctx, input }) => {
      return getUserPurchasedTickets(ctx.user.id, input.limit);
    }),

  /** Get user's ROI stats */
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      return getUserROIStats(ctx.user.id);
    }),

  /** Get ROI broken down by game */
  statsByGame: protectedProcedure
    .query(async ({ ctx }) => {
      return getROIByGame(ctx.user.id);
    }),
});
