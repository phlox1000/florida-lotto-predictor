import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { gameTypeSchema } from "./routerUtils";
import { exportDrawResultsCsv, exportPredictionsCsv } from "../services/csvExport.service";

export const csvExportRouter = router({
  /** Export draw results as CSV */
  drawResults: publicProcedure
    .input(z.object({
      gameType: gameTypeSchema.optional(),
      limit: z.number().min(1).max(5000).default(500),
    }))
    .query(async ({ input }) => {
      return exportDrawResultsCsv(input.gameType, input.limit);
    }),

  /** Export prediction history as CSV */
  predictions: protectedProcedure
    .input(z.object({
      gameType: gameTypeSchema.optional(),
      limit: z.number().min(1).max(5000).default(500),
    }))
    .query(async ({ ctx, input }) => {
      return exportPredictionsCsv(ctx.user.id, input.gameType, input.limit);
    }),
});
