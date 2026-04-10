-- Migration: 0009_add_password_fields
-- Adds optional password hash storage for email-registered accounts (platform OAuth may populate this).
ALTER TABLE `users` ADD COLUMN `passwordHash` varchar(255);--> statement-breakpoint
