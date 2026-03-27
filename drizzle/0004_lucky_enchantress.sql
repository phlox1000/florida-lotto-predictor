CREATE TABLE `ranker_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameType` varchar(32) NOT NULL,
	`algorithm` varchar(64) NOT NULL DEFAULT 'online_logistic_regression',
	`featureSetVersion` varchar(64) NOT NULL,
	`intercept` float NOT NULL DEFAULT 0,
	`coefficients` json NOT NULL,
	`learningRate` float NOT NULL DEFAULT 0.05,
	`l2Lambda` float NOT NULL DEFAULT 0.001,
	`trainedExamples` int NOT NULL DEFAULT 0,
	`sourceRankerVersionId` int,
	`isActive` int NOT NULL DEFAULT 1,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ranker_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prediction_candidate_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`gameType` varchar(32) NOT NULL,
	`source` varchar(64) NOT NULL,
	`sumRangeFilterApplied` int NOT NULL DEFAULT 0,
	`rankerVersionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prediction_candidate_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prediction_candidates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`rankerVersionId` int,
	`userId` int,
	`gameType` varchar(32) NOT NULL,
	`modelName` varchar(64) NOT NULL,
	`candidateKey` varchar(256) NOT NULL,
	`mainNumbers` json NOT NULL,
	`specialNumbers` json,
	`baseConfidenceScore` float NOT NULL,
	`rankerScore` float NOT NULL DEFAULT 0,
	`rankerProbability` float NOT NULL DEFAULT 0,
	`rankPosition` int NOT NULL DEFAULT 0,
	`selectedForFinal` int NOT NULL DEFAULT 0,
	`isInsufficientData` int NOT NULL DEFAULT 0,
	`metadata` json,
	`evaluatedDrawResultId` int,
	`rewardScore` float,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prediction_candidates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prediction_feature_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`candidateId` int NOT NULL,
	`featureSetVersion` varchar(64) NOT NULL,
	`features` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prediction_feature_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prediction_outcomes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`candidateId` int NOT NULL,
	`drawResultId` int NOT NULL,
	`gameType` varchar(32) NOT NULL,
	`rankerVersionId` int,
	`mainHits` int NOT NULL DEFAULT 0,
	`specialHits` int NOT NULL DEFAULT 0,
	`rewardScore` float NOT NULL DEFAULT 0,
	`outcomeTier` varchar(32) NOT NULL DEFAULT 'miss',
	`evaluatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prediction_outcomes_id` PRIMARY KEY(`id`)
);
