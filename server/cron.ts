/**
 * Scheduled Auto-Fetch Cron Job
 * Runs daily to scrape the latest draw results from lotteryusa.com
 * and auto-evaluate all prediction models against new draws.
 */
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { fetchAllGamesRecent } from "./lib/lotteryusa-scraper";
import { insertDrawResult, evaluatePredictionsAgainstDraw, evaluatePurchasedTicketsAgainstDraw, getDb } from "./db";
import { notifyOwner } from "./_core/notification";

export interface AutoFetchResult {
  timestamp: number;
  gamesProcessed: number;
  totalNewDraws: number;
  totalEvaluations: number;
  highAccuracyAlerts: number;
  gameResults: Record<string, { newDraws: number; evaluations: number; errors: number }>;
  errors: string[];
}

// In-memory store for last auto-fetch status (persists across requests, resets on server restart)
let lastAutoFetchResult: AutoFetchResult | null = null;
let isAutoFetchRunning = false;
let autoFetchInterval: ReturnType<typeof setInterval> | null = null;

export function getLastAutoFetchResult(): AutoFetchResult | null {
  return lastAutoFetchResult;
}

export function isAutoFetchActive(): boolean {
  return autoFetchInterval !== null;
}

export function getAutoFetchRunning(): boolean {
  return isAutoFetchRunning;
}

/**
 * Run the auto-fetch process: scrape all games, insert new draws, evaluate predictions
 */
export async function runAutoFetch(): Promise<AutoFetchResult> {
  if (isAutoFetchRunning) {
    throw new Error("Auto-fetch is already running");
  }

  isAutoFetchRunning = true;
  const result: AutoFetchResult = {
    timestamp: Date.now(),
    gamesProcessed: 0,
    totalNewDraws: 0,
    totalEvaluations: 0,
    highAccuracyAlerts: 0,
    gameResults: {},
    errors: [],
  };

  try {
    console.log("[AutoFetch] Starting scheduled auto-fetch...");
    const allGames = await fetchAllGamesRecent();

    for (const [gt, draws] of Object.entries(allGames)) {
      if (!FLORIDA_GAMES[gt as GameType]) continue;
      const gameResult = { newDraws: 0, evaluations: 0, errors: 0 };

      for (const draw of draws) {
        try {
          const insertResult = await insertDrawResult({
            gameType: gt,
            drawDate: new Date(draw.drawDate).getTime(),
            mainNumbers: draw.mainNumbers,
            specialNumbers: draw.specialNumbers,
            drawTime: draw.drawTime,
            source: "auto-fetch",
          });
          gameResult.newDraws++;

          // Auto-evaluate predictions against this new draw
          const drawId = (insertResult as any)?.[0]?.insertId ?? 0;
          if (drawId) {
            try {
              const evalResult = await evaluatePredictionsAgainstDraw(
                drawId, gt, draw.mainNumbers, draw.specialNumbers
              );
              gameResult.evaluations += evalResult.evaluated;
              if (evalResult.highAccuracy > 0) {
                result.highAccuracyAlerts += evalResult.highAccuracy;
              }
            } catch (evalErr) {
              // Evaluation errors are non-fatal
              console.warn(`[AutoFetch] Evaluation error for ${gt}:`, evalErr);
            }

            // Also evaluate purchased tickets against this new draw
            try {
              await evaluatePurchasedTicketsAgainstDraw(
                gt,
                new Date(draw.drawDate).getTime(),
                draw.drawTime || "evening",
                draw.mainNumbers,
                draw.specialNumbers
              );
            } catch (ticketErr) {
              console.warn(`[AutoFetch] Ticket evaluation error for ${gt}:`, ticketErr);
            }
          }
        } catch (e) {
          // Duplicate draw or insert error - skip silently
        }
      }

      result.gameResults[gt] = gameResult;
      result.gamesProcessed++;
      result.totalNewDraws += gameResult.newDraws;
      result.totalEvaluations += gameResult.evaluations;
    }

    console.log(`[AutoFetch] Complete: ${result.totalNewDraws} new draws, ${result.totalEvaluations} evaluations`);

    // Notify owner if significant new data was found
    if (result.totalNewDraws > 0) {
      const gameSummary = Object.entries(result.gameResults)
        .filter(([_, r]) => r.newDraws > 0)
        .map(([gt, r]) => `${FLORIDA_GAMES[gt as GameType]?.name || gt}: ${r.newDraws} new`)
        .join(", ");

      await notifyOwner({
        title: "Auto-Fetch: New Draw Results",
        content: `Fetched ${result.totalNewDraws} new draws across ${result.gamesProcessed} games. ${gameSummary}. ${result.totalEvaluations} model evaluations performed.${result.highAccuracyAlerts > 0 ? ` ${result.highAccuracyAlerts} high-accuracy predictions detected!` : ""}`,
      }).catch(() => {});
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    result.errors.push(errMsg);
    console.error("[AutoFetch] Failed:", errMsg);
  } finally {
    isAutoFetchRunning = false;
    lastAutoFetchResult = result;
  }

  return result;
}

/**
 * Start the auto-fetch cron schedule.
 * Runs every 6 hours to catch all draw times across different games.
 * FL Lottery games draw at various times: midday (~1:30 PM) and evening (~11 PM).
 */
export function startAutoFetchSchedule(): void {
  if (autoFetchInterval) {
    console.log("[AutoFetch] Schedule already running");
    return;
  }

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  // Run immediately on startup (with a 30-second delay to let the server settle)
  setTimeout(() => {
    runAutoFetch().catch(err => console.error("[AutoFetch] Initial run failed:", err));
  }, 30_000);

  // Then run every 6 hours
  autoFetchInterval = setInterval(() => {
    runAutoFetch().catch(err => console.error("[AutoFetch] Scheduled run failed:", err));
  }, SIX_HOURS_MS);

  console.log("[AutoFetch] Schedule started: runs every 6 hours");
}

/**
 * Stop the auto-fetch cron schedule.
 */
export function stopAutoFetchSchedule(): void {
  if (autoFetchInterval) {
    clearInterval(autoFetchInterval);
    autoFetchInterval = null;
    console.log("[AutoFetch] Schedule stopped");
  }
}
