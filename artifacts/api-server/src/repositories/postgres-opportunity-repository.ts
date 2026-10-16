import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import {
  companyProfilesTable,
  culturalOpportunitiesTable,
  db,
  ingestRunsTable,
  pool,
  usersTable,
  type BrazilEligibility,
  type OpportunityDeadlinePrecision,
  type OpportunityNoticeOrigin,
  type OpportunityDocument,
  type OpportunityKind,
  type OpportunityScope,
  type OpportunitySource,
  type OpportunityTranslationSource,
} from "@workspace/db";
import {
  installationById,
  CULTURAL_INSTALLATIONS,
} from "../ingest/cultural-installations";
import {
  coverageFromDetails,
  pendingCoverage,
  type InstallationCoverage,
} from "../ingest/collect-opportunities";
import type {
  OpportunityProgram,
  OpportunityStatus,
} from "../ingest/opportunity-map";
import {
  OPPORTUNITY_AREAS,
  opportunityAreaLabels,
  type OpportunityArea,
} from "../ingest/opportunity-areas";
import { storedOwnerReview } from "../ingest/opportunity-owner";
import { platformBySlug } from "../ingest/application-platforms";
import {
  INTERNATIONAL_REGIONS,
  internationalLanguageLabels,
  internationalRegionLabels,
  type InternationalRegion,
} from "../ingest/international-countries";
import type { InternationalDetail } from "../ingest/international-draft";
import { readCompanyProfileRow } from "../ai/company-fit-service";
import { queryTokens } from "../domain/normalize";
import type { OpportunityCriteria } from "../lib/opportunity-query";
import { readCutoverState } from "../workspaces/cutover-state";
import { requireDefaultWorkspace } from "../workspaces/workspace-service";
import {
  onOrAfterSaoPauloDate,
  onOrBeforeSaoPauloDate,
} from "./postgres-date-filter";
import { scoreOpportunityForProfile } from "../recommendations/recommendation-service";

const INGEST_SOURCE = "mapas-culturais";
const INTERNATIONAL_INGEST_SOURCE = "international";

export const opportunityKindLabels: Record<OpportunityKind, string> = {
  culture: "Cultura",
  funding: "Fomento",
  innovation: "Inovação",
  partnership: "Parceria",
  procurement: "Licitação internacional",
};

export const opportunitySourceLabels: Record<OpportunitySource, string> = {
  mapas: "Mapas Culturais",
  finep: "FINEP",
  cnpq: "CNPq",
  capes: "CAPES",
  transferegov: "Transferegov.br",
  funarte: "Funarte",
  minc: "Ministério da Cultura",
  salic: "Lei Rouanet (Salic)",
  worldbank: "Banco Mundial",
  eu_ft: "União Europeia (Funding & Tenders)",
  idb: "BID",
};

export const brazilEligibilityLabels: Record<BrazilEligibility, string> = {
  yes: "Aberto a brasileiros",
  conditional: "Condicional",
  no: "Fechado a brasileiros",
  unknown: "Elegibilidade a confirmar",
};

export const brazilFundingLabels: Record<BrazilEligibility, string> = {
  yes: "Financia participante do Brasil",
  conditional: "Financiamento condicional",
  no: "Sem financiamento direto",
  unknown: "Financiamento a confirmar",
};

export const opportunityStatusLabels: Record<OpportunityStatus, string> = {
  open: "Inscrições abertas",
  upcoming: "Inscrições em breve",
  closed: "Inscrições encerradas",
  undated: "Prazo não informado",
};

export const opportunityProgramLabels: Record<OpportunityProgram, string> = {
  audiovisual: "Audiovisual",
  lpg: "Lei Paulo Gustavo",
  fac: "Fundo de Apoio à Cultura",
  fsa: "Fundo Setorial do Audiovisual",
};

