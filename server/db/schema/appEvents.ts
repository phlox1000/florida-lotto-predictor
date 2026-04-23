// IMPORTANT: Always filter and sort by occurred_at, NEVER by recorded_at.
// recorded_at is for debugging sync issues only.

import { int, json, mysqlEnum, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";
import { users } from "../../../drizzle/schema";

export const appEvents = mysqlTable("app_events", {
  id: varchar("id", { length: 128 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  event_type: mysqlEnum("event_type", [
    "prediction_generated",
    "prediction_acted_on",
    "draw_result_entered",
    "prediction_accuracy_calculated",
  ]).notNull(),
  app_id: varchar("app_id", { length: 64 }).notNull().default("florida-lotto"),
  // references users.id (int autoincrement PK), not openId which is the OAuth provider's external sub
  user_id: int("user_id").references(() => users.id),
  correlation_id: varchar("correlation_id", { length: 128 }).notNull(),
  occurred_at: timestamp("occurred_at").notNull(),
  recorded_at: timestamp("recorded_at").defaultNow().notNull(),
  schema_version: varchar("schema_version", { length: 16 }).notNull(),
  platform_version: varchar("platform_version", { length: 32 }).notNull(),
  payload: json("payload").notNull(),
});

export type AppEvent = typeof appEvents.$inferSelect;
export type InsertAppEvent = typeof appEvents.$inferInsert;
