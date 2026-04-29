-- Migration: 0012_prediction_learning_metrics
-- Compact rolling summaries for prediction learning (factor/model level).

CREATE TABLE `prediction_learning_metrics` (
  `id` int AUTO_INCREMENT NOT NULL,
  `gameType` varchar(32) NOT NULL,
  `metricType` enum('factor','model') NOT NULL,
  `metricName` varchar(64) NOT NULL,
  `windowDays` int NOT NULL DEFAULT 90,
  `windowLabel` varchar(32) NOT NULL DEFAULT 'rolling_90d',
  `sampleCount` int NOT NULL DEFAULT 0,
  `averageMatchRatio` float NOT NULL DEFAULT 0,
  `weightedScore` float NOT NULL DEFAULT 0,
  `lastUpdatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `prediction_learning_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plm_unique_metric` ON `prediction_learning_metrics` (`gameType`,`metricType`,`metricName`,`windowDays`);
--> statement-breakpoint
CREATE INDEX `plm_lookup_idx` ON `prediction_learning_metrics` (`gameType`,`metricType`,`windowDays`);
