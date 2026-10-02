import { integer, numeric, pgView, text, timestamp } from "drizzle-orm/pg-core";

export const aiUsageLedgerView = pgView("ai_usage_ledger", {
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  userId: text("user_id"),
  feature: text("feature").notNull(),
  tenderId: text("tender_id").notNull(),
  model: text("model"),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: numeric("cost_usd", { precision: 14, scale: 8 }).notNull(),
}).existing();
