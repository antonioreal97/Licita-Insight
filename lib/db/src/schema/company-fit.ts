import { sql } from "drizzle-orm";
import {
  boolean,
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
} from "drizzle-orm/pg-core";
import { usersTable } from "./accounts";
import { tendersTable } from "./tenders";

export type CompanyCoverageScope = "national" | "states" | "custom";
export type CompanyCoverageMode = "strict" | "prioritize";
export type CompanyMacroregion =
  "north" | "northeast" | "central_west" | "southeast" | "south";
export type CompanySize = "me_epp" | "cooperative" | "other";

export type FitEvidenceRecord = {
  documentTitle: string;
  documentUrl: string;
  page: number;
  text: string;
};

export type FitReasonRecord =
  | { kind: "offering_match"; terms: string[] }
  | { kind: "no_offering_term" }
  | { kind: "exclusion"; terms: string[] }
  | { kind: "service_region"; text: string }
  | { kind: "out_of_coverage"; state: string | null }
  | { kind: "out_of_value_range"; estimatedValue: number }
  | { kind: "value_not_published" }
  | {
      kind: "size_restricted";
      restriction: "me_epp_exclusive" | "me_epp_quota";
      evidence: FitEvidenceRecord;
    };

export const companyProfilesTable = pgTable(
  "company_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    offerings: jsonb("offerings").$type<string[]>().notNull(),
    exclusions: jsonb("exclusions")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    selectedCategories: jsonb("selected_categories")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    selectedKeywords: jsonb("selected_keywords")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    excludedKeywords: jsonb("excluded_keywords")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    registeredPlatforms: jsonb("registered_platforms")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    coverageScope: text("coverage_scope").notNull(),
    coverageStates: jsonb("coverage_states")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    coverageRegions: jsonb("coverage_regions")
      .$type<CompanyMacroregion[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    coverageMunicipalities: jsonb("coverage_municipalities")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    headquartersMunicipalityIbge: text("headquarters_municipality_ibge"),
    coverageRadiusKm: integer("coverage_radius_km"),
    coverageMode: text("coverage_mode")
      .$type<CompanyCoverageMode>()
      .notNull()
      .default("strict"),
    acceptsRemote: boolean("accepts_remote").notNull().default(false),
    valueMin: numeric("value_min", { precision: 18, scale: 2 }),
    valueMax: numeric("value_max", { precision: 18, scale: 2 }),
    size: text("size").notNull(),
    version: integer("version").notNull().default(1),
    lastAlertAt: timestamp("last_alert_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "company_profiles_coverage_scope_check",
      sql`${table.coverageScope} in ('national', 'states', 'custom')`,
    ),
    check(
      "company_profiles_coverage_mode_check",
      sql`${table.coverageMode} in ('strict', 'prioritize')`,
    ),
    check(
      "company_profiles_coverage_radius_check",
      sql`${table.coverageRadiusKm} is null or ${table.coverageRadiusKm} in (50, 100, 200, 300, 500)`,
    ),
    check(
      "company_profiles_size_check",
      sql`${table.size} in ('me_epp', 'cooperative', 'other')`,
    ),
    check("company_profiles_version_check", sql`${table.version} >= 1`),
    check(
      "company_profiles_value_range_check",
      sql`${table.valueMin} is null or ${table.valueMax} is null or ${table.valueMin} <= ${table.valueMax}`,
    ),
    index("company_profiles_alert_idx").on(table.lastAlertAt),
  ],
);

export type ProfileKeywordRelatedTerm = {
  normalizedTerm: string;
  displayTerm: string;
  openTenderCount: number;
};

/** Daily materialized vocabulary used by profile autocomplete. It is global and contains no user data. */
export const profileKeywordVocabularyTable = pgTable(
  "profile_keyword_vocabulary",
  {
    normalizedTerm: text("normalized_term").primaryKey(),
    displayTerm: text("display_term").notNull(),
    ngramSize: integer("ngram_size").notNull(),
    openTenderCount: integer("open_tender_count").notNull(),
    predominantCategorySlug: text("predominant_category_slug"),
    predominantCategoryLabel: text("predominant_category_label"),
    relatedTerms: jsonb("related_terms")
      .$type<ProfileKeywordRelatedTerm[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("profile_keyword_vocabulary_trgm_idx").using(
      "gin",
      table.normalizedTerm.asc().op("gin_trgm_ops"),
    ),
    index("profile_keyword_vocabulary_count_idx").on(
      table.openTenderCount.desc(),
    ),
    check(
      "profile_keyword_vocabulary_ngram_size_check",
      sql`${table.ngramSize} between 1 and 3`,
    ),
    check(
      "profile_keyword_vocabulary_open_count_check",
      sql`${table.openTenderCount} >= 3`,
    ),
  ],
);

export const companyTenderFitsTable = pgTable(
  "company_tender_fits",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tenderId: text("tender_id")
      .notNull()
      .references(() => tendersTable.id, { onDelete: "cascade" }),
    profileVersion: integer("profile_version").notNull(),
    tenderFingerprint: text("tender_fingerprint").notNull(),
    requestedModel: text("requested_model").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    status: text("status").notNull(),
    level: text("level"),
    score: numeric("score", { precision: 8, scale: 7 }),
    reasons: jsonb("reasons")
      .$type<FitReasonRecord[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    responseModel: text("response_model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 14, scale: 8 })
      .notNull()
      .default("0"),
    lexicalGatePass: boolean("lexical_gate_pass"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("company_tender_fits_cache_uidx").on(
      table.userId,
      table.profileVersion,
      table.tenderId,
      table.requestedModel,
      table.promptVersion,
    ),
    index("company_tender_fits_user_checked_idx").on(
      table.userId,
      table.checkedAt,
    ),
    check(
      "company_tender_fits_status_check",
      sql`${table.status} in ('processing', 'ready', 'filtered', 'failed')`,
    ),
    check(
      "company_tender_fits_level_check",
      sql`${table.level} is null or ${table.level} in ('high', 'medium', 'low')`,
    ),
    check(
      "company_tender_fits_score_check",
      sql`${table.score} is null or (${table.score} >= 0 and ${table.score} <= 1)`,
    ),
  ],
);

export const aiFitDailyUsageTable = pgTable(
  "ai_fit_daily_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    quotaDay: date("quota_day", { mode: "string" }).notNull(),
    used: integer("used").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 14, scale: 8 })
      .notNull()
      .default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.quotaDay] }),
    index("ai_fit_daily_usage_day_idx").on(table.quotaDay),
    check("ai_fit_daily_usage_used_check", sql`${table.used} >= 0`),
  ],
);
