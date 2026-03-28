ALTER TABLE `ranker_versions` ADD `generatedCandidateExamples` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `ranker_versions` ADD `scannedTicketExamples` int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `scanned_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`gameType` varchar(32) NOT NULL,
	`drawDate` bigint NOT NULL,
	`drawTime` varchar(16) NOT NULL,
	`sourceType` varchar(32) NOT NULL DEFAULT 'scanned_ticket',
	`ticketOrigin` varchar(32) NOT NULL DEFAULT 'unknown',
	`scanStatus` varchar(32) NOT NULL DEFAULT 'parsed',
	`confirmationStatus` varchar(32) NOT NULL DEFAULT 'pending',
	`imageUrl` text,
	`fileKey` varchar(256),
	`parsedPayload` json,
	`confirmedPayload` json,
	`linkedPurchasedTicketId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scanned_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scanned_ticket_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scannedTicketId` int NOT NULL,
	`rowIndex` int NOT NULL DEFAULT 0,
	`gameType` varchar(32) NOT NULL,
	`drawDate` bigint NOT NULL,
	`drawTime` varchar(16) NOT NULL,
	`parsedMainNumbers` json NOT NULL,
	`parsedSpecialNumbers` json,
	`confirmedMainNumbers` json,
	`confirmedSpecialNumbers` json,
	`rowStatus` varchar(32) NOT NULL DEFAULT 'parsed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scanned_ticket_rows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scanned_ticket_feature_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scannedTicketRowId` int NOT NULL,
	`rankerVersionId` int,
	`featureSetVersion` varchar(64) NOT NULL,
	`features` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scanned_ticket_feature_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scanned_ticket_outcomes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scannedTicketId` int NOT NULL,
	`scannedTicketRowId` int NOT NULL,
	`drawResultId` int NOT NULL,
	`gameType` varchar(32) NOT NULL,
	`mainHits` int NOT NULL DEFAULT 0,
	`specialHits` int NOT NULL DEFAULT 0,
	`rewardScore` float NOT NULL DEFAULT 0,
	`outcomeTier` varchar(32) NOT NULL DEFAULT 'miss',
	`trainingWeight` float NOT NULL DEFAULT 0.35,
	`consumedRankerVersionId` int,
	`evaluatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scanned_ticket_outcomes_id` PRIMARY KEY(`id`)
);
