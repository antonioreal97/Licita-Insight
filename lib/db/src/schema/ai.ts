import { sql } from "drizzle-orm";
import { boolean, check, customType, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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

export type TenderSheetFieldId =
  | "consortium"
  | "subcontracting"
  | "me_epp"
  | "site_visit"
  | "samples"
  | "bid_guarantee"
  | "contract_guarantee"
  | "penalties"
  | "technical_qualification"
  | "financial_qualification"
  | "contract_term"
  | "delivery_term"
  | "price_adjustment";

export type TenderSheetEvidence = {
  documentTitle: string;
  documentUrl: string;
  page: number;
  text: string;
};

export type TenderSheetField = {
  id: TenderSheetFieldId;
  status: "found" | "not_found";
  answer: string | null;
  confidence: number | null;
  evidence: TenderSheetEvidence | null;
};

export type TenderSheetDiagnostic = {
  id: TenderSheetFieldId;
  bestNoul: number | null;
  secondNoul: number | null;
  bestEvidence: TenderSheetEvidence | null;
  secondEvidence: TenderSheetEvidence | null;
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
    attemptCount: integer("attempt_count").notNull().default(0),
    retryable: boolean("retryable").notNull().default(false),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
  },
  (table) => [
    index("tender_ai_documents_tender_idx").on(table.tenderId),
    index("tender_ai_documents_retry_idx").on(table.nextRetryAt).where(sql`${table.retryable} = true`),
    check("tender_ai_documents_attempt_count_check", sql`${table.attemptCount} >= 0`),
  ],
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
    searchVector: tsvector("search_vector").generatedAlwaysAs(sql`to_tsvector('portuguese', "text")`),
  },
  (table) => [
    uniqueIndex("tender_ai_passages_position_uidx").on(table.documentId, table.indexVersion, table.page, table.passageOrder),
    index("tender_ai_passages_tender_idx").on(table.tenderId, table.indexVersion),
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
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.quotaDay] }), check("ai_daily_usage_used_check", sql`${table.used} >= 0`)],
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_ask_requests_cache_uidx").on(table.userId, table.tenderId, table.normalizedQuestion, table.indexVersion, table.requestedModel),
    index("ai_ask_requests_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const tenderAiSheetsTable = pgTable(
  "tender_ai_sheets",
  {
    id: text("id").primaryKey(),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tendersTable.id, { onDelete: "cascade" }),
    indexVersion: integer("index_version").notNull(),
    requestedModel: text("requested_model").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    status: text("status").notNull(),
    fields: jsonb("fields")
      .$type<TenderSheetField[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    diagnostics: jsonb("diagnostics")
      .$type<TenderSheetDiagnostic[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    unreadDocuments: integer("unread_documents").notNull().default(0),
    responseModel: text("response_model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 14,
      scale: 8,
    })
      .notNull()
      .default("0"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tender_ai_sheets_cache_uidx").on(table.tenderId, table.indexVersion, table.requestedModel, table.promptVersion),
    index("tender_ai_sheets_tender_idx").on(table.tenderId, table.updatedAt),
  ],
);

export const aiSheetDailyUsageTable = pgTable(
  "ai_sheet_daily_usage",
  {
    quotaDay: date("quota_day", { mode: "string" }).primaryKey(),
    used: integer("used").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 14,
      scale: 8,
    })
      .notNull()
      .default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("ai_sheet_daily_usage_used_check", sql`${table.used} >= 0`)],
);
