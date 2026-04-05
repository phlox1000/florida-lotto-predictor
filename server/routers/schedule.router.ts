import { z } from "zod";
import { FLORIDA_GAMES, GAME_TYPES, getNextDrawDate, formatTimeUntil } from "@shared/lottery";
import { publicProcedure, router } from "../_core/trpc";
import { getDrawResultCount } from "../db";
import { gameTypeSchema } from "./routerUtils";

export const scheduleRouter = router({
  /** Get draw schedule and next draw info for all games */
  all: publicProcedure.query(() => {
    const schedules = GAME_TYPES.map(gt => {
      const cfg = FLORIDA_GAMES[gt];
      const nextDraw = getNextDrawDate(gt);
      return {
        gameType: gt,
        gameName: cfg.name,
        schedule: cfg.schedule,
        nextDraw: nextDraw ? nextDraw.toISOString() : null,
        countdown: nextDraw ? formatTimeUntil(nextDraw) : cfg.schedule.ended ? "Game ended" : "Unknown",
        ticketPrice: cfg.ticketPrice,
      };
    });
    return schedules;
  }),

  /** Get next draw info for a specific game */
  next: publicProcedure
    .input(z.object({ gameType: gameTypeSchema }))
    .query(({ input }) => {
      const cfg = FLORIDA_GAMES[input.gameType];
      const nextDraw = getNextDrawDate(input.gameType);
      return {
        gameType: input.gameType,
        gameName: cfg.name,
        schedule: cfg.schedule,
        nextDraw: nextDraw ? nextDraw.toISOString() : null,
        countdown: nextDraw ? formatTimeUntil(nextDraw) : cfg.schedule.ended ? "Game ended" : "Unknown",
      };
    }),

  /** Get data health: how many draws we have per game */
  dataHealth: publicProcedure.query(async () => {
    const health = await Promise.all(
      GAME_TYPES.map(async (gt) => ({
        gameType: gt,
        gameName: FLORIDA_GAMES[gt].name,
        drawCount: await getDrawResultCount(gt),
      }))
    );
    return health;
  }),
});
