-- Migration: 0011_auto_fetch_runs
-- Adds the auto_fetch_runs table used by dataFetch.autoFetchStatus to report
-- scrape status across process boundaries.
--
-- Context: as of PR #31 the auto-fetch scraper runs in a standalone
-- cron-runner process, not inside the web service. The existing
-- `getAutoFetchStatus` endpoint was reading module-level variables in the
-- web pod's memory, which are always the initial empty values because
-- nothing in the web process ever runs the scrape. This table is the
-- shared source of truth: every run (cron or admin-triggered "Run Now")
-- writes a row on start and updates it on finish, and the web service
-- answers status queries by reading the most recent row.
--
-- Why each column:
--   startedAt       → unix ms, used for "last run at" display and for
--                     isScheduleActive freshness check (< 7h ago)
--   finishedAt      → null while the run is in-flight; distinguishes
--                     "crashed mid-run" from "completed successfully" in
--                     post-mortem queries
--   status          → "running" at insert, "completed" or "failed" at
--                     finish. "failed" is reserved for catastrophic errors
--                     (thrown exceptions reaching the finally block's
--                     outer catch); per-game scrape errors are non-fatal
--                     and recorded in `errors` with status="completed"
--   trigger         → "cron" for scheduled Render Cron Job runs,
--                     "manual" for admin "Run Now" clicks. Useful when
--                     debugging whether a symptom came from the schedule
--                     or a human action
--   gameResults     → Record<gameType, { newDraws, evaluations, errors }>
--                     mirroring AutoFetchResult.gameResults
--   errors          → string[] of error messages from failed per-game
--                     processing; empty array when clean
--
-- Index:
--   afr_started_at_idx → getLatestAutoFetchRun() is an ORDER BY startedAt
--                        DESC LIMIT 1, called on every admin dashboard
--                        poll (every 30s). Without this index it's a full
--                        scan, which becomes expensive after ~6 months of
--                        6-hourly rows (~720 rows/year). Cheap to add now.

CREATE TABLE `auto_fetch_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`startedAt` bigint NOT NULL,
	`finishedAt` bigint,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`trigger` enum('cron','manual') NOT NULL DEFAULT 'cron',
	`gamesProcessed` int NOT NULL DEFAULT 0,
	`totalNewDraws` int NOT NULL DEFAULT 0,
	`totalEvaluations` int NOT NULL DEFAULT 0,
	`highAccuracyAlerts` int NOT NULL DEFAULT 0,
	`gameResults` json,
	`errors` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auto_fetch_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `afr_started_at_idx` ON `auto_fetch_runs` (`startedAt`);
