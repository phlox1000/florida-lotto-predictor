/**
 * Scheduled Auto-Fetch Cron Job
 * Runs daily to scrape the latest draw results from lotteryusa.com
 * and auto-evaluate all prediction models against new draws.
 */
import { FLORIDA_GAMES, GAME_TYPES, type GameType } from "@shared/lottery";
import { fetchAllGamesRecent } from "./lib/lotteryusa-scraper";
import {
  insertDrawResult,
  evaluatePredictionsAgainstDraw,
  evaluatePurchasedTicketsAgainstDraw,
  getDb,
  insertAutoFetchRunStart,
  finishAutoFetchRun,
} from "./db";
import { notifyOwner } from "./_core/notification";
import { emitDrawResultEntered } from "./services/eventService";

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
 * Run the auto-fetch process: scrape all games, insert new draws, evaluate predictions.
 *
 * @param trigger - "cron" when called by the standalone cron-runner (default),
 *                  "manual" when called by the admin "Run Now" tRPC mutation.
 *                  Recorded on the auto_fetch_runs row so post-hoc queries can
 *                  distinguish scheduled runs from ad-hoc ones.
 */
export async function runAutoFetch(
  trigger: "cron" | "manual" = "cron",
): Promise<AutoFetchResult> {
  if (isAutoFetchRunning) {
    throw new Error("Auto-fetch is already running");
  }

  isAutoFetchRunning = true;
  const startedAt = Date.now();
  const result: AutoFetchResult = {
    timestamp: startedAt,
    gamesProcessed: 0,
    totalNewDraws: 0,
    totalEvaluations: 0,
    highAccuracyAlerts: 0,
    gameResults: {},
    errors: [],
  };

  // Persist a "running" row immediately so the web service can surface
  // in-progress state (isRunning=true) even though the scrape is happening
  // in a different process. The id is used to update the row on completion;
  // null means the DB was unreachable, in which case we still run the
  // scrape and simply skip the finalization write.
  const runId = await insertAutoFetchRunStart(trigger, startedAt);
  // Tracks whether the top-level try block completed without throwing.
  // If it did throw, we record status="failed" so operators can distinguish
  // "scrape completed with per-game errors" from "scrape crashed mid-run".
  let topLevelFailure = false;

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
          if (insertResult.status === "inserted") {
            gameResult.newDraws++;

            const drawDateStr = new Date(draw.drawDate).toISOString().split("T")[0];
            emitDrawResultEntered({
              userId: null,
              game: gt,
              drawDate: drawDateStr,
              winningNumbers: draw.mainNumbers,
              occurredAt: new Date(),
              platformVersion: "1.0.0",
              schemaVersion: "1.0",
            }).catch(err => console.error("[event]", err));

            // Auto-evaluate predictions against this new draw
            const drawId = insertResult.insertId;
            if (drawId) {
              try {
                const evalResult = await evaluatePredictionsAgainstDraw(
                  drawId, gt, draw.mainNumbers, draw.specialNumbers, drawDateStr
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
          }
          // status === "duplicate" is silently skipped — this is expected behavior
        } catch (e) {
          // Duplicates are handled via insertDrawResult's return status.
          // Only genuine unexpected failures reach this catch block.
          console.error("[DataFetch] Unexpected insert error:", e);
          result.errors.push(e instanceof Error ? e.message : String(e));
          gameResult.errors++;
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
    topLevelFailure = true;
    console.error("[AutoFetch] Failed:", errMsg);
  } finally {
    isAutoFetchRunning = false;
    lastAutoFetchResult = result;

    // Best-effort finalize: if the start row was written, mirror the outcome
    // back to it. If the DB is down at finish time, the row stays in
    // "running" state — which is a useful operator signal ("the last run
    // never finished"). Wrapped in its own try so a DB issue here doesn't
    // mask the actual scrape errors in the caller's return value.
    if (runId !== null) {
      try {
        await finishAutoFetchRun(runId, {
          status: topLevelFailure ? "failed" : "completed",
          finishedAt: Date.now(),
          gamesProcessed: result.gamesProcessed,
          totalNewDraws: result.totalNewDraws,
          totalEvaluations: result.totalEvaluations,
          highAccuracyAlerts: result.highAccuracyAlerts,
          gameResults: result.gameResults,
          errors: result.errors,
        });
      } catch (e) {
        console.error("[AutoFetch] Failed to finalize run record:", e);
      }
    }
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
