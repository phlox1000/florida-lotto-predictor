CREATE TABLE `app_events` (
  `id` varchar(128) NOT NULL,
  `event_type` enum(
    'prediction_generated',
    'prediction_acted_on',
    'draw_result_entered',
    'prediction_accuracy_calculated'
  ) NOT NULL,
  `app_id` varchar(64) NOT NULL DEFAULT 'florida-lotto',
  `user_id` int,
  `correlation_id` varchar(128) NOT NULL,
  `occurred_at` timestamp NOT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT (now()),
  `schema_version` varchar(16) NOT NULL,
  `platform_version` varchar(32) NOT NULL,
  `payload` json NOT NULL,
  CONSTRAINT `app_events_id` PRIMARY KEY(`id`),
  CONSTRAINT `app_events_user_id_users_id_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
    ON DELETE no action ON UPDATE no action
);
