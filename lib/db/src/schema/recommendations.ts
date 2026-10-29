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
  uniqueIndex,
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
  /** Rules that produced this profile and its rows; absent before versioning, which forces a rebuild on read. */
  algorithmVersion?: number;
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

/** One additive part of a recommendation score; the score is the sum of the parts. */
export type RecommendationFeatureKey =
  | "profileCategory"
  | "profileTerms"
  | "profileDescription"
  | "interest"
  | "historyTerms"
  | "historyCategory"
  | "location"
  | "organization"
  | "value"
  | "platform"
  | "deadline"
  | "novelty"
  | "dismissalPenalty";

export type RecommendationFeatures = Partial<Record<RecommendationFeatureKey, number>>;

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
    /** Score parts, kept so an offline evaluation can re-rank with other weights. */
    features: jsonb("features")
      .$type<RecommendationFeatures>()
      .notNull()
      .default(sql`'{}'::jsonb`),
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

/**
 * What each user was shown, with the score parts at that moment: the base for offline evaluation and, later, for
 * calibrating the weights. One row per tender per ranking run and scope, so re-reading a page adds nothing.
 * Outcomes come from the tables that already hold them (saved, monitored, Interessa, dismissals); only the click,
 * which has no other trace, lives here, and only with the browsing opt-in. Kept for 180 days like the events.
 */
export const recommendationImpressionsTable = pgTable(
  "recommendation_impressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tendersTable.id, { onDelete: "cascade" }),
    scope: text("scope").$type<"all" | "profile">().notNull(),
    /** 1-based place on screen for this scope (triage filters the stored ranking). */
    position: integer("position").notNull(),
    rank: integer("rank").notNull(),
    score: numeric("score", { precision: 10, scale: 5 }).notNull(),
    features: jsonb("features")
      .$type<RecommendationFeatures>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    algorithmVersion: integer("algorithm_version").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    shownAt: timestamp("shown_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "recommendation_impressions_scope_check",
      sql`${table.scope} in ('all', 'profile')`,
    ),
    uniqueIndex("recommendation_impressions_run_idx").on(
      table.userId,
      table.tenderId,
      table.scope,
      table.generatedAt,
    ),
    index("recommendation_impressions_user_time_idx").on(
      table.userId,
      table.shownAt,
    ),
    index("recommendation_impressions_retention_idx").on(table.shownAt),
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
