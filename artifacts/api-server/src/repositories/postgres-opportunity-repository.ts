import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import {
  companyProfilesTable,
  culturalOpportunitiesTable,
  db,
  ingestRunsTable,
  type OpportunityDocument,
  type OpportunityKind,
  type OpportunitySource,
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
import { queryTokens } from "../domain/normalize";
import type { OpportunityCriteria } from "../lib/opportunity-query";
import {
  onOrAfterSaoPauloDate,
  onOrBeforeSaoPauloDate,
} from "./postgres-date-filter";
import { scoreOpportunityForProfile } from "../recommendations/recommendation-service";

const INGEST_SOURCE = "mapas-culturais";

export const opportunityKindLabels: Record<OpportunityKind, string> = {
  culture: "Cultura",
  funding: "Fomento",
  innovation: "Inovação",
  partnership: "Parceria",
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
  | "organization";

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

const toSummary = (
  row: OpportunityRow,
  profile: OpportunityProfile | null = null,
): OpportunitySummary => {
  const installation = installationById(row.installationId);
  const profileMatch = profile
    ? scoreOpportunityForProfile(
        {
          searchText: row.searchText,
          state: row.state,
          amount: row.amount === null ? null : Number(row.amount),
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
  };
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
    .from(culturalOpportunitiesTable);
  const coverage = await latestCoverage();
  const hiddenIndividualListings = criteria.includeIndividual
    ? 0
    : await countRows(whereFor(criteria, undefined, "only"));
  const [profile] = userId
    ? await db
        .select()
        .from(companyProfilesTable)
        .where(eq(companyProfilesTable.userId, userId))
        .limit(1)
    : [];

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
      }
    : null;

  return {
    data: rows.map((row) => toSummary(row, profile ?? null)),
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
      ...coverageMeta(coverage),
      hiddenIndividualListings,
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
  const [profile] = userId
    ? await db
        .select()
        .from(companyProfilesTable)
        .where(eq(companyProfilesTable.userId, userId))
        .limit(1)
    : [];
  return toSummary(row, profile ?? null);
}
