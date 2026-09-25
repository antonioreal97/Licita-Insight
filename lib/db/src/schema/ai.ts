import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./accounts";
import { tendersTable } from "./tenders";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export type AiPassageRecord = {
  documentId: string;
  documentTitle: string;
  documentUrl: string;
  page: number;
  text: string;
  relevance: number;
};

export const tenderAiIndexesTable = pgTable("tender_ai_indexes", {
  tenderId: text("tender_id")
    .primaryKey()
    .references(() => tendersTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  sourceFingerprint: text("source_fingerprint").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tenderAiDocumentsTable = pgTable(
  "tender_ai_documents",
  {
    id: text("id").primaryKey(),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tendersTable.id, { onDelete: "cascade" }),
    sourceDocumentId: text("source_document_id").notNull(),
    title: text("title").notNull(),
    sourceUrl: text("source_url").notNull(),
    internalPath: text("internal_path"),
    pages: integer("pages"),
    status: text("status").notNull(),
    error: text("error"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
  },
  (table) => [index("tender_ai_documents_tender_idx").on(table.tenderId)],
);

export const tenderAiPassagesTable = pgTable(
  "tender_ai_passages",
  {
    id: text("id").primaryKey(),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tendersTable.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => tenderAiDocumentsTable.id, { onDelete: "cascade" }),
    indexVersion: integer("index_version").notNull(),
    page: integer("page").notNull(),
    passageOrder: integer("passage_order").notNull(),
    text: text("text").notNull(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('portuguese', "text")`,
    ),
  },
  (table) => [
    uniqueIndex("tender_ai_passages_position_uidx").on(
      table.documentId,
      table.indexVersion,
      table.page,
      table.passageOrder,
    ),
    index("tender_ai_passages_tender_idx").on(
      table.tenderId,
      table.indexVersion,
    ),
  ],
);

export const aiDailyUsageTable = pgTable(
  "ai_daily_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    quotaDay: date("quota_day", { mode: "string" }).notNull(),
    used: integer("used").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 14,
      scale: 8,
    })
      .notNull()
      .default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.quotaDay] }),
    check("ai_daily_usage_used_check", sql`${table.used} >= 0`),
  ],
);

export const aiAskRequestsTable = pgTable(
  "ai_ask_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tendersTable.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    normalizedQuestion: text("normalized_question").notNull(),
    indexVersion: integer("index_version").notNull(),
    requestedModel: text("requested_model").notNull(),
    responseModel: text("response_model"),
    status: text("status").notNull(),
    passages: jsonb("passages")
      .$type<AiPassageRecord[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    inputTokens: integer("input_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 14,
      scale: 8,
    })
      .notNull()
      .default("0"),
    cacheHit: boolean("cache_hit").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_ask_requests_cache_uidx").on(
      table.userId,
      table.tenderId,
      table.normalizedQuestion,
      table.indexVersion,
      table.requestedModel,
    ),
    index("ai_ask_requests_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);
