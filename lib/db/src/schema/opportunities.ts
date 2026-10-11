import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type OpportunityKind =
  "culture" | "funding" | "innovation" | "partnership";
export type OpportunitySource = "mapas" | "finep" | "cnpq" | "capes";
export type OpportunityDocument = {
  title: string;
  url: string;
  mediaType: string | null;
};

export const culturalOpportunitiesTable = pgTable(
  "cultural_opportunities",
  {
    id: text("id").primaryKey(),
    installationId: text("installation_id").notNull(),
    externalId: text("external_id").notNull(),
    kind: text("kind").$type<OpportunityKind>().notNull().default("culture"),
    source: text("source")
      .$type<OpportunitySource>()
      .notNull()
      .default("mapas"),
    title: text("title").notNull(),
    summary: text("summary"),
    organizationName: text("organization_name").notNull(),
    audience: text("audience"),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    documents: jsonb("documents")
      .$type<OpportunityDocument[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    state: text("state"),
    registrationFrom: timestamp("registration_from", { withTimezone: true }),
    registrationTo: timestamp("registration_to", { withTimezone: true }),
    status: text("status").notNull(),
    program: text("program"),
    /** Canonical area slugs (`OPPORTUNITY_AREAS` in the API); the filter and the facet read this column. */
    areas: text("areas")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Area terms exactly as the source published them (Mapas `terms.area`). */
    areaTerms: text("area_terms")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Source type of the call: "Edital", "Oficina", "Festival"… */
    opportunityType: text("opportunity_type"),
    /** Project, agent, space or event the call belongs to at the source. */
    originName: text("origin_name"),
    /** Municipality, set only for municipal installations. */
    city: text("city"),
    continuousFlow: boolean("continuous_flow").notNull().default(false),
    sourceUrl: text("source_url"),
    searchText: text("search_text").notNull(),
    rawPayload: jsonb("raw_payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("cultural_opportunities_installation_external_uidx").on(
      table.installationId,
      table.externalId,
    ),
    index("cultural_opportunities_kind_idx").on(table.kind),
    index("cultural_opportunities_source_idx").on(table.source),
    index("cultural_opportunities_status_idx").on(table.status),
    index("cultural_opportunities_state_idx").on(table.state),
    index("cultural_opportunities_registration_to_idx").on(
      table.registrationTo,
    ),
    index("cultural_opportunities_installation_idx").on(table.installationId),
    index("cultural_opportunities_areas_idx").using("gin", table.areas),
    index("cultural_opportunities_city_idx").on(table.city),
    index("cultural_opportunities_fetched_at_idx").on(table.fetchedAt),
    index("cultural_opportunities_search_text_trgm_idx").using(
      "gin",
      table.searchText.asc().op("gin_trgm_ops"),
    ),
    check(
      "cultural_opportunities_kind_check",
      sql`${table.kind} in ('culture', 'funding', 'innovation', 'partnership')`,
    ),
    check(
      "cultural_opportunities_source_check",
      sql`${table.source} in ('mapas', 'finep', 'cnpq', 'capes')`,
    ),
    check(
      "cultural_opportunities_amount_check",
      sql`${table.amount} is null or ${table.amount} >= 0`,
    ),
  ],
);
