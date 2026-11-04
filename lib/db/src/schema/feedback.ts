import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./accounts";
import { tendersTable } from "./tenders";

export const TENDER_FEEDBACK_KINDS = [
  "wrong_or_missing_info",
  "possible_irregularity",
  "broken_link",
  "other",
] as const;
export type TenderFeedbackKind = (typeof TENDER_FEEDBACK_KINDS)[number];

export const TENDER_FEEDBACK_SECTIONS = [
  "summary",
  "deadlines",
  "value",
  "documents",
  "sheet",
  "items",
  "timeline",
  "other",
] as const;
export type TenderFeedbackSection = (typeof TENDER_FEEDBACK_SECTIONS)[number];

export type TenderFeedbackStatus = "new" | "triaged" | "resolved" | "dismissed";

/** Reports sent from a tender page to the Pardal Digital team (tender-feedback-v1). `user_id` is null when anonymous. */
export const tenderFeedbackTable = pgTable(
  "tender_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tendersTable.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    kind: text("kind").$type<TenderFeedbackKind>().notNull(),
    section: text("section").$type<TenderFeedbackSection>(),
    message: text("message").notNull(),
    pageUrl: text("page_url"),
    userAgent: text("user_agent"),
    status: text("status").$type<TenderFeedbackStatus>().notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "tender_feedback_kind_check",
      sql`${table.kind} in ('wrong_or_missing_info', 'possible_irregularity', 'broken_link', 'other')`,
    ),
    check(
      "tender_feedback_section_check",
      sql`${table.section} is null or ${table.section} in ('summary', 'deadlines', 'value', 'documents', 'sheet', 'items', 'timeline', 'other')`,
    ),
    check(
      "tender_feedback_status_check",
      sql`${table.status} in ('new', 'triaged', 'resolved', 'dismissed')`,
    ),
    check(
      "tender_feedback_message_length_check",
      sql`char_length(${table.message}) between 10 and 2000`,
    ),
    index("tender_feedback_status_created_at_idx").on(table.status, table.createdAt),
    index("tender_feedback_tender_idx").on(table.tenderId, table.createdAt),
    index("tender_feedback_user_idx").on(table.userId),
  ],
);
