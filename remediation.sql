-- ============================================================
-- PRODUCTION DATABASE REMEDIATION SCRIPT
-- Florida Lotto Predictor — April 8, 2026
-- ============================================================
--
-- PURPOSE: Bring the live Railway MySQL database fully in sync
-- with all 6 drizzle migrations (0000, 0001, 0002, 0003, 0007,
-- 0008).
--
-- HOW TO RUN:
--   Open Railway Dashboard → MySQL → Database → Query tab.
--   Copy-paste ONE statement at a time and click "Run Query".
--   Railway's query interface runs one statement per execution.
--
-- SAFETY: All CREATE statements use IF NOT EXISTS. All INSERT
-- statements for __drizzle_migrations use unique hashes. Safe
-- to re-run — will not duplicate data or break existing tables.
--
-- TOTAL STATEMENTS: 14 (run them in order, one at a time)
-- ============================================================


-- ============================================================
-- PART 1: CREATE 4 MISSING TABLES
-- ============================================================

-- Statement 1 of 14: model_performance (from migration 0001)
CREATE TABLE IF NOT EXISTS `model_performance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modelName` varchar(64) NOT NULL,
	`gameType` varchar(32) NOT NULL,
	`drawResultId` int,
	`predictionId` int,
	`mainHits` int NOT NULL DEFAULT 0,
	`specialHits` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_performance_id` PRIMARY KEY(`id`)
);

-- Statement 2 of 14: ticket_selections (from migration 0001)
CREATE TABLE IF NOT EXISTS `ticket_selections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`gameType` varchar(32) NOT NULL,
	`budget` float NOT NULL DEFAULT 75,
	`ticketCount` int NOT NULL DEFAULT 20,
	`tickets` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ticket_selections_id` PRIMARY KEY(`id`)
);

-- Statement 3 of 14: favorites (from migration 0002)
CREATE TABLE IF NOT EXISTS `favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`gameType` varchar(32) NOT NULL,
	`label` varchar(128),
	`mainNumbers` json NOT NULL,
	`specialNumbers` json,
	`modelSource` varchar(64),
	`confidence` float,
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `favorites_id` PRIMARY KEY(`id`)
);

-- Statement 4 of 14: push_subscriptions (from migration 0002)
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`enabled` int NOT NULL DEFAULT 1,
	`notifyDrawResults` int NOT NULL DEFAULT 1,
	`notifyHighAccuracy` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`)
);


-- ============================================================
-- PART 2: CREATE MISSING INDEXES
-- ============================================================
-- dr_game_date_idx on draw_results — already exists, skipped.
-- pm_user_game_idx and pm_metric_type_idx on
-- personalization_metrics — already exist, skipped.

-- Statement 5 of 14: index on model_performance
CREATE INDEX mp_model_game_idx ON model_performance (modelName, gameType);

-- Statement 6 of 14: index on model_performance
CREATE INDEX mp_draw_idx ON model_performance (drawResultId);

-- Statement 7 of 14: index on predictions
CREATE INDEX p_game_created_idx ON predictions (gameType, createdAt);

-- Statement 8 of 14: index on predictions
CREATE INDEX p_user_idx ON predictions (userId, createdAt);


-- ============================================================
-- PART 3: REGISTER ALL 6 MIGRATIONS IN __drizzle_migrations
-- ============================================================
-- This tells drizzle-kit that all migrations have been applied,
-- so future runs of drizzle-kit migrate won't re-run them.
-- The hash is the SHA-256 of each .sql file.
-- The created_at is the "when" value from _journal.json.

-- Statement 9 of 14: register migration 0000_deep_karnak
INSERT INTO __drizzle_migrations (`hash`, `created_at`) VALUES ('814a08e40d7fc2bcfd458759d18319198ca8ae394f2fa15617a78678e9c9c93b', 1773473265767);

-- Statement 10 of 14: register migration 0001_melodic_dracula
INSERT INTO __drizzle_migrations (`hash`, `created_at`) VALUES ('079c88ed453a681ac4bb81e1e2f2a5557c9472a731225d1d8c8b09f67c57652f', 1773473798899);

-- Statement 11 of 14: register migration 0002_first_pretty_boy
INSERT INTO __drizzle_migrations (`hash`, `created_at`) VALUES ('c30337b81405dbb814fd058c6504b67df496d1436f3915b40c39eb3ba2673bc4', 1773477897816);

-- Statement 12 of 14: register migration 0003_late_lester
INSERT INTO __drizzle_migrations (`hash`, `created_at`) VALUES ('6e0769de9ed2543556ffe017b41a4e8c87a8e76602d0ffa7d6ddca4f950f7411', 1773478917873);

-- Statement 13 of 14: register migration 0007_personalization_metrics
INSERT INTO __drizzle_migrations (`hash`, `created_at`) VALUES ('4ca44bb34cec736643f853b1f5ac2e230b1de5093b0c87a8e61c39efb3b3a485', 1775400000000);

-- Statement 14 of 14: register migration 0008_performance_indexes
INSERT INTO __drizzle_migrations (`hash`, `created_at`) VALUES ('1a1ab3b4c1b5616068fbace0e25358294cfd34e143a1ea2d49e2eb9a0dc43a4c', 1775478082094);


-- ============================================================
-- PART 4: VERIFICATION QUERIES (run after all 14 statements)
-- ============================================================
-- Copy-paste each of these one at a time to verify:

-- Verify A: Should show 13 tables
-- SHOW TABLES;

-- Verify B: Should show 6 rows
-- SELECT * FROM __drizzle_migrations;

-- Verify C: Should show mp_model_game_idx and mp_draw_idx
-- SHOW INDEX FROM model_performance;

-- Verify D: Should show p_game_created_idx and p_user_idx
-- SHOW INDEX FROM predictions;

-- Verify E: Confirm new tables exist
-- DESCRIBE favorites;

-- Verify F: Confirm new tables exist
-- DESCRIBE push_subscriptions;

-- Verify G: Confirm new tables exist
-- DESCRIBE ticket_selections;
