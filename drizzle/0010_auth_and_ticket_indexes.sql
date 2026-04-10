-- Migration: 0010_auth_and_ticket_indexes
-- Adds indexes that became critical with email auth and ticket tracking.
-- Safe to apply on top of 0008_performance_indexes.sql and 0009_add_password_fields.sql.
--
-- Why each index:
--   users_email_idx          → getUserByEmail() is called on every login — currently a full scan
--   pt_user_idx              → getUserPurchasedTickets() and getUserROIStats() filter by userId
--   pt_user_game_idx         → getROIByGame() filters by both userId and gameType
--   fav_user_idx             → getUserFavorites() filters by userId
--   push_user_idx            → getUserPushSubscription() filters by userId
--   personalization_user_idx → personalizationMetrics queries filter by userId + metricType

CREATE INDEX users_email_idx ON users (email);--> statement-breakpoint
CREATE INDEX pt_user_idx ON purchased_tickets (userId);--> statement-breakpoint
CREATE INDEX pt_user_game_idx ON purchased_tickets (userId, gameType);--> statement-breakpoint
CREATE INDEX fav_user_idx ON favorites (userId);--> statement-breakpoint
CREATE INDEX push_user_idx ON push_subscriptions (userId);--> statement-breakpoint
CREATE INDEX personalization_user_idx ON personalization_metrics (userId, metricType);
