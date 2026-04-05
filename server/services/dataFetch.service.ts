import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { notifyOwner } from "../_core/notification";
import { fetchHistoricalDraws } from "../lib/fl-lottery-scraper";
import { fetchRecentDraws, fetchAllGamesRecent } from "../lib/lotteryusa-scraper";
import { insertDrawResult, evaluatePredictionsAgainstDraw } from "../db";
import { getLastAutoFetchResult, isAutoFetchActive, getAutoFetchRunning, runAutoFetch } from "../cron";

/** Shared workflow: insert a draw, evaluate predictions, and notify if high accuracy detected. */
async function insertAndEvaluateDraw(
  gameType: string,
  draw: { drawDate: string; mainNumbers: number[]; specialNumbers: number[]; drawTime?: string },
  source: string,
): Promise<boolean> {
  const insertResult = await insertDrawResult({
    gameType,
    drawDate: new Date(draw.drawDate).getTime(),
    mainNumbers: draw.mainNumbers,
    specialNumbers: draw.specialNumbers,
    drawTime: draw.drawTime,
    source,
  });

  const drawId = (insertResult as any)?.[0]?.insertId ?? 0;
  if (drawId) {
    const evalResult = await evaluatePredictionsAgainstDraw(
      drawId, gameType, draw.mainNumbers, draw.specialNumbers,
    );
    if (evalResult.highAccuracy > 3) {
      await notifyOwner({
        title: "High Prediction Accuracy Detected",
        content: `${evalResult.highAccuracy} predictions matched 60%+ of ${FLORIDA_GAMES[gameType as GameType]?.name ?? gameType} draw on ${draw.drawDate}. ${evalResult.evaluated} predictions evaluated.`,
      });
    }
  }

  return true;
}

export function getAutoFetchStatus() {
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
}

export async function triggerAutoFetch() {
  return runAutoFetch();
}

export async function fetchLatestForGame(gameType: string) {
  try {
    const draws = await fetchRecentDraws(gameType as GameType);
    let insertedCount = 0;

    for (const draw of draws) {
      try {
        await insertAndEvaluateDraw(gameType, draw, "lotteryusa.com");
        insertedCount++;
      } catch (_e) {
        // Duplicate draw, skip silently
      }
    }

    return { success: true, data: { draws }, insertedCount };
  } catch (e) {
    console.error("[DataFetch] fetchLatest failed:", e);
    return { success: false, data: null, insertedCount: 0 };
  }
}

export async function fetchAllGames() {
  const results: Record<string, { success: boolean; count: number }> = {};

  try {
    const allGames = await fetchAllGamesRecent();

    for (const [gt, draws] of Object.entries(allGames)) {
      if (!FLORIDA_GAMES[gt as GameType]) continue;
      let count = 0;
      for (const draw of draws) {
        try {
          await insertAndEvaluateDraw(gt, draw, "lotteryusa.com");
          count++;
        } catch (_e) {
          // Duplicate, skip
        }
      }
      results[gt] = { success: true, count };
    }
  } catch (e) {
    console.error("[DataFetch] fetchAll failed:", e);
  }

  return { success: true, results };
}

export async function fetchHistoryForGame(gameType: string, drawCount: number) {
  try {
    const cfg = FLORIDA_GAMES[gameType as GameType];
    const draws = await fetchHistoricalDraws(gameType as GameType, drawCount);
    let insertedCount = 0;
    let skippedCount = 0;

    for (const draw of draws) {
      try {
        await insertDrawResult({
          gameType,
          drawDate: new Date(draw.drawDate).getTime(),
          mainNumbers: draw.mainNumbers,
          specialNumbers: draw.specialNumbers,
          drawTime: draw.drawTime,
          source: "lotteryusa.com",
        });
        insertedCount++;
      } catch (_e) {
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
}
