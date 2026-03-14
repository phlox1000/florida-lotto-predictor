CREATE TABLE `pdf_uploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fileName` varchar(256) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(256) NOT NULL,
	`gameType` varchar(32),
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`drawsExtracted` int DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pdf_uploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchased_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`gameType` varchar(32) NOT NULL,
	`mainNumbers` json NOT NULL,
	`specialNumbers` json,
	`purchaseDate` bigint NOT NULL,
	`drawDate` bigint,
	`cost` float NOT NULL,
	`outcome` enum('pending','loss','win') NOT NULL DEFAULT 'pending',
	`winAmount` float DEFAULT 0,
	`mainHits` int DEFAULT 0,
	`specialHits` int DEFAULT 0,
	`notes` text,
	`modelSource` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchased_tickets_id` PRIMARY KEY(`id`)
);
