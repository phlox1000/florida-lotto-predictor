CREATE TABLE `draw_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameType` varchar(32) NOT NULL,
	`drawDate` bigint NOT NULL,
	`mainNumbers` json NOT NULL,
	`specialNumbers` json,
	`drawTime` varchar(16),
	`source` varchar(64) DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `draw_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_performance` (
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
--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`gameType` varchar(32) NOT NULL,
	`modelName` varchar(64) NOT NULL,
	`mainNumbers` json NOT NULL,
	`specialNumbers` json,
	`confidenceScore` float NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `predictions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ticket_selections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`gameType` varchar(32) NOT NULL,
	`budget` float NOT NULL DEFAULT 75,
	`ticketCount` int NOT NULL DEFAULT 20,
	`tickets` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ticket_selections_id` PRIMARY KEY(`id`)
);
