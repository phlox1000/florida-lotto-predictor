-- High-frequency query path indexes
-- Added to address full table scans on core lookup columns.
-- Verified against existing migrations 0000-0007: none of these exist yet.

CREATE INDEX dr_game_date_idx ON draw_results (gameType, drawDate);--> statement-breakpoint
CREATE INDEX mp_model_game_idx ON model_performance (modelName, gameType);--> statement-breakpoint
CREATE INDEX mp_draw_idx ON model_performance (drawResultId);--> statement-breakpoint
CREATE INDEX p_game_created_idx ON predictions (gameType, createdAt);--> statement-breakpoint
CREATE INDEX p_user_idx ON predictions (userId, createdAt);