export type OpportunitySummary = {
  id: string;
  title: string;
  summary: string | null;
  organizationName: string;
  status: OpportunityStatus;
  program: OpportunityProgram | null;
  kind: OpportunityKind;
  source: OpportunitySource;
  sourceName: string;
  audience: string | null;
  amount: number | null;
  documents: OpportunityDocument[];
  registrationFrom: string | null;
  registrationTo: string | null;
  state: string | null;
  city: string | null;
  continuousFlow: boolean;
  /** Canonical areas, for filtering. `areaTerms` are the terms as the source published them. */
  areas: OpportunityArea[];
  areaTerms: string[];
  opportunityType: string | null;
  originName: string | null;
  /** Published by a person, with no sign of a public call. Only returned when the search asks for them. */
  individualListing: boolean;
  installation: {
    id: string;
    name: string;
    uf: string;
    city: string | null;
  };
  sourceUrl: string | null;
  updatedAt: string;
  profileMatch: { score: number; reasons: string[] } | null;
  scope: OpportunityScope;
  /** Set on international calls only; `null` on every national one. */
  international: InternationalOpportunity | null;
  /** Where to apply, read without AI from the call page or its documents. `null` when none was found. */
  application: OpportunityApplication | null;
  /** When the call page or its documents were last read for `application` and `noticeDates`. */
  applicationCheckedAt: string | null;
  /** Registration period read from the notice, set only when the source publishes no dates. */
  noticeDates: OpportunityNoticeDates | null;
};

export type OpportunityApplication = {
  url: string;
  /** Slug of a known platform, `null` for a link accepted by the words around it in the notice. */
  platform: string | null;
  label: string | null;
  /** Definite article of `label` in Portuguese ("a Plataforma Sucupira", "o Salic"). */
  article: "a" | "o" | null;
  /** `source_page`: the call page (or the page is the platform itself). `document`: one of its documents. */
  origin: OpportunityNoticeOrigin;
  documentTitle: string | null;
};

export type OpportunityNoticeDates = {
  registrationFrom: string | null;
  registrationTo: string | null;
  origin: OpportunityNoticeOrigin;
  documentTitle: string | null;
};

export type EligibilityAnswer = {
  status: BrazilEligibility;
  label: string;
  /** Readable sentence of the rule that decided. Indicative: the official notice prevails. */
  reason: string | null;
};

export type InternationalOpportunity = {
  /** Body that funds or runs the call. */
  agency: string | null;
  country: string | null;
  countryName: string | null;
  region: InternationalRegion | null;
  regionName: string | null;
  /** True when the project is executed in Brazil. */
  brazilProject: boolean;
  language: string | null;
  languageName: string | null;
  titleOriginal: string | null;
  titlePt: string | null;
  /** `source`: the source published it in Portuguese. `model`: local automatic translation. */
  translationSource: OpportunityTranslationSource | null;
  amountOriginal: number | null;
  currency: string | null;
  /** `amountOriginal` at the PTAX selling rate of `fxDate`. An approximation, never a quote of the notice. */
  amountBrlApprox: number | null;
  fxRate: number | null;
  fxDate: string | null;
  deadline: {
    /** Same instant as `registrationTo`. */
    at: string | null;
    /** `date`: only the day is known; the hour, if any, is in `original` and was not converted. */
    precision: OpportunityDeadlinePrecision | null;
    timeZone: string | null;
    original: string | null;
  };
  /** Can an entity or person from Brazil take part. */
  brazilEligibility: (EligibilityAnswer & { rule: string | null }) | null;
  /** Does the funder pay a participant from Brazil. `null` where the question does not apply. */
  brazilFunding: EligibilityAnswer | null;
  eligibilityCheckedAt: string | null;
  details: InternationalDetail[];
};

export type FacetBucket = { value: string; label: string; count: number };
/** A municipality bucket also says its UF, so the client can filter by both and tell homonyms apart. */
export type CityFacetBucket = FacetBucket & { state: string | null };

export type OpportunitySearchResponse = {
  data: OpportunitySummary[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    totalIsEstimate: boolean;
  };
  facets: {
    status: FacetBucket[];
    state: FacetBucket[];
    installation: FacetBucket[];
    program: FacetBucket[];
    kind: FacetBucket[];
    source: FacetBucket[];
    area: FacetBucket[];
    city: CityFacetBucket[];
    organization: FacetBucket[];
    /** The next six are empty unless the search includes international calls. */
    agency: FacetBucket[];
    region: FacetBucket[];
    language: FacetBucket[];
    opportunityType: FacetBucket[];
    eligibility: FacetBucket[];
    funding: FacetBucket[];
  } | null;
  meta: {
    query: string | null;
    tookMs: number;
    indexUpdatedAt: string | null;
    installationIssues: {
      installationId: string;
      name: string;
      message: string;
    }[];
    gaps: { uf: string; name: string }[];
    /** Individual listings the same filters would add with `includeIndividual=true`. */
    hiddenIndividualListings: number;
    scope: OpportunityCriteria["scope"];
    /** The account preference: international calls enter profile matching only when it is on. */
    internationalInProfile: boolean;
  };
};

