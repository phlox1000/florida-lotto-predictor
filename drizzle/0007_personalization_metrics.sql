CREATE TABLE `personalization_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameType` varchar(32) NOT NULL,
	`requestSource` varchar(64) NOT NULL,
	`anonymizedUserId` varchar(96),
	`candidateBatchId` int,
	`globalRankerVersionId` int,
	`personalRankerVersionId` int,
	`abGroup` varchar(24) NOT NULL DEFAULT 'treatment',
	`abBucket` int,
	`personalizationEligible` int NOT NULL DEFAULT 0,
	`personalizationApplied` int NOT NULL DEFAULT 0,
	`personalizationBlockedReason` varchar(128),
	`blendWeight` float NOT NULL DEFAULT 0,
	`topN` int NOT NULL DEFAULT 10,
	`topGlobalCandidates` json NOT NULL,
	`topServedCandidates` json NOT NULL,
	`selectedCandidateKeys` json,
	`selectedCandidateKey` varchar(256),
	`selectedCandidateSource` varchar(64),
	`evaluatedDrawResultId` int,
	`baselineSelectedRank` int,
	`personalizedSelectedRank` int,
	`selectedRankLift` int,
	`selectedMainHits` int,
	`selectedSpecialHits` int,
	`selectedRewardScore` float,
	`baselineHitAt5` int,
	`personalizedHitAt5` int,
	`baselineHitAt10` int,
	`personalizedHitAt10` int,
	`baselinePrecisionAt5` float,
	`personalizedPrecisionAt5` float,
	`baselinePrecisionAt10` float,
	`personalizedPrecisionAt10` float,
	`precisionLiftAt5` float,
	`precisionLiftAt10` float,
	`evaluatedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `personalization_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_personalization_metrics_game_created` ON `personalization_metrics` (`gameType`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_personalization_metrics_eval_state` ON `personalization_metrics` (`gameType`,`evaluatedDrawResultId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_personalization_metrics_ab_group` ON `personalization_metrics` (`abGroup`,`gameType`,`createdAt`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_personalization_metrics_candidate_batch` ON `personalization_metrics` (`candidateBatchId`);
--> statement-breakpoint
ALTER TABLE `personalization_metrics`
	ADD CONSTRAINT `personalization_metrics_candidateBatchId_prediction_candidate_batches_id_fk`
	FOREIGN KEY (`candidateBatchId`) REFERENCES `prediction_candidate_batches`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `personalization_metrics`
	ADD CONSTRAINT `personalization_metrics_globalRankerVersionId_ranker_versions_id_fk`
	FOREIGN KEY (`globalRankerVersionId`) REFERENCES `ranker_versions`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `personalization_metrics`
	ADD CONSTRAINT `personalization_metrics_personalRankerVersionId_personal_ranker_versions_id_fk`
	FOREIGN KEY (`personalRankerVersionId`) REFERENCES `personal_ranker_versions`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `personalization_metrics`
	ADD CONSTRAINT `personalization_metrics_evaluatedDrawResultId_draw_results_id_fk`
	FOREIGN KEY (`evaluatedDrawResultId`) REFERENCES `draw_results`(`id`) ON DELETE set null ON UPDATE no action;
