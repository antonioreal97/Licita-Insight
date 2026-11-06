import {
  boolean,
  check,
  date,
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
  "culture" | "funding" | "innovation" | "partnership" | "procurement";
export type OpportunitySource =
  | "mapas"
  | "finep"
  | "cnpq"
  | "capes"
  | "transferegov"
  | "funarte"
  | "minc"
  | "salic"
  | "worldbank"
  | "eu_ft"
  | "idb"
  | "fap";
/** Reach of the call, not its nature: an international call still has a `kind`. */
export type OpportunityScope = "national" | "international";
export type BrazilEligibility = "yes" | "conditional" | "no" | "unknown";
/** `date` when the source gives no time, or a local time whose time zone cannot be resolved. */
export type OpportunityDeadlinePrecision = "datetime" | "date";
/** `source` when the source already publishes the title in Portuguese; `model` for a local translation. */
export type OpportunityTranslationSource = "source" | "model";
/** Where an application link or registration period was read: the call page at the source or one of its documents. */
export type OpportunityNoticeOrigin = "source_page" | "document";
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
    scope: text("scope")
      .$type<OpportunityScope>()
      .notNull()
      .default("national"),
    /** Body that funds or runs the call ("Banco Mundial", "União Europeia"). International rows only. */
    agency: text("agency"),
    /** Where the call is executed: ISO 3166-1 alpha-2, the name in Portuguese and the region slug. */
    country: text("country"),
    countryName: text("country_name"),
    region: text("region"),
    /** BCP 47 language of the notice at the source. */
    language: text("language"),
    /** `title` is what the hub shows: `titlePt` when there is one, else `titleOriginal`. */
    titleOriginal: text("title_original"),
    titlePt: text("title_pt"),
    translationSource:
      text("translation_source").$type<OpportunityTranslationSource>(),
    /** Value as published. `amount` stays in reais and is only set when the source itself publishes reais. */
    amountOriginal: numeric("amount_original", { precision: 18, scale: 2 }),
    currency: text("currency"),
    /** `amountOriginal` at the PTAX selling rate of `fxDate` (Banco Central do Brasil). */
    amountBrlApprox: numeric("amount_brl_approx", { precision: 18, scale: 2 }),
    fxRate: numeric("fx_rate", { precision: 18, scale: 6 }),
    fxDate: date("fx_date"),
    /** `registrationTo` is the instant; these keep how the source wrote it. */
    deadlineTimeZone: text("deadline_time_zone"),
    deadlinePrecision:
      text("deadline_precision").$type<OpportunityDeadlinePrecision>(),
    deadlineOriginal: text("deadline_original"),
    /** Whether an entity or person from Brazil can apply, and the readable reason of the rule that decided. */
    brazilEligibility: text("brazil_eligibility").$type<BrazilEligibility>(),
    brazilEligibilityReason: text("brazil_eligibility_reason"),
    brazilEligibilityRule: text("brazil_eligibility_rule"),
    /** Whether the funder pays a participant from Brazil. Separate from being allowed to take part. */
    brazilFunding: text("brazil_funding").$type<BrazilEligibility>(),
    brazilFundingReason: text("brazil_funding_reason"),
    eligibilityCheckedAt: timestamp("eligibility_checked_at", {
      withTimezone: true,
    }),
    sourceUrl: text("source_url"),
    /**
     * Where to apply, read without AI from the call page or its documents. Empty when the reading found no
     * link with enough confidence. `applicationPlatform` is the slug of a known platform, `null` for a link
     * accepted only by its context.
     */
    applicationUrl: text("application_url"),
    applicationPlatform: text("application_platform"),
    applicationLabel: text("application_label"),
    applicationSource:
      text("application_source").$type<OpportunityNoticeOrigin>(),
    applicationDocumentTitle: text("application_document_title"),
    /** Last reading of the page and documents, and the inputs it read, so an unchanged call is not read again. */
    applicationCheckedAt: timestamp("application_checked_at", {
      withTimezone: true,
    }),
    applicationInputHash: text("application_input_hash"),
    /** Registration period read from the notice, kept apart from the dates the source publishes. */
    noticeRegistrationFrom: timestamp("notice_registration_from", {
      withTimezone: true,
    }),
    noticeRegistrationTo: timestamp("notice_registration_to", {
      withTimezone: true,
    }),
    noticeDatesSource: text(
      "notice_dates_source",
    ).$type<OpportunityNoticeOrigin>(),
    noticeDatesDocumentTitle: text("notice_dates_document_title"),
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
    index("cultural_opportunities_scope_idx").on(table.scope),
    index("cultural_opportunities_brazil_eligibility_idx").on(
      table.brazilEligibility,
    ),
    index("cultural_opportunities_region_idx").on(table.region),
    index("cultural_opportunities_search_text_trgm_idx").using(
      "gin",
      table.searchText.asc().op("gin_trgm_ops"),
    ),
    check(
      "cultural_opportunities_kind_check",
      sql`${table.kind} in ('culture', 'funding', 'innovation', 'partnership', 'procurement')`,
    ),
    check(
      "cultural_opportunities_source_check",
      sql`${table.source} in ('mapas', 'finep', 'cnpq', 'capes', 'transferegov', 'funarte', 'minc', 'salic', 'worldbank', 'eu_ft', 'idb', 'fap')`,
    ),
    check(
      "cultural_opportunities_scope_check",
      sql`${table.scope} in ('national', 'international')`,
    ),
    check(
      "cultural_opportunities_brazil_eligibility_check",
      sql`${table.brazilEligibility} is null or ${table.brazilEligibility} in ('yes', 'conditional', 'no', 'unknown')`,
    ),
    check(
      "cultural_opportunities_brazil_funding_check",
      sql`${table.brazilFunding} is null or ${table.brazilFunding} in ('yes', 'conditional', 'no', 'unknown')`,
    ),
    check(
      "cultural_opportunities_deadline_precision_check",
      sql`${table.deadlinePrecision} is null or ${table.deadlinePrecision} in ('datetime', 'date')`,
    ),
    check(
      "cultural_opportunities_amount_original_check",
      sql`${table.amountOriginal} is null or ${table.amountOriginal} >= 0`,
    ),
    check(
      "cultural_opportunities_application_source_check",
      sql`${table.applicationSource} is null or ${table.applicationSource} in ('source_page', 'document')`,
    ),
    check(
      "cultural_opportunities_notice_dates_source_check",
      sql`${table.noticeDatesSource} is null or ${table.noticeDatesSource} in ('source_page', 'document')`,
    ),
    check(
      "cultural_opportunities_amount_check",
      sql`${table.amount} is null or ${table.amount} >= 0`,
    ),
  ],
);
