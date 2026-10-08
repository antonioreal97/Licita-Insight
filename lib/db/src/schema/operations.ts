import {
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./accounts";
import { tendersTable } from "./tenders";

export type AiJobKind = "index" | "document_ocr" | "fit" | "sheet" | "sheet_summary" | "title_rewrite";
export type AiJobLane = "interactive" | "batch";
export type AiJobStatus = "queued" | "running" | "succeeded" | "failed" | "dead";

export const aiJobsTable = pgTable(
  "ai_jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<AiJobKind>().notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tendersTable.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    lane: text("lane").$type<AiJobLane>().notNull(),
    status: text("status").$type<AiJobStatus>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(6),
    runAfter: timestamp("run_after", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ai_jobs_dedupe_uidx").on(table.dedupeKey),
    index("ai_jobs_claim_idx")
      .on(table.lane, table.runAfter, table.createdAt)
      .where(sql`${table.status} = 'queued'`),
    index("ai_jobs_user_created_idx").on(table.userId, table.createdAt),
    check(
      "ai_jobs_kind_check",
      sql`${table.kind} in ('index', 'document_ocr', 'fit', 'sheet', 'sheet_summary', 'title_rewrite')`,
    ),
    check("ai_jobs_lane_check", sql`${table.lane} in ('interactive', 'batch')`),
    check(
      "ai_jobs_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'dead')`,
    ),
    check("ai_jobs_attempts_check", sql`${table.attempts} >= 0`),
    check("ai_jobs_max_attempts_check", sql`${table.maxAttempts} >= 1`),
  ],
);

export const jobRunAuditTable = pgTable(
  "job_run_audit",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    jobKey: text("job_key").notNull(),
    status: text("status").notNull(),
    workerId: text("worker_id").notNull(),
    durationMs: integer("duration_ms"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("job_run_audit_job_started_idx").on(table.jobKey, table.startedAt),
    check(
      "job_run_audit_status_check",
      sql`${table.status} in ('running', 'skipped_locked', 'skipped_budget', 'succeeded', 'failed')`,
    ),
  ],
);
