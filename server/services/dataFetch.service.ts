import { FLORIDA_GAMES, type GameType } from "@shared/lottery";
import { notifyOwner } from "../_core/notification";
import { fetchHistoricalDraws } from "../lib/fl-lottery-scraper";
import { fetchRecentDraws, fetchAllGamesRecent } from "../lib/lotteryusa-scraper";
import { insertDrawResult, evaluatePredictionsAgainstDraw, getLatestAutoFetchRun } from "../db";
import { runAutoFetch } from "../cron";

// A scrape completed within this window counts as "schedule is still alive".
// Cadence is every 6h, so 7h gives one full grace interval for a delayed
// run (slow upstream, transient DB blip, Render cron queue lag) before the
// dashboard flips to "Inactive". If this flips falsely-inactive too often,
// bump it — the number isn't load-bearing for correctness, only for UX.
const SCHEDULE_FRESHNESS_MS = 7 * 60 * 60 * 1000;

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
    const drawDateStr = new Date(draw.drawDate).toISOString().split("T")[0];
    const evalResult = await evaluatePredictionsAgainstDraw(
      drawId, gameType, draw.mainNumbers, draw.specialNumbers, drawDateStr,
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

/**
 * Report the status of the auto-fetch scraper to the admin dashboard.
 *
 * Reads from the auto_fetch_runs DB table rather than module-level
 * variables on server/cron.ts because the actual scrape runs in a
 * separate process (Render Cron Job executing dist/cron-runner.js); the
 * web service only sees its own empty in-memory state otherwise. The
 * shape of the returned object is preserved byte-for-byte from the
 * pre-PR-31 version so the admin UI and autoFetchStatus test don't need
 * to change.
 */
export async function getAutoFetchStatus() {
  const row = await getLatestAutoFetchRun();

  if (!row) {
    // No run has ever been recorded — fresh DB, or the cron job hasn't
    // fired yet. Distinct from "schedule broken": we don't know either
    // way, so report the neutral "inactive, not running" state.
    return {
      isScheduleActive: false,
      isRunning: false,
      lastRun: null,
    };
  }

  const startedAt = Number(row.startedAt);
  const now = Date.now();

  return {
    // "Schedule active" = we saw a run recently enough that the external
    // scheduler is plausibly still firing. Does NOT rely on in-process
    // setInterval state (which doesn't exist in the web pod anymore).
    isScheduleActive: startedAt > now - SCHEDULE_FRESHNESS_MS,
    // "Running" = the most recent row is in flight (no finishedAt yet).
    // Becomes true from the moment the cron-runner writes its start row
    // until it writes the finish row, so the dashboard spinner matches
    // reality across processes.
    isRunning: row.status === "running",
    lastRun: {
      timestamp: startedAt,
      gamesProcessed: row.gamesProcessed,
      totalNewDraws: row.totalNewDraws,
      totalEvaluations: row.totalEvaluations,
      highAccuracyAlerts: row.highAccuracyAlerts,
      // gameResults/errors default to safe empty values when the row is
      // still in "running" (no outcome recorded yet) or the JSON column is
      // NULL for any reason — keeps the client contract total for
      // consumers that do `status.lastRun.errors.length` without guards.
      gameResults:
        (row.gameResults as Record<string, { newDraws: number; evaluations: number; errors: number }> | null)
        ?? {},
      errors: (row.errors as string[] | null) ?? [],
    },
  };
}

export async function triggerAutoFetch() {
  return runAutoFetch("manual");
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

/**
 * Fetch and insert one chunk of historical draws, designed to stay under
 * Render's 30-second request timeout. Each call:
 *   1. Scrapes the full history from FL Lottery (one HTTP fetch)
 *   2. Slices [offset .. offset+batchSize]
 *   3. Inserts only that slice
 *   4. Returns pagination cursors so the client can loop until hasMore===false
 *
 * A 25-second guard (5s under Render's hard limit) wraps the scrape so a
 * slow upstream response returns hasMore:true at the same offset instead of
 * crashing — the client will retry from where it left off.
 */
export async function fetchHistoryChunk(
  gameType: string,
  offset: number,
  batchSize: number,
): Promise<{
  fetched: number;
  inserted: number;
  hasMore: boolean;
  nextOffset: number;
  totalAvailable: number;
}> {
  const TIMEOUT_MS = 25_000;

  const work = async () => {
    // Fetch the full parsed list (maxDraws=0 means all), then slice client-side.
    // The HTML file is downloaded once per request; slicing is free in memory.
    const draws = await fetchHistoricalDraws(gameType as GameType, 0);
    const chunk = draws.slice(offset, offset + batchSize);

    let inserted = 0;
    for (const draw of chunk) {
      try {
        await insertDrawResult({
          gameType,
          drawDate: new Date(draw.drawDate).getTime(),
          mainNumbers: draw.mainNumbers,
          specialNumbers: draw.specialNumbers,
          drawTime: draw.drawTime,
          source: "lotteryusa.com",
        });
        inserted++;
      } catch (_e) {
        // duplicate — skip silently
      }
    }

    const nextOffset = offset + batchSize;
    return {
      fetched: chunk.length,
      inserted,
      hasMore: nextOffset < draws.length,
      nextOffset,
      totalAvailable: draws.length,
    };
  };

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("chunk-timeout")), TIMEOUT_MS),
  );

  try {
    return await Promise.race([work(), timeoutPromise]);
  } catch (e) {
    if (e instanceof Error && e.message === "chunk-timeout") {
      console.warn(`[DataFetch] fetchHistoryChunk timed out at offset=${offset}, will retry`);
      // Return a safe partial result — client retries from the same offset.
      return { fetched: 0, inserted: 0, hasMore: true, nextOffset: offset, totalAvailable: 0 };
    }
    throw e;
  }
}
