/**
 * Standalone entrypoint for the auto-fetch scheduled job.
 *
 * Intended to be executed by an external scheduler (Render Cron Job,
 * GitHub Actions schedule, systemd timer, etc.) as a run-once-and-exit
 * process. This decouples the scrape workload from the web process so:
 *
 *   - The web service can scale horizontally without each pod firing
 *     its own independent setInterval and causing N-way duplicate work.
 *   - Web restarts (deploy, crash, autoscale) no longer reset the
 *     scrape clock.
 *   - Scrape failures show up in their own log stream and don't
 *     compete with request handling for CPU/memory.
 *
 * Exit codes:
 *   0 - Auto-fetch completed. Note: the run is considered successful
 *       even if individual games failed; per-game errors are captured
 *       in result.errors and the overall run continues. A non-zero
 *       exit is reserved for catastrophic failures (e.g., DB client
 *       could not initialize, unhandled rejection from the top-level
 *       promise) so the cron scheduler's "job failed" signal actually
 *       means something.
 *   1 - Catastrophic failure that prevented the run from completing.
 */
import "dotenv/config";
import { runAutoFetch } from "./cron";

async function main() {
  console.log(`[cron-runner] Starting auto-fetch job (NODE_ENV=${process.env.NODE_ENV ?? "unset"})`);

  // Fail fast if core config is missing. Without this guard, the job
  // would scrape successfully, fail to insert every draw (getDb()
  // returns undefined → per-draw catch absorbs the error), report
  // totalNewDraws=0, and exit 0 — making Render's "job failed" signal
  // useless for detecting misconfiguration. This guard makes missing
  // envs a loud, actionable failure on the very first run.
  if (!process.env.DATABASE_URL) {
    console.error("[cron-runner] FATAL: DATABASE_URL is not set. Configure it on this cron job's Environment tab before the next scheduled run.");
    process.exit(1);
  }

  const startedAt = Date.now();

  // trigger="cron" marks the auto_fetch_runs row as a scheduled run, which
  // separates it from admin "Run Now" invocations that go through the tRPC
  // triggerAutoFetch mutation. The runAutoFetch implementation handles the
  // DB bookkeeping.
  const result = await runAutoFetch("cron");

  const durationMs = Date.now() - startedAt;
  console.log(
    `[cron-runner] Completed in ${durationMs}ms: ` +
      `${result.gamesProcessed} games, ` +
      `${result.totalNewDraws} new draws, ` +
      `${result.totalEvaluations} evaluations, ` +
      `${result.highAccuracyAlerts} high-accuracy alerts, ` +
      `${result.errors.length} errors`
  );

  if (result.errors.length > 0) {
    console.log(`[cron-runner] Per-run errors (non-fatal):`);
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error("[cron-runner] Fatal error, exiting non-zero:", err);
    process.exit(1);
  });
