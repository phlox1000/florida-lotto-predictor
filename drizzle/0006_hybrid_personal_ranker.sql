ALTER TABLE `scanned_tickets`
	MODIFY COLUMN `ticketOrigin` varchar(32) NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	ADD `userId` int NULL;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	ADD `sourceSubtype` varchar(48) NOT NULL DEFAULT 'unknown';
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	ADD `personalConsumedRankerVersionId` int NULL;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	ADD `globalConsumedRankerVersionId` int NULL;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	ADD `globalPromotionStatus` varchar(24) NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	ADD `promotionBlockedReason` text;
--> statement-breakpoint
UPDATE `scanned_ticket_outcomes` sto
INNER JOIN `scanned_tickets` st ON st.`id` = sto.`scannedTicketId`
SET sto.`userId` = st.`userId`
WHERE sto.`userId` IS NULL;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	MODIFY COLUMN `userId` int NOT NULL;
--> statement-breakpoint
UPDATE `scanned_ticket_outcomes`
SET `globalConsumedRankerVersionId` = `consumedRankerVersionId`
WHERE `consumedRankerVersionId` IS NOT NULL AND `globalConsumedRankerVersionId` IS NULL;
--> statement-breakpoint
CREATE TABLE `personal_ranker_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`gameType` varchar(32) NOT NULL,
	`algorithm` varchar(64) NOT NULL DEFAULT 'online_logistic_regression_personal',
	`featureSetVersion` varchar(64) NOT NULL,
	`intercept` float NOT NULL DEFAULT 0,
	`coefficients` json NOT NULL,
	`learningRate` float NOT NULL DEFAULT 0.03,
	`l2Lambda` float NOT NULL DEFAULT 0.002,
	`trainedExamples` int NOT NULL DEFAULT 0,
	`generatedCandidateExamples` int NOT NULL DEFAULT 0,
	`scannedTicketExamples` int NOT NULL DEFAULT 0,
	`promotedGlobalExamples` int NOT NULL DEFAULT 0,
	`sourcePersonalRankerVersionId` int NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `personal_ranker_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `personal_ranker_promotion_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameType` varchar(32) NOT NULL,
	`userId` int NOT NULL,
	`personalRankerVersionId` int NULL,
	`promotionStatus` varchar(24) NOT NULL DEFAULT 'blocked',
	`blockedReason` text,
	`evaluatedOutcomeCount` int NOT NULL DEFAULT 0,
	`promotedOutcomeCount` int NOT NULL DEFAULT 0,
	`policySnapshot` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `personal_ranker_promotion_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_scanned_tickets_user_status` ON `scanned_tickets` (`userId`,`confirmationStatus`,`scanStatus`);
