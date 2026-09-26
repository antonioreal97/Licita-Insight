import {
  bigserial,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
      sql`${table.status} in ('running', 'skipped_locked', 'succeeded', 'failed')`,
    ),
  ],
);
