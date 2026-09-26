import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const culturalOpportunitiesTable = pgTable(
  "cultural_opportunities",
  {
    id: text("id").primaryKey(),
    installationId: text("installation_id").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    organizationName: text("organization_name").notNull(),
    state: text("state"),
    registrationFrom: timestamp("registration_from", { withTimezone: true }),
    registrationTo: timestamp("registration_to", { withTimezone: true }),
    status: text("status").notNull(),
    program: text("program").notNull(),
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
    index("cultural_opportunities_status_idx").on(table.status),
    index("cultural_opportunities_state_idx").on(table.state),
    index("cultural_opportunities_registration_to_idx").on(table.registrationTo),
    index("cultural_opportunities_installation_idx").on(table.installationId),
    index("cultural_opportunities_fetched_at_idx").on(table.fetchedAt),
    index("cultural_opportunities_search_text_trgm_idx").using(
      "gin",
      table.searchText.asc().op("gin_trgm_ops"),
    ),
  ],
);
