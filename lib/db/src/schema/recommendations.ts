import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./accounts";
import { tendersTable, type TenderCategory } from "./tenders";

export type RecommendationReason = {
  kind:
    | "profile"
    | "interest"
    | "monitored"
    | "saved"
    | "saved_search"
    | "search"
    | "location"
    | "organization"
    | "value"
    | "platform";
  text: string;
};

export type WeightedRecommendationValue = {
  value: string;
  label?: string;
  /** Signal origins are independent from the accumulated weight. Absent on legacy materialized profiles. */
  sources?: string[];
  weight: number;
};
export type RecommendationInterestProfile = {
  terms: WeightedRecommendationValue[];
  categories: WeightedRecommendationValue[];
  states: WeightedRecommendationValue[];
  organizations: WeightedRecommendationValue[];
  modalities: WeightedRecommendationValue[];
  valueMin: number | null;
  valueMax: number | null;
  coverageScope: "national" | "states" | "custom" | null;
  coverageStates: string[];
  coverageRegions?: Array<
    "north" | "northeast" | "central_west" | "southeast" | "south"
  >;
  coverageMunicipalities?: string[];
  headquartersMunicipalityIbge?: string | null;
  coverageRadiusKm?: number | null;
  coverageMode?: "strict" | "prioritize";
  acceptsRemote?: boolean;
  exclusions: string[];
  companySize: "me_epp" | "cooperative" | "other" | null;
  /** Absent in profiles rebuilt before platforms existed. */
  registeredPlatforms?: string[];
  signalCount: number;
};

export const recommendationEventsTable = pgTable(
  "recommendation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").$type<"search" | "tender_view" | "interest">().notNull(),
    normalizedTerms: jsonb("normalized_terms")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    tenderId: text("tender_id").references(() => tendersTable.id, {
      onDelete: "cascade",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "recommendation_events_type_check",
      sql`${table.type} in ('search', 'tender_view', 'interest')`,
    ),
    check(
      "recommendation_events_payload_check",
      sql`(${table.type} = 'search' and jsonb_array_length(${table.normalizedTerms}) > 0 and ${table.tenderId} is null)
        or (${table.type} = 'tender_view' and ${table.tenderId} is not null)
        or (${table.type} = 'interest' and ${table.tenderId} is not null and jsonb_array_length(${table.normalizedTerms}) > 0)`,
    ),
    index("recommendation_events_user_time_idx").on(
      table.userId,
      table.occurredAt,
    ),
    index("recommendation_events_retention_idx").on(table.occurredAt),
  ],
);

export const recommendationDismissalsTable = pgTable(
  "recommendation_dismissals",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tendersTable.id, { onDelete: "cascade" }),
    terms: jsonb("terms")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    categories: jsonb("categories")
      .$type<TenderCategory[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.tenderId] }),
    index("recommendation_dismissals_user_time_idx").on(
      table.userId,
      table.dismissedAt,
    ),
  ],
);

export const recommendationInterestProfilesTable = pgTable(
  "recommendation_interest_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    profile: jsonb("profile").$type<RecommendationInterestProfile>().notNull(),
    signalCount: integer("signal_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const userRecommendationsTable = pgTable(
  "user_recommendations",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tendersTable.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    score: numeric("score", { precision: 10, scale: 5 }).notNull(),
    reasons: jsonb("reasons")
      .$type<RecommendationReason[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.tenderId] }),
    check(
      "user_recommendations_rank_check",
      sql`${table.rank} between 1 and 50`,
    ),
    index("user_recommendations_user_rank_idx").on(table.userId, table.rank),
  ],
);

export const recommendationMetricsDailyTable = pgTable(
  "recommendation_metrics_daily",
  {
    day: date("day", { mode: "string" }).primaryKey(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    interests: integer("interests").notNull().default(0),
    dismissals: integer("dismissals").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
