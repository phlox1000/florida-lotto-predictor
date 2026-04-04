CREATE TABLE `personalization_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`gameType` varchar(32) NOT NULL,
	`metricType` varchar(64) NOT NULL,
	`metricValue` float NOT NULL DEFAULT 0,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personalization_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `pm_user_game_idx` ON `personalization_metrics` (`userId`, `gameType`);
--> statement-breakpoint
CREATE INDEX `pm_metric_type_idx` ON `personalization_metrics` (`metricType`);
