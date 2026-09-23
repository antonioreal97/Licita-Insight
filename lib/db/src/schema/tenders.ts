import { sql } from "drizzle-orm";
import {
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

export type TenderCategory = { slug: string; label: string };

export type TenderItemRecord = {
  id: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  estimatedUnitValue: number | null;
  estimatedTotalValue: number | null;
};

export type TenderDocumentRecord = {
  id: string;
  name: string;
  type: string;
  sizeBytes: number | null;
  url: string;
  publishedAt: string | null;
};

export type TenderTimelineRecord = {
  at: string;
  type:
    | "published"
    | "amended"
    | "deadline_changed"
    | "status_changed"
    | "document_added";
  description: string;
};

const jsonArray = (name: string) =>
  jsonb(name)
    .notNull()
    .default(sql`'[]'::jsonb`);

export const tendersTable = pgTable(
  "tenders",
  {
    id: text("id").primaryKey(),
    pncpControlNumber: text("pncp_control_number").notNull(),
    title: text("title").notNull(),
    objectSummary: text("object_summary"),
    description: text("description"),
    organizationId: text("organization_id").notNull(),
    organizationName: text("organization_name").notNull(),
    purchasingUnit: text("purchasing_unit"),
    modality: text("modality").notNull(),
    modalityLabel: text("modality_label").notNull(),
    status: text("status").notNull(),
    tenderNumber: text("tender_number"),
    processNumber: text("process_number"),
    estimatedValue: numeric("estimated_value", { precision: 18, scale: 2 }),
    estimatedValueStatus: text("estimated_value_status").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    openingAt: timestamp("opening_at", { withTimezone: true }),
    proposalDeadline: timestamp("proposal_deadline", { withTimezone: true }),
    state: text("state"),
    city: text("city"),
    cityIbgeCode: text("city_ibge_code"),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url"),
    categories: jsonArray("categories").$type<TenderCategory[]>(),
    items: jsonArray("items").$type<TenderItemRecord[]>(),
    documents: jsonArray("documents").$type<TenderDocumentRecord[]>(),
    timeline: jsonArray("timeline").$type<TenderTimelineRecord[]>(),
    searchText: text("search_text").notNull(),
    titleNorm: text("title_norm").notNull(),
    objectNorm: text("object_norm").notNull(),
    itemsNorm: text("items_norm").notNull(),
    organizationNorm: text("organization_norm").notNull(),
    otherNorm: text("other_norm").notNull(),
    cityNorm: text("city_norm"),
    rawPayload: jsonb("raw_payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    detailsFetchedAt: timestamp("details_fetched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("tenders_pncp_control_number_uidx").on(table.pncpControlNumber),
    index("tenders_status_idx").on(table.status),
    index("tenders_modality_idx").on(table.modality),
    index("tenders_state_idx").on(table.state),
    index("tenders_published_at_idx").on(table.publishedAt),
    index("tenders_proposal_deadline_idx").on(table.proposalDeadline),
    index("tenders_organization_id_idx").on(table.organizationId),
    index("tenders_source_id_idx").on(table.sourceId),
    index("tenders_city_ibge_idx").on(table.cityIbgeCode),
    index("tenders_fetched_at_idx").on(table.fetchedAt),
  ],
);

export const ingestRunsTable = pgTable(
  "ingest_runs",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    windowFrom: timestamp("window_from", { withTimezone: true }).notNull(),
    windowTo: timestamp("window_to", { withTimezone: true }).notNull(),
    pagesRead: integer("pages_read").notNull().default(0),
    upserted: integer("upserted").notNull().default(0),
    refreshed: integer("refreshed").notNull().default(0),
    refreshErrors: integer("refresh_errors").notNull().default(0),
    error: text("error"),
    details: jsonb("details"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("ingest_runs_one_running")
      .on(table.source)
      .where(sql`${table.status} = 'running'`),
    index("ingest_runs_started_at_idx").on(table.startedAt),
  ],
);

export const ingestDaysTable = pgTable(
  "ingest_days",
  {
    source: text("source").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    modality: integer("modality").notNull(),
    uf: text("uf").notNull(), // "all" means a successful national listing.
    status: text("status").$type<"pending" | "complete">().notNull(),
    pagesRead: integer("pages_read").notNull().default(0),
    upserted: integer("upserted").notNull().default(0),
    // A listing started before midnight cannot seal that publication day.
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({
      columns: [table.source, table.day, table.modality, table.uf],
    }),
  ],
);