--> statement-breakpoint
CREATE INDEX `idx_scanned_tickets_game_draw` ON `scanned_tickets` (`gameType`,`drawDate`,`drawTime`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scanned_ticket_rows_ticket_row` ON `scanned_ticket_rows` (`scannedTicketId`,`rowIndex`);
--> statement-breakpoint
CREATE INDEX `idx_scanned_ticket_rows_game_draw_status` ON `scanned_ticket_rows` (`gameType`,`drawDate`,`drawTime`,`rowStatus`);
--> statement-breakpoint
CREATE INDEX `idx_scanned_ticket_rows_ticket_id` ON `scanned_ticket_rows` (`scannedTicketId`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scanned_ticket_feature_row_version` ON `scanned_ticket_feature_snapshots` (`scannedTicketRowId`,`featureSetVersion`);
--> statement-breakpoint
CREATE INDEX `idx_scanned_ticket_feature_row_id` ON `scanned_ticket_feature_snapshots` (`scannedTicketRowId`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scanned_ticket_outcome_row_draw` ON `scanned_ticket_outcomes` (`scannedTicketRowId`,`drawResultId`);
--> statement-breakpoint
CREATE INDEX `idx_scanned_ticket_outcomes_user_game_personal` ON `scanned_ticket_outcomes` (`userId`,`gameType`,`personalConsumedRankerVersionId`);
--> statement-breakpoint
CREATE INDEX `idx_scanned_ticket_outcomes_game_global_consumed` ON `scanned_ticket_outcomes` (`gameType`,`globalConsumedRankerVersionId`,`globalPromotionStatus`);
--> statement-breakpoint
CREATE INDEX `idx_scanned_ticket_outcomes_game_subtype` ON `scanned_ticket_outcomes` (`gameType`,`sourceSubtype`);
--> statement-breakpoint
CREATE INDEX `idx_scanned_ticket_outcomes_ticket_id` ON `scanned_ticket_outcomes` (`scannedTicketId`);
--> statement-breakpoint
CREATE INDEX `idx_personal_ranker_versions_user_game_active` ON `personal_ranker_versions` (`userId`,`gameType`,`isActive`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_personal_ranker_versions_user_game_created` ON `personal_ranker_versions` (`userId`,`gameType`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_personal_ranker_promo_game_created` ON `personal_ranker_promotion_audit` (`gameType`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_personal_ranker_promo_user_created` ON `personal_ranker_promotion_audit` (`userId`,`createdAt`);
--> statement-breakpoint
ALTER TABLE `scanned_tickets`
	ADD CONSTRAINT `scanned_tickets_userId_users_id_fk`
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_rows`
	ADD CONSTRAINT `scanned_ticket_rows_scannedTicketId_scanned_tickets_id_fk`
	FOREIGN KEY (`scannedTicketId`) REFERENCES `scanned_tickets`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_feature_snapshots`
	ADD CONSTRAINT `scanned_ticket_feature_snapshots_scannedTicketRowId_scanned_ticket_rows_id_fk`
	FOREIGN KEY (`scannedTicketRowId`) REFERENCES `scanned_ticket_rows`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_feature_snapshots`
	ADD CONSTRAINT `scanned_ticket_feature_snapshots_rankerVersionId_ranker_versions_id_fk`
	FOREIGN KEY (`rankerVersionId`) REFERENCES `ranker_versions`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	ADD CONSTRAINT `scanned_ticket_outcomes_scannedTicketId_scanned_tickets_id_fk`
	FOREIGN KEY (`scannedTicketId`) REFERENCES `scanned_tickets`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	ADD CONSTRAINT `scanned_ticket_outcomes_scannedTicketRowId_scanned_ticket_rows_id_fk`
	FOREIGN KEY (`scannedTicketRowId`) REFERENCES `scanned_ticket_rows`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	ADD CONSTRAINT `scanned_ticket_outcomes_userId_users_id_fk`
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	ADD CONSTRAINT `scanned_ticket_outcomes_drawResultId_draw_results_id_fk`
	FOREIGN KEY (`drawResultId`) REFERENCES `draw_results`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	ADD CONSTRAINT `scanned_ticket_outcomes_consumedRankerVersionId_ranker_versions_id_fk`
	FOREIGN KEY (`consumedRankerVersionId`) REFERENCES `ranker_versions`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `scanned_ticket_outcomes`
	ADD CONSTRAINT `scanned_ticket_outcomes_globalConsumedRankerVersionId_ranker_versions_id_fk`
	FOREIGN KEY (`globalConsumedRankerVersionId`) REFERENCES `ranker_versions`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `personal_ranker_versions`
	ADD CONSTRAINT `personal_ranker_versions_userId_users_id_fk`
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `personal_ranker_versions`
	ADD CONSTRAINT `personal_ranker_versions_sourcePersonalRankerVersionId_personal_ranker_versions_id_fk`
	FOREIGN KEY (`sourcePersonalRankerVersionId`) REFERENCES `personal_ranker_versions`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `personal_ranker_promotion_audit`
	ADD CONSTRAINT `personal_ranker_promotion_audit_userId_users_id_fk`
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `personal_ranker_promotion_audit`
	ADD CONSTRAINT `personal_ranker_promotion_audit_personalRankerVersionId_personal_ranker_versions_id_fk`
	FOREIGN KEY (`personalRankerVersionId`) REFERENCES `personal_ranker_versions`(`id`) ON DELETE set null ON UPDATE no action;
