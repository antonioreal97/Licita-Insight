import { sql } from "drizzle-orm";
import { bigserial, check, index, integer, numeric, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { tendersTable } from "./tenders";

export type TitleExampleSplit = "train" | "holdout";

/** Teacher-labelled official titles; the student classifies tenders by their nearest neighbours. */
export const tenderTitleExamplesTable = pgTable(
  "tender_title_examples",
  {
    textHash: text("text_hash").primaryKey(),
    sourceText: text("source_text").notNull(),
    tenderId: text("tender_id").references(() => tendersTable.id, { onDelete: "set null" }),
    teacherTitle: text("teacher_title"),
    categories: text("categories").array().notNull().default(sql`'{}'::text[]`),
    teacherModel: text("teacher_model").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    split: text("split").$type<TitleExampleSplit>().notNull(),
    embedding: real("embedding").array(),
    embeddingModel: text("embedding_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tender_title_examples_pending_embedding_idx")
      .on(table.textHash)
      .where(sql`${table.embedding} is null`),
    check("tender_title_examples_split_check", sql`${table.split} in ('train', 'holdout')`),
  ],
);

/** Paid teacher calls (OpenAI), one row per tender with the batch usage split across its items. */
export const aiTitleUsageTable = pgTable(
  "ai_title_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenderId: text("tender_id").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 14, scale: 8 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("ai_title_usage_created_idx").on(table.createdAt)],
);
