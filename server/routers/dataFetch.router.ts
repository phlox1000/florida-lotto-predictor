import { z } from "zod";
import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";
import { fetchHistoricalDraws } from "../lib/fl-lottery-scraper";
import { getLastAutoFetchResult, isAutoFetchActive, getAutoFetchRunning, runAutoFetch } from "../cron";
import { fetchRecentDraws, fetchAllGamesRecent } from "../lib/lotteryusa-scraper";
import {
  insertDrawResult, evaluatePredictionsAgainstDraw, getUserPdfUploads,
} from "../db";
import { gameTypeSchema } from "./routerUtils";

export const dataFetchRouter = router({
  /** Get auto-fetch cron status */
  autoFetchStatus: publicProcedure.query(() => {
    const lastResult = getLastAutoFetchResult();
    return {
      isScheduleActive: isAutoFetchActive(),
      isRunning: getAutoFetchRunning(),
      lastRun: lastResult ? {
        timestamp: lastResult.timestamp,
        gamesProcessed: lastResult.gamesProcessed,
        totalNewDraws: lastResult.totalNewDraws,
        totalEvaluations: lastResult.totalEvaluations,
        highAccuracyAlerts: lastResult.highAccuracyAlerts,
        gameResults: lastResult.gameResults,
        errors: lastResult.errors,
      } : null,
    };
  }),

  /** Manually trigger auto-fetch (admin only) */
  triggerAutoFetch: adminProcedure.mutation(async () => {
    const result = await runAutoFetch();
    return result;
  }),

  /** Fetch latest results for a single game from lotteryusa.com */
  fetchLatest: adminProcedure
    .input(z.object({ gameType: gameTypeSchema }))
    .mutation(async ({ input }) => {
      try {
        const draws = await fetchRecentDraws(input.gameType as GameType);
        let insertedCount = 0;

        for (const draw of draws) {
          try {
            const insertResult = await insertDrawResult({
              gameType: input.gameType,
              drawDate: new Date(draw.drawDate).getTime(),
              mainNumbers: draw.mainNumbers,
              specialNumbers: draw.specialNumbers,
              drawTime: draw.drawTime,
              source: "lotteryusa.com",
            });
            insertedCount++;

            const drawId = (insertResult as any)?.[0]?.insertId ?? 0;
            if (drawId) {
              const evalResult = await evaluatePredictionsAgainstDraw(
                drawId, input.gameType, draw.mainNumbers, draw.specialNumbers
              );
              if (evalResult.highAccuracy > 3) {
                await notifyOwner({
                  title: "High Prediction Accuracy Detected",
                  content: `${evalResult.highAccuracy} predictions matched 60%+ of ${FLORIDA_GAMES[input.gameType].name} draw on ${draw.drawDate}. ${evalResult.evaluated} predictions evaluated.`,
                });
              }
            }
          } catch (e) {
            // Duplicate draw, skip silently
          }
        }

        return { success: true, data: { draws }, insertedCount };
      } catch (e) {
        console.error("[DataFetch] fetchLatest failed:", e);
        return { success: false, data: null, insertedCount: 0 };
      }
    }),

  /** Fetch latest results for ALL games at once from lotteryusa.com */
  fetchAll: adminProcedure
    .mutation(async () => {
      const results: Record<string, { success: boolean; count: number }> = {};

      try {
        const allGames = await fetchAllGamesRecent();

        for (const [gt, draws] of Object.entries(allGames)) {
          if (!FLORIDA_GAMES[gt as GameType]) continue;
          let count = 0;
          for (const draw of draws) {
            try {
              const insertResult = await insertDrawResult({
                gameType: gt,
                drawDate: new Date(draw.drawDate).getTime(),
                mainNumbers: draw.mainNumbers,
                specialNumbers: draw.specialNumbers,
                drawTime: draw.drawTime,
                source: "lotteryusa.com",
              });
              count++;

              const drawId = (insertResult as any)?.[0]?.insertId ?? 0;
              if (drawId) {
                const evalResult = await evaluatePredictionsAgainstDraw(
                  drawId, gt, draw.mainNumbers, draw.specialNumbers
                );
                if (evalResult.highAccuracy > 3) {
                  await notifyOwner({
                    title: "High Prediction Accuracy Detected",
                    content: `${evalResult.highAccuracy} predictions matched 60%+ of ${FLORIDA_GAMES[gt as GameType].name} draw on ${draw.drawDate}.`,
                  });
                }
              }
            } catch (e) {
              // Duplicate, skip
            }
          }
          results[gt] = { success: true, count };
        }
      } catch (e) {
        console.error("[DataFetch] fetchAll failed:", e);
      }

      return { success: true, results };
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
      try {
        const cfg = FLORIDA_GAMES[input.gameType];
        const draws = await fetchHistoricalDraws(input.gameType as GameType, input.drawCount);
        let insertedCount = 0;
        let skippedCount = 0;

        for (const draw of draws) {
          try {
            await insertDrawResult({
              gameType: input.gameType,
              drawDate: new Date(draw.drawDate).getTime(),
              mainNumbers: draw.mainNumbers,
              specialNumbers: draw.specialNumbers,
              drawTime: draw.drawTime,
              source: "lotteryusa.com",
            });
            insertedCount++;
          } catch (e) {
            skippedCount++;
          }
        }

        if (insertedCount > 10) {
          await notifyOwner({
            title: "Historical Data Loaded",
            content: `Loaded ${insertedCount} historical draws for ${cfg.name}. ${skippedCount} duplicates skipped. Total found: ${draws.length}. Prediction models now have more data.`,
          });
        }

        return { success: true, insertedCount, skippedCount, totalFound: draws.length };
      } catch (e) {
        console.error("[DataFetch] fetchHistory failed:", e);
        return { success: false, insertedCount: 0, skippedCount: 0, totalFound: 0 };
      }
    }),
});
