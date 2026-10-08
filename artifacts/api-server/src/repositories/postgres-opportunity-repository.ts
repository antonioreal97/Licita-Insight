import { and, asc, desc, inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { culturalOpportunitiesTable, db, ingestRunsTable } from "@workspace/db";
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
import { queryTokens } from "../domain/normalize";
import type { OpportunityCriteria } from "../lib/opportunity-query";
import {
  onOrAfterSaoPauloDate,
  onOrBeforeSaoPauloDate,
} from "./postgres-date-filter";

const SOURCE = "mapas-culturais";

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
  program: OpportunityProgram;
  registrationFrom: string | null;
  registrationTo: string | null;
  state: string | null;
  installation: { id: string; name: string; uf: string };
  sourceUrl: string | null;
  updatedAt: string;
};

export type FacetBucket = { value: string; label: string; count: number };

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
  };
};

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

const whereFor = (
  criteria: OpportunityCriteria,
  skip?: "status" | "state" | "installation" | "program",
): SQL | undefined => {
  const filters: SQL[] = [];
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

const toSummary = (row: OpportunityRow): OpportunitySummary => {
  const installation = installationById(row.installationId);
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    organizationName: row.organizationName,
    status: row.status as OpportunityStatus,
    program: row.program as OpportunityProgram,
    registrationFrom: iso(row.registrationFrom),
    registrationTo: iso(row.registrationTo),
    state: row.state,
    installation: {
      id: row.installationId,
      name: installation?.name ?? row.organizationName,
      uf: installation?.uf ?? row.state ?? "",
    },
    sourceUrl: row.sourceUrl,
    updatedAt: row.updatedAt.toISOString(),
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

const latestCoverage = async (): Promise<InstallationCoverage[]> => {
  const [run] = await db
    .select({ details: ingestRunsTable.details })
    .from(ingestRunsTable)
    .where(eqSource())
    .orderBy(desc(ingestRunsTable.startedAt))
    .limit(1);
  return coverageFromDetails(run?.details) ?? pendingCoverage();
};

const eqSource = () => sql`${ingestRunsTable.source} = ${SOURCE}`;

const coverageMeta = (coverage: InstallationCoverage[]) => ({
  installationIssues: coverage.flatMap((row) => {
    if (
      !["failed", "degraded", "blocked", "vocabulary_fallback"].includes(
        row.outcome,
      )
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
      }
    : null;

  return {
    data: rows.map(toSummary),
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
    },
  };
}

export async function findOpportunity(
  id: string,
): Promise<OpportunitySummary | undefined> {
  const [row] = await db
    .select()
    .from(culturalOpportunitiesTable)
    .where(sql`${culturalOpportunitiesTable.id} = ${id}`)
    .limit(1);
  return row ? toSummary(row) : undefined;
}