/** Decided at collection and kept in `raw_payload.ownerReview` (`ingest/opportunity-owner.ts`). */
const individualListing = sql`coalesce(${culturalOpportunitiesTable.rawPayload} #>> '{ownerReview,individualListing}', 'false') = 'true'`;

type OpportunityRow = typeof culturalOpportunitiesTable.$inferSelect;

const likePattern = (token: string): string =>
  `%${token.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

const like = (column: PgColumn, token: string): SQL =>
  sql`${column} LIKE ${likePattern(token)} ESCAPE '\\'`;

const requireNumber = (value: unknown, field: string): number => {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(
      `Expected a number for ${field}, received ${String(value)}`,
    );
  }
  return number;
};

const iso = (value: Date | null): string | null =>
  value ? value.toISOString() : null;

type FacetName =
  | "status"
  | "state"
  | "installation"
  | "program"
  | "kind"
  | "source"
  | "area"
  | "city"
  | "organization"
  | "agency"
  | "region"
  | "language"
  | "opportunityType"
  | "eligibility"
  | "funding";

const ORGANIZATION_FACET_LIMIT = 100;

const textArray = (values: string[]): SQL =>
  sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;

const whereFor = (
  criteria: OpportunityCriteria,
  skip?: FacetName,
  individual: "as-asked" | "only" = "as-asked",
): SQL | undefined => {
  const filters: SQL[] = [];
  if (individual === "only") filters.push(individualListing);
  else if (!criteria.includeIndividual)
    filters.push(sql`not ${individualListing}`);
  for (const token of queryTokens(criteria.query)) {
    filters.push(like(culturalOpportunitiesTable.searchText, token));
  }
  if (criteria.scope !== "all")
    filters.push(eq(culturalOpportunitiesTable.scope, criteria.scope));
  if (skip !== "agency" && criteria.agency.length > 0)
    filters.push(inArray(culturalOpportunitiesTable.agency, criteria.agency));
  if (skip !== "region" && criteria.region.length > 0)
    filters.push(inArray(culturalOpportunitiesTable.region, criteria.region));
  if (criteria.country.length > 0)
    filters.push(inArray(culturalOpportunitiesTable.country, criteria.country));
  if (skip !== "language" && criteria.language.length > 0)
    filters.push(
      inArray(culturalOpportunitiesTable.language, criteria.language),
    );
  if (skip !== "opportunityType" && criteria.opportunityType.length > 0)
    filters.push(
      inArray(
        culturalOpportunitiesTable.opportunityType,
        criteria.opportunityType,
      ),
    );
  if (skip !== "eligibility" && criteria.eligibility.length > 0)
    filters.push(
      inArray(culturalOpportunitiesTable.brazilEligibility, criteria.eligibility),
    );
  if (skip !== "funding" && criteria.funding.length > 0)
    filters.push(
      inArray(culturalOpportunitiesTable.brazilFunding, criteria.funding),
    );
  if (skip !== "state" && criteria.state.length > 0) {
    filters.push(
      sql`upper(${culturalOpportunitiesTable.state}) in (${sql.join(
        criteria.state.map((state) => sql`${state}`),
        sql`, `,
      )})`,
    );
  }
  if (skip !== "installation" && criteria.installationId.length > 0) {
    filters.push(
      inArray(
        culturalOpportunitiesTable.installationId,
        criteria.installationId,
      ),
    );
  }
  if (skip !== "status" && criteria.status.length > 0) {
    filters.push(inArray(culturalOpportunitiesTable.status, criteria.status));
  }
  if (skip !== "program" && criteria.program.length > 0) {
    filters.push(inArray(culturalOpportunitiesTable.program, criteria.program));
  }
  if (skip !== "area" && criteria.area.length > 0) {
    filters.push(
      sql`${culturalOpportunitiesTable.areas} && ${textArray(criteria.area)}`,
    );
  }
  if (skip !== "city" && criteria.city.length > 0) {
    filters.push(inArray(culturalOpportunitiesTable.city, criteria.city));
  }
  if (skip !== "organization" && criteria.organization.length > 0) {
    filters.push(
      inArray(
        culturalOpportunitiesTable.organizationName,
        criteria.organization,
      ),
    );
  }
  if (skip !== "kind" && criteria.kind.length > 0) {
    filters.push(inArray(culturalOpportunitiesTable.kind, criteria.kind));
  }
  if (skip !== "source" && criteria.source.length > 0) {
    filters.push(inArray(culturalOpportunitiesTable.source, criteria.source));
  }
  if (criteria.deadlineFrom) {
    filters.push(
      onOrAfterSaoPauloDate(
        culturalOpportunitiesTable.registrationTo,
        criteria.deadlineFrom,
      ),
    );
  }
  if (criteria.deadlineTo) {
    filters.push(
      onOrBeforeSaoPauloDate(
        culturalOpportunitiesTable.registrationTo,
        criteria.deadlineTo,
      ),
    );
  }
  return filters.length > 0 ? and(...filters) : undefined;
};

type OpportunityProfile = typeof companyProfilesTable.$inferSelect;

const numberOrNull = (value: string | null): number | null =>
  value === null ? null : Number(value);

const detailsOf = (rawPayload: unknown): InternationalDetail[] => {
  const details =
    rawPayload !== null && typeof rawPayload === "object"
      ? (rawPayload as { details?: unknown }).details
      : null;
  if (!Array.isArray(details)) return [];
  return details.flatMap((detail) => {
    if (detail === null || typeof detail !== "object") return [];
    const { label, value } = detail as { label?: unknown; value?: unknown };
    return typeof label === "string" && typeof value === "string"
      ? [{ label, value }]
      : [];
  });
};

const toInternational = (row: OpportunityRow): InternationalOpportunity => {
  const region = INTERNATIONAL_REGIONS.find((value) => value === row.region);
  return {
    agency: row.agency,
    country: row.country,
    countryName: row.countryName,
    region: region ?? null,
    regionName: region ? internationalRegionLabels[region] : null,
    brazilProject: row.country === "BR",
    language: row.language,
    languageName: row.language
      ? (internationalLanguageLabels[row.language] ?? row.language)
      : null,
    titleOriginal: row.titleOriginal,
    titlePt: row.titlePt,
    translationSource: row.translationSource,
    amountOriginal: numberOrNull(row.amountOriginal),
    currency: row.currency,
    amountBrlApprox: numberOrNull(row.amountBrlApprox),
    fxRate: numberOrNull(row.fxRate),
    fxDate: row.fxDate,
    deadline: {
      at: iso(row.registrationTo),
      precision: row.deadlinePrecision,
      timeZone: row.deadlineTimeZone,
      original: row.deadlineOriginal,
    },
    brazilEligibility: row.brazilEligibility
      ? {
          status: row.brazilEligibility,
          label: brazilEligibilityLabels[row.brazilEligibility],
          reason: row.brazilEligibilityReason,
          rule: row.brazilEligibilityRule,
        }
      : null,
    brazilFunding: row.brazilFunding
      ? {
          status: row.brazilFunding,
          label: brazilFundingLabels[row.brazilFunding],
          reason: row.brazilFundingReason,
        }
      : null,
    eligibilityCheckedAt: iso(row.eligibilityCheckedAt),
    details: detailsOf(row.rawPayload),
  };
};

const toApplication = (row: OpportunityRow): OpportunityApplication | null => {
  if (!row.applicationUrl || !row.applicationSource) return null;
  const platform = platformBySlug(row.applicationPlatform);
  return {
    url: row.applicationUrl,
    platform: row.applicationPlatform,
    label: row.applicationLabel,
    article: platform?.article ?? null,
    origin: row.applicationSource,
    documentTitle: row.applicationDocumentTitle,
  };
};

const toNoticeDates = (row: OpportunityRow): OpportunityNoticeDates | null =>
  // The dates of the source always win; the notice only fills a call published without any.
  row.noticeDatesSource &&
  (row.noticeRegistrationFrom || row.noticeRegistrationTo) &&
  !row.registrationFrom &&
  !row.registrationTo
    ? {
        registrationFrom: iso(row.noticeRegistrationFrom),
        registrationTo: iso(row.noticeRegistrationTo),
        origin: row.noticeDatesSource,
        documentTitle: row.noticeDatesDocumentTitle,
      }
    : null;

type ProfileContext = {
  profile: OpportunityProfile | null;
  /** The account opted in to international calls in recommendations and profile matching. */
  international: boolean;
};

const NO_PROFILE: ProfileContext = { profile: null, international: false };

const toSummary = (
  row: OpportunityRow,
  context: ProfileContext = NO_PROFILE,
): OpportunitySummary => {
  const installation = installationById(row.installationId);
  const international = row.scope === "international";
  const profile =
    international && !context.international ? null : context.profile;
  const profileMatch = profile
    ? scoreOpportunityForProfile(
        {
          searchText: row.searchText,
          state: row.state,
          // An international value is compared in reais, at the PTAX rate stored with the call.
          amount: numberOrNull(row.amountBrlApprox ?? row.amount),
          audience: row.audience,
        },
        profile,
      )
    : null;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    organizationName: row.organizationName,
    status: row.status as OpportunityStatus,
    program: row.program as OpportunityProgram | null,
    kind: row.kind,
    source: row.source,
    sourceName: opportunitySourceLabels[row.source],
    audience: row.audience,
    amount: row.amount === null ? null : Number(row.amount),
    documents: row.documents,
    registrationFrom: iso(row.registrationFrom),
    registrationTo: iso(row.registrationTo),
    state: row.state,
    city: row.city,
    continuousFlow: row.continuousFlow,
    areas: OPPORTUNITY_AREAS.filter((area) => row.areas.includes(area)),
    areaTerms: row.areaTerms,
    opportunityType: row.opportunityType,
    originName: row.originName,
    individualListing:
      storedOwnerReview(row.rawPayload)?.individualListing === true,
    installation: {
      id: row.installationId,
      name: installation?.name ?? opportunitySourceLabels[row.source],
      uf: installation?.uf ?? row.state ?? "",
      city: row.city,
    },
    sourceUrl: row.sourceUrl,
    updatedAt: row.updatedAt.toISOString(),
    profileMatch,
    scope: row.scope,
    international: international ? toInternational(row) : null,
    application: toApplication(row),
    applicationCheckedAt: iso(row.applicationCheckedAt),
    noticeDates: toNoticeDates(row),
  };
};

const profileContextFor = async (
  userId: string | undefined,
): Promise<ProfileContext> => {
  if (!userId) return NO_PROFILE;
  const { mode } = await readCutoverState(pool);
  const [profile, international] = await Promise.all([
    readCompanyProfileRow(userId, mode),
    mode === "legacy"
      ? db
          .select({ international: usersTable.showInternationalOpportunities })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1)
          .then(([user]) => user?.international === true)
      : requireDefaultWorkspace(db, userId).then(
          (workspace) => workspace.showInternationalOpportunities,
        ),
  ]);
  return { profile, international };
};

const countRows = async (where: SQL | undefined): Promise<number> => {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(culturalOpportunitiesTable)
    .where(where);
  return requireNumber(row?.total ?? 0, "count");
};

const labeledBuckets = async (
  column: PgColumn,
  labels: Record<string, string>,
  where: SQL | undefined,
): Promise<FacetBucket[]> => {
  const rows = await db
    .select({
      value: column,
      count: sql<number>`count(*)::int`,
    })
    .from(culturalOpportunitiesTable)
    .where(where)
    .groupBy(column)
    .orderBy(desc(sql`count(*)`), asc(column));

  return rows.flatMap((row) => {
    if (typeof row.value !== "string") return [];
    return [
      {
        value: row.value,
        label: labels[row.value] ?? row.value,
        count: requireNumber(row.count, "facet count"),
      },
    ];
  });
};

/** A call counts once in every area it has, so the area counts add up to more than the total. */
const areaBuckets = async (where: SQL | undefined): Promise<FacetBucket[]> => {
  const result = await db.execute<{ value: string; count: number }>(sql`
    select listed.area as value, count(*)::int as count
    from ${culturalOpportunitiesTable}
    cross join lateral unnest(${culturalOpportunitiesTable.areas}) as listed(area)
    ${where ? sql`where ${where}` : sql``}
    group by listed.area
  `);
  const counts = new Map(
    result.rows.map((row) => [
      row.value,
      requireNumber(row.count, "facet count"),
    ]),
  );
  return OPPORTUNITY_AREAS.flatMap((area) => {
    const count = counts.get(area);
    return count
      ? [{ value: area, label: opportunityAreaLabels[area], count }]
      : [];
  }).sort((left, right) => right.count - left.count);
};

const cityBuckets = async (
  where: SQL | undefined,
): Promise<CityFacetBucket[]> => {
  const rows = await db
    .select({
      city: culturalOpportunitiesTable.city,
      state: culturalOpportunitiesTable.state,
      count: sql<number>`count(*)::int`,
    })
    .from(culturalOpportunitiesTable)
    .where(and(where, sql`${culturalOpportunitiesTable.city} is not null`))
    .groupBy(culturalOpportunitiesTable.city, culturalOpportunitiesTable.state)
    .orderBy(asc(culturalOpportunitiesTable.city));
  return rows.flatMap((row) =>
    row.city
      ? [
          {
            value: row.city,
            label: row.state ? `${row.city} (${row.state})` : row.city,
            count: requireNumber(row.count, "facet count"),
            state: row.state,
          },
        ]
      : [],
  );
};

const organizationBuckets = async (
  where: SQL | undefined,
): Promise<FacetBucket[]> =>
  (
    await labeledBuckets(culturalOpportunitiesTable.organizationName, {}, where)
  ).slice(0, ORGANIZATION_FACET_LIMIT);

const latestCoverage = async (): Promise<InstallationCoverage[]> => {
  const [run] = await db
    .select({ details: ingestRunsTable.details })
    .from(ingestRunsTable)
    .where(eqSource())
    .orderBy(desc(ingestRunsTable.startedAt))
    .limit(1);
  return coverageFromDetails(run?.details) ?? pendingCoverage();
};

const eqSource = () => sql`${ingestRunsTable.source} = ${INGEST_SOURCE}`;

const coverageMeta = (coverage: InstallationCoverage[]) => ({
  installationIssues: coverage.flatMap((row) => {
    if (
      ![
        "failed",
        "degraded",
        "blocked",
        "disabled",
        "vocabulary_fallback",
      ].includes(row.outcome)
    )
      return [];
    return [
      {
        installationId: row.id,
        name: row.name,
        message: row.message ?? "A instalação não respondeu.",
      },
    ];
  }),
  gaps: coverage
    .filter((row) => row.kind === "gap")
    .map((row) => ({ uf: row.uf, name: row.name })),
});

/** Sources of the last international collection that did not answer in full. */
const internationalIssues = async (): Promise<
  OpportunitySearchResponse["meta"]["installationIssues"]
> => {
  const [run] = await db
    .select({ details: ingestRunsTable.details })
    .from(ingestRunsTable)
    .where(sql`${ingestRunsTable.source} = ${INTERNATIONAL_INGEST_SOURCE}`)
    .orderBy(desc(ingestRunsTable.startedAt))
    .limit(1);
  const sources =
    run?.details !== null && typeof run?.details === "object"
      ? (run.details as { sources?: unknown }).sources
      : null;
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((entry) => {
    if (entry === null || typeof entry !== "object") return [];
    const { source, outcome, message } = entry as Record<string, unknown>;
    if (typeof source !== "string" || outcome === "ok") return [];
    return [
      {
        installationId: source,
        name:
          opportunitySourceLabels[source as OpportunitySource] ?? source,
        message:
          typeof message === "string" && message
            ? message
            : "A fonte não respondeu.",
      },
    ];
  });
};

const regionBuckets = async (where: SQL | undefined): Promise<FacetBucket[]> =>
  labeledBuckets(
    culturalOpportunitiesTable.region,
    internationalRegionLabels,
    where,
  );

export async function searchOpportunities(
  criteria: OpportunityCriteria,
  userId?: string,
): Promise<OpportunitySearchResponse> {
  const started = Date.now();
  const where = whereFor(criteria);
  const total = await countRows(where);
  const rows = await db
    .select()
    .from(culturalOpportunitiesTable)
    .where(where)
    .orderBy(
      sql`case ${culturalOpportunitiesTable.status}
        when 'open' then 0
        when 'upcoming' then 1
        when 'undated' then 2
        else 3
      end`,
      sql`${culturalOpportunitiesTable.registrationTo} asc nulls last`,
      asc(culturalOpportunitiesTable.title),
    )
    .limit(criteria.pageSize)
    .offset((criteria.page - 1) * criteria.pageSize);

  const [updated] = await db
    .select({
      indexUpdatedAt: sql<Date | null>`max(${culturalOpportunitiesTable.fetchedAt})`,
    })
    .from(culturalOpportunitiesTable)
    .where(
      criteria.scope === "all"
        ? undefined
        : eq(culturalOpportunitiesTable.scope, criteria.scope),
    );
  // Mapas Culturais coverage (installations, states with no install) says nothing about international sources.
  const withNational = criteria.scope !== "international";
  const withInternational = criteria.scope !== "national";
  const coverage = withNational
    ? coverageMeta(await latestCoverage())
    : { installationIssues: [], gaps: [] };
  const issues = withInternational ? await internationalIssues() : [];
  const hiddenIndividualListings = criteria.includeIndividual
    ? 0
    : await countRows(whereFor(criteria, undefined, "only"));
  const context = await profileContextFor(userId);

  const facets = criteria.facets
    ? {
        status: await labeledBuckets(
          culturalOpportunitiesTable.status,
          opportunityStatusLabels,
          whereFor(criteria, "status"),
        ),
        state: await labeledBuckets(
          culturalOpportunitiesTable.state,
          {},
          whereFor(criteria, "state"),
        ),
        installation: await labeledBuckets(
          culturalOpportunitiesTable.installationId,
          Object.fromEntries(
            CULTURAL_INSTALLATIONS.map((row) => [row.id, row.name]),
          ),
          whereFor(criteria, "installation"),
        ),
        program: await labeledBuckets(
          culturalOpportunitiesTable.program,
          opportunityProgramLabels,
          whereFor(criteria, "program"),
        ),
        kind: await labeledBuckets(
          culturalOpportunitiesTable.kind,
          opportunityKindLabels,
          whereFor(criteria, "kind"),
        ),
        source: await labeledBuckets(
          culturalOpportunitiesTable.source,
          opportunitySourceLabels,
          whereFor(criteria, "source"),
        ),
        area: await areaBuckets(whereFor(criteria, "area")),
        city: await cityBuckets(whereFor(criteria, "city")),
        organization: await organizationBuckets(
          whereFor(criteria, "organization"),
        ),
        agency: withInternational
          ? await labeledBuckets(
              culturalOpportunitiesTable.agency,
              {},
              whereFor(criteria, "agency"),
            )
          : [],
        region: withInternational
          ? await regionBuckets(whereFor(criteria, "region"))
          : [],
        language: withInternational
          ? await labeledBuckets(
              culturalOpportunitiesTable.language,
              internationalLanguageLabels,
              whereFor(criteria, "language"),
            )
          : [],
        opportunityType: withInternational
          ? await labeledBuckets(
              culturalOpportunitiesTable.opportunityType,
              {},
              whereFor(criteria, "opportunityType"),
            )
          : [],
        eligibility: withInternational
          ? await labeledBuckets(
              culturalOpportunitiesTable.brazilEligibility,
              brazilEligibilityLabels,
              whereFor(criteria, "eligibility"),
            )
          : [],
        funding: withInternational
          ? await labeledBuckets(
              culturalOpportunitiesTable.brazilFunding,
              brazilFundingLabels,
              whereFor(criteria, "funding"),
            )
          : [],
      }
    : null;

  return {
    data: rows.map((row) => toSummary(row, context)),
    pagination: {
      page: criteria.page,
      pageSize: criteria.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / criteria.pageSize),
      totalIsEstimate: false,
    },
    facets,
    meta: {
      query: criteria.query,
      tookMs: Date.now() - started,
      indexUpdatedAt: updated?.indexUpdatedAt
        ? new Date(updated.indexUpdatedAt).toISOString()
        : null,
      installationIssues: [...coverage.installationIssues, ...issues],
      gaps: coverage.gaps,
      hiddenIndividualListings,
      scope: criteria.scope,
      internationalInProfile: context.international,
    },
  };
}

export async function findOpportunity(
  id: string,
  userId?: string,
): Promise<OpportunitySummary | undefined> {
  const [row] = await db
    .select()
    .from(culturalOpportunitiesTable)
    .where(sql`${culturalOpportunitiesTable.id} = ${id}`)
    .limit(1);
  if (!row) return undefined;
  return toSummary(row, await profileContextFor(userId));
}
