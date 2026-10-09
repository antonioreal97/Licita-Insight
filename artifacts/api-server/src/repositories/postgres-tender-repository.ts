import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  municipalityCodesWithinRadius,
  statesForMacroregions,
} from "../service-region/service-region";
import { type PgColumn } from "drizzle-orm/pg-core";
import type {
  FacetBucket,
  Modality,
  SearchFacets,
  SearchResponse,
  SuggestionsResponse,
  TenderDetail,
  TenderStatus,
} from "@workspace/api-zod";
import { db, tendersTable } from "@workspace/db";
import type {
  TenderDocumentRecord,
  TenderItemRecord,
  TenderTimelineRecord,
} from "@workspace/db/schema";
import type { FacetGroup, SearchCriteria } from "../domain/search";
import { platformKind, platformUrl } from "../catalog/tender-platforms";
import { normalizeText, queryTokens } from "../domain/normalize";
import {
  pncpTenderNumberShort,
  summarizeOfficialObject,
} from "../ingest/pncp-map";
import { isNewTender, newTenderCutoff } from "../domain/new-tender";
import {
  onOrAfterSaoPauloDate,
  onOrBeforeSaoPauloDate,
} from "./postgres-date-filter";
import {
  createValueHistogram,
  modalityLabels,
  nonNegativeValues,
  normalizePageRelevance,
  numberRange,
  statusLabels,
  toSummary,
} from "../services/search-service";

const STATUSES = new Set<TenderStatus>([
  "open",
  "under_review",
  "closed",
  "suspended",
  "cancelled",
]);

const MODALITIES = new Set<Modality>([
  "pregao_eletronico",
  "pregao_presencial",
  "concorrencia",
  "concorrencia_eletronica",
  "dispensa",
  "inexigibilidade",
  "credenciamento",
  "leilao",
  "dialogo_competitivo",
  "other",
]);

type TenderRow = typeof tendersTable.$inferSelect;

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

const asStatus = (value: string): TenderStatus => {
  if (!STATUSES.has(value as TenderStatus)) {
    throw new Error(`Unknown tender status stored in the database: ${value}`);
  }
  return value as TenderStatus;
};

const asModality = (value: string): Modality => {
  if (!MODALITIES.has(value as Modality)) {
    throw new Error(`Unknown tender modality stored in the database: ${value}`);
  }
  return value as Modality;
};

export const searchWhereFor = (
  criteria: SearchCriteria,
  skip?: FacetGroup,
  now = new Date(),
): SQL | undefined => {
  const filters: SQL[] = [];
  const tokens = queryTokens(criteria.query);

  for (const token of tokens)
    filters.push(like(tendersTable.searchText, token));

  if (skip !== "status" && criteria.status.length > 0) {
    filters.push(inArray(tendersTable.status, criteria.status));
  }
  if (skip !== "modality" && criteria.modality.length > 0) {
    filters.push(inArray(tendersTable.modality, criteria.modality));
  }
  if (skip !== "state" && criteria.state.length > 0) {
    filters.push(
      sql`upper(${tendersTable.state}) in (${sql.join(
        criteria.state.map((state) => sql`${state.toUpperCase()}`),
        sql`, `,
      )})`,
    );
  }
  if (skip !== "city" && criteria.city.length > 0) {
    filters.push(
      sql`(
        ${tendersTable.cityIbgeCode} in (${sql.join(
          criteria.city.map((city) => sql`${city}`),
          sql`, `,
        )})
        or ${tendersTable.cityNorm} in (${sql.join(
          criteria.city.map((city) => sql`${normalizeText(city)}`),
          sql`, `,
        )})
      )`,
    );
  }
  if (skip !== "organization" && criteria.organizationId.length > 0) {
    filters.push(inArray(tendersTable.organizationId, criteria.organizationId));
  }
  if (skip !== "source" && criteria.sourceId.length > 0) {
    filters.push(inArray(tendersTable.sourceId, criteria.sourceId));
  }
  if (skip !== "category" && criteria.category.length > 0) {
    filters.push(sql`exists (
      select 1
      from jsonb_array_elements(${tendersTable.categories}) as cat
      where cat->>'slug' in (${sql.join(
        criteria.category.map((slug) => sql`${slug}`),
        sql`, `,
      )})
    )`);
  }
  if (skip !== "platform" && criteria.platform.length > 0) {
    filters.push(inArray(tendersTable.platform, criteria.platform));
  }
  if (skip !== "new" && criteria.newOnly) {
    filters.push(
      sql`${tendersTable.createdAt} > ${newTenderCutoff(now)} and ${tendersTable.createdAt} <= ${now}`,
    );
  }
  if (criteria.serviceRegion?.scope === "custom") {
    const coverage = criteria.serviceRegion;
    const states = [
      ...new Set([
        ...coverage.states,
        ...statesForMacroregions(coverage.regions),
      ]),
    ];
    const municipalityCodes = [
      ...new Set([
        ...coverage.municipalities.map(({ ibgeCode }) => ibgeCode),
        ...(coverage.radius
          ? municipalityCodesWithinRadius(
              coverage.radius.center.ibgeCode,
              coverage.radius.km,
            )
          : []),
      ]),
    ];
    const remoteSlugs = coverage.acceptsRemote
      ? [
          "ti-telecom",
          "consultoria-tecnica",
          "educacao-capacitacao",
          "publicidade-comunicacao",
          "seguros-financeiros",
        ]
      : [];
    filters.push(sql`(
      ${
        states.length
          ? sql`upper(${tendersTable.state}) in (${sql.join(
              states.map((state) => sql`${state}`),
              sql`, `,
            )})`
          : sql`false`
      }
      or ${municipalityCodes.length ? inArray(tendersTable.cityIbgeCode, municipalityCodes) : sql`false`}
      or ${
        remoteSlugs.length
          ? sql`exists (
        select 1 from jsonb_array_elements(${tendersTable.categories}) as cat
        where cat->>'slug' in (${sql.join(
          remoteSlugs.map((slug) => sql`${slug}`),
          sql`, `,
        )})
      )`
          : sql`false`
      }
    )`);
  }
  if (skip !== "valueRange" && criteria.valueMin !== undefined) {
    filters.push(
      sql`${tendersTable.estimatedValue}::float8 >= ${criteria.valueMin}`,
    );
  }
  if (skip !== "valueRange" && criteria.valueMax !== undefined) {
    filters.push(
      sql`${tendersTable.estimatedValue}::float8 <= ${criteria.valueMax}`,
    );
  }
  if (criteria.publishedFrom) {
    filters.push(
      onOrAfterSaoPauloDate(tendersTable.publishedAt, criteria.publishedFrom),
    );
  }
  if (criteria.publishedTo) {
    filters.push(
      onOrBeforeSaoPauloDate(tendersTable.publishedAt, criteria.publishedTo),
    );
  }
  if (criteria.deadlineFrom) {
    filters.push(
      onOrAfterSaoPauloDate(
        tendersTable.proposalDeadline,
        criteria.deadlineFrom,
      ),
    );
  }
  if (criteria.deadlineTo) {
    filters.push(
      onOrBeforeSaoPauloDate(
        tendersTable.proposalDeadline,
        criteria.deadlineTo,
      ),
    );
  }

  return filters.length > 0 ? and(...filters) : undefined;
};

const scoreSql = (tokens: string[]): SQL => {
  const parts = tokens.map((token) => {
    const pattern = likePattern(token);
    return sql`case
      when ${tendersTable.displayTitleNorm} like ${pattern} escape '\\' then 5
      when ${tendersTable.titleNorm} like ${pattern} escape '\\' then 5
      when ${tendersTable.objectNorm} like ${pattern} escape '\\' then 4
      when ${tendersTable.itemsNorm} like ${pattern} escape '\\' then 3
      when ${tendersTable.organizationNorm} like ${pattern} escape '\\' then 2
      when ${tendersTable.otherNorm} like ${pattern} escape '\\' then 1
      else 0
    end`;
  });
  return sql`(${sql.join(parts, sql` + `)})::float8 / ${tokens.length * 5}`;
};

const orderBy = (criteria: SearchCriteria, tokens: string[]): SQL[] => {
  const published = sql`${tendersTable.publishedAt} desc nulls last`;
  const id = asc(tendersTable.id);
  switch (criteria.sort) {
    case "deadline_asc":
      return [sql`${tendersTable.proposalDeadline} asc nulls last`, id];
    case "published_desc":
      return [published, id];
    case "first_seen_desc":
      return [desc(tendersTable.createdAt), id];
    case "value_desc":
      return [sql`${tendersTable.estimatedValue} desc nulls last`, id];
    case "value_asc":
      return [sql`${tendersTable.estimatedValue} asc nulls last`, id];
    case "relevance":
      return tokens.length > 0
        ? [sql`${scoreSql(tokens)} desc`, published, id]
        : [published, id];
  }
};

const countRows = async (where: SQL | undefined): Promise<number> => {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tendersTable)
    .where(where);
  return requireNumber(row?.total ?? 0, "count");
};

const buckets = async (
  value: PgColumn,
  label: SQL<string>,
  where: SQL | undefined,
  limit?: number,
): Promise<FacetBucket[]> => {
  const query = db
    .select({
      value,
      label,
      count: sql<number>`count(*)::int`,
    })
    .from(tendersTable)
    .where(where)
    .groupBy(value, label)
    .orderBy(desc(sql`count(*)`), asc(label))
    .$dynamic();

  const rows = await (limit ? query.limit(limit) : query);
  return rows.flatMap((row) => {
    if (row.value === null || row.label === null) return [];
    return [
      {
        value: String(row.value),
        label: String(row.label),
        count: requireNumber(row.count, "facet count"),
      },
    ];
  });
};

type CombinedFacetRow = {
  status: FacetBucket[];
  modality: FacetBucket[];
  state: FacetBucket[];
  source: FacetBucket[];
  city: FacetBucket[];
  organization: FacetBucket[];
  category: FacetBucket[];
  platform: FacetBucket[];
  estimated_values: number[];
  new_count: number;
  total: number;
};

type CombinedFacetResult = {
  facets: SearchFacets;
  total: number;
};

/**
 * With no selected facet group, disjunctive faceting uses the same filtered
 * tender set for every bucket. Materializing it once avoids repeating the
 * trigram heap scan for every facet while preserving exact counts.
 */
export const canUseCombinedFacets = (criteria: SearchCriteria): boolean =>
  queryTokens(criteria.query).length > 0 &&
  criteria.status.length === 0 &&
  criteria.modality.length === 0 &&
  criteria.state.length === 0 &&
  criteria.city.length === 0 &&
  criteria.organizationId.length === 0 &&
  criteria.sourceId.length === 0 &&
  criteria.category.length === 0 &&
  criteria.platform.length === 0 &&
  !criteria.newOnly &&
  criteria.valueMin === undefined &&
  criteria.valueMax === undefined;

const combinedFacetBuckets = (value: unknown, field: string): FacetBucket[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Expected an array for ${field}`);
  }
  return value.map((bucket) => {
    if (
      typeof bucket !== "object" ||
      bucket === null ||
      !("value" in bucket) ||
      !("label" in bucket) ||
      !("count" in bucket)
    ) {
      throw new Error(`Invalid bucket in ${field}`);
    }
    return {
      value: String(bucket.value),
      label: String(bucket.label),
      count: requireNumber(bucket.count, `${field} count`),
    };
  });
};

export const tenderRowToDetail = (
  row: TenderRow,
  now = new Date(),
): TenderDetail => {
  const items = row.items as TenderItemRecord[];
  const documents = row.documents as TenderDocumentRecord[];
  const timeline = row.timeline as TenderTimelineRecord[];
  const estimatedValue =
    row.estimatedValue === null
      ? null
      : requireNumber(row.estimatedValue, "estimatedValue");
  const rawPayload = row.rawPayload as {
    publication?: Record<string, unknown>;
  };
  const publication = rawPayload.publication ?? rawPayload;

  return {
    id: row.id,
    title: row.title,
    displayTitle: row.displayTitle ?? row.title,
    displayTitleSource: row.displayTitleSource,
    objectSummary:
      row.sourceId === "pncp"
        ? summarizeOfficialObject(row.objectSummary ?? row.title)
        : row.objectSummary,
    organization: { id: row.organizationId, name: row.organizationName },
    purchasingUnit: row.purchasingUnit,
    modality: asModality(row.modality),
    modalityLabel: row.modalityLabel,
    status: asStatus(row.status),
    tenderNumber: row.tenderNumber,
    tenderNumberShort:
      row.sourceId === "pncp" ? pncpTenderNumberShort(publication) : null,
    estimatedValue,
    estimatedValueStatus:
      row.estimatedValueStatus as TenderDetail["estimatedValueStatus"],
    publishedAt: row.publishedAt,
    openingAt: row.openingAt,
    proposalDeadline: row.proposalDeadline,
    location: {
      state: row.state,
      city: row.city,
      cityIbgeCode: row.cityIbgeCode,
    },
    source: { id: row.sourceId, name: row.sourceName, url: row.sourceUrl },
    platform:
      row.platform === null
        ? null
        : {
            slug: row.platform,
            label: row.platformLabel ?? row.platform,
            kind: platformKind(row.platform),
            url: platformUrl(row.platform),
          },
    categories: row.categories,
    relevance: { score: null, highlights: [] },
    updatedAt: row.updatedAt,
    firstSeenAt: row.createdAt,
    isNew: isNewTender(row.createdAt, now),
    description: row.description,
    processNumber: row.processNumber,
    items: items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      estimatedUnitValue: item.estimatedUnitValue,
      estimatedTotalValue: item.estimatedTotalValue,
    })),
    documents: documents.map((document) => ({
      id: document.id,
      name: document.name,
      type: document.type,
      sizeBytes: document.sizeBytes,
      url: document.url,
      publishedAt: document.publishedAt ? new Date(document.publishedAt) : null,
    })),
    timeline: timeline.map((entry) => ({
      at: new Date(entry.at),
      type: entry.type,
      description: entry.description,
    })),
    createdAt: row.createdAt,
    detailsFetchedAt: row.detailsFetchedAt,
  };
};

export class PostgresTenderRepository {
  async search(criteria: SearchCriteria): Promise<SearchResponse> {
    const startedAt = performance.now();
    const now = new Date();
    const tokens = queryTokens(criteria.query);
    const where = searchWhereFor(criteria, undefined, now);
    const rowsQuery = db
      .select()
      .from(tendersTable)
      .where(where)
      .orderBy(...orderBy(criteria, tokens))
      .limit(criteria.pageSize)
      .offset((criteria.page - 1) * criteria.pageSize);
    let total: number;
    let rows: TenderRow[];
    let facets: SearchFacets | null;
    let indexUpdatedAt: Date | null;

    if (criteria.facets && canUseCombinedFacets(criteria)) {
      const [pageRows, combined, updatedAt] = await Promise.all([
        rowsQuery,
        this.combinedFacets(criteria, now),
        this.indexUpdatedAt(),
      ]);
      rows = pageRows;
      total = combined.total;
      facets = combined.facets;
      indexUpdatedAt = updatedAt;
    } else {
      total = await countRows(where);
      rows = await rowsQuery;
      [facets, indexUpdatedAt] = await Promise.all([
        criteria.facets ? this.facets(criteria, now) : Promise.resolve(null),
        this.indexUpdatedAt(),
      ]);
    }

    return {
      data: normalizePageRelevance(
        rows.map((row) =>
          toSummary(tenderRowToDetail(row, now), criteria, tokens),
        ),
      ),
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
        searchMode: "keyword",
        searchModeFallbackReason:
          criteria.mode === "keyword"
            ? null
            : normalizeText(criteria.query ?? "").length < 3
              ? "query_too_short"
              : "not_available",
        tookMs: Number((performance.now() - startedAt).toFixed(3)),
        indexUpdatedAt,
      },
    };
  }

  async findById(id: string): Promise<TenderDetail | undefined> {
    const row = await this.load(id);
    if (!row) return undefined;

    const detail = tenderRowToDetail(row);
    return {
      ...detail,
      relevance: {
        score: null,
        highlights: [],
      },
    };
  }

  async suggestions(
    query: string,
    limit: number,
  ): Promise<SuggestionsResponse> {
    const normalized = normalizeText(query);
    const pattern = likePattern(normalized);
    const [organizations, categories, termCount] = await Promise.all([
      db
        .select({
          value: tendersTable.organizationId,
          label: tendersTable.organizationName,
          count: sql<number>`count(*)::int`,
        })
        .from(tendersTable)
        .where(like(tendersTable.organizationNorm, normalized))
        .groupBy(tendersTable.organizationId, tendersTable.organizationName)
        .orderBy(desc(sql`count(*)`))
        .limit(limit),
      db.execute<{ value: string; label: string; count: number }>(sql`
        select cat->>'slug' as value,
               cat->>'label' as label,
               count(*)::int as count
        from ${tendersTable}
        cross join lateral jsonb_array_elements(${tendersTable.categories}) as cat
        where cat->>'label' is not null
          and lower(cat->>'label') like ${pattern} escape '\\'
        group by 1, 2
        order by count desc
        limit ${limit}
      `),
      countRows(searchWhereFor({ ...emptyCriteria(), query })),
    ]);

    const categoryRows = "rows" in categories ? categories.rows : [];
    const suggestions = [
      ...organizations.map((organization) => ({
        type: "organization" as const,
        value: organization.value,
        label: organization.label,
        count: requireNumber(
          organization.count,
          "organization suggestion count",
        ),
      })),
      ...categoryRows.map((category) => ({
        type: "category" as const,
        value: String(category.value),
        label: String(category.label),
        count: requireNumber(category.count, "category suggestion count"),
      })),
      ...(termCount > 0
        ? [
            {
              type: "term" as const,
              value: query.trim(),
              label: query.trim(),
              count: termCount,
            },
          ]
        : []),
    ]
      .sort((left, right) => (right.count ?? 0) - (left.count ?? 0))
      .slice(0, limit);

    return { suggestions };
  }

  private async load(id: string): Promise<TenderRow | undefined> {
    const [row] = await db
      .select()
      .from(tendersTable)
      .where(eq(tendersTable.id, id))
      .limit(1);
    return row;
  }

  private async indexUpdatedAt(): Promise<Date | null> {
    const [row] = await db
      .select({
        indexUpdatedAt: sql<Date | null>`max(${tendersTable.fetchedAt})`,
      })
      .from(tendersTable);
    return row?.indexUpdatedAt ?? null;
  }

  private async combinedFacets(
    criteria: SearchCriteria,
    now: Date,
  ): Promise<CombinedFacetResult> {
    const where = searchWhereFor(criteria, undefined, now);
    const result = await db.execute<CombinedFacetRow>(sql`
      with matched as materialized (
        select
          ${tendersTable.status} as status,
          ${tendersTable.modality} as modality,
          ${tendersTable.state} as state,
          ${tendersTable.sourceId} as source_id,
          ${tendersTable.sourceName} as source_name,
          ${tendersTable.cityIbgeCode} as city_ibge_code,
          ${tendersTable.city} as city,
          ${tendersTable.organizationId} as organization_id,
          ${tendersTable.organizationName} as organization_name,
          ${tendersTable.categories} as categories,
          ${tendersTable.platform} as platform,
          coalesce(${tendersTable.platformLabel}, ${tendersTable.platform}) as platform_label,
          ${tendersTable.estimatedValue} as estimated_value,
          ${tendersTable.createdAt} as created_at
        from ${tendersTable}
        ${where ? sql`where ${where}` : sql``}
      ),
      status_buckets as (
        select status as value, status as label, count(*)::int as bucket_count
        from matched group by status
      ),
      modality_buckets as (
        select modality as value, modality as label, count(*)::int as bucket_count
        from matched group by modality
      ),
      state_buckets as (
        select state as value, state as label, count(*)::int as bucket_count
        from matched where state is not null group by state
      ),
      source_buckets as (
        select source_id as value, source_name as label, count(*)::int as bucket_count
        from matched group by source_id, source_name
      ),
      city_buckets as (
        select city_ibge_code as value,
               city || '/' || state as label,
               city as sort_label,
               count(*)::int as bucket_count
        from matched
        where city_ibge_code is not null and city is not null and state is not null
        group by city_ibge_code, city, state
        order by count(*) desc, city asc
        limit 30
      ),
      organization_buckets as (
        select organization_id as value,
               organization_name as label,
               count(*)::int as bucket_count
        from matched
        group by organization_id, organization_name
        order by count(*) desc, organization_name asc
        limit 20
      ),
      category_buckets as (
        select cat->>'slug' as value,
               cat->>'label' as label,
               count(*)::int as bucket_count
        from matched
        cross join lateral jsonb_array_elements(categories) as cat
        group by 1, 2
      ),
      platform_buckets as (
        select platform as value, platform_label as label, count(*)::int as bucket_count
        from matched
        where platform is not null and platform_label is not null
        group by platform, platform_label
      )
      select
        coalesce((select jsonb_agg(jsonb_build_object(
          'value', value, 'label', label, 'count', bucket_count
        ) order by bucket_count desc, label asc) from status_buckets), '[]'::jsonb) as status,
        coalesce((select jsonb_agg(jsonb_build_object(
          'value', value, 'label', label, 'count', bucket_count
        ) order by bucket_count desc, label asc) from modality_buckets), '[]'::jsonb) as modality,
        coalesce((select jsonb_agg(jsonb_build_object(
          'value', value, 'label', label, 'count', bucket_count
        ) order by bucket_count desc, label asc) from state_buckets), '[]'::jsonb) as state,
        coalesce((select jsonb_agg(jsonb_build_object(
          'value', value, 'label', label, 'count', bucket_count
        ) order by bucket_count desc, label asc) from source_buckets), '[]'::jsonb) as source,
        coalesce((select jsonb_agg(jsonb_build_object(
          'value', value, 'label', label, 'count', bucket_count
        ) order by bucket_count desc, sort_label asc) from city_buckets), '[]'::jsonb) as city,
        coalesce((select jsonb_agg(jsonb_build_object(
          'value', value, 'label', label, 'count', bucket_count
        ) order by bucket_count desc, label asc) from organization_buckets), '[]'::jsonb) as organization,
        coalesce((select jsonb_agg(jsonb_build_object(
          'value', value, 'label', label, 'count', bucket_count
        ) order by bucket_count desc, label asc) from category_buckets), '[]'::jsonb) as category,
        coalesce((select jsonb_agg(jsonb_build_object(
          'value', value, 'label', label, 'count', bucket_count
        ) order by bucket_count desc, label asc) from platform_buckets), '[]'::jsonb) as platform,
        coalesce((select jsonb_agg(estimated_value::float8)
          from matched where estimated_value::float8 >= 0), '[]'::jsonb) as estimated_values,
        (select count(*)::int from matched
          where created_at > ${newTenderCutoff(now)} and created_at <= ${now}) as new_count,
        (select count(*)::int from matched) as total
    `);
    const rows = "rows" in result ? result.rows : [];
    const row = rows[0];
    if (!row) throw new Error("Combined facet query returned no row");

    const values = nonNegativeValues(
      (Array.isArray(row.estimated_values) ? row.estimated_values : []).map(
        (value) => requireNumber(value, "estimatedValue"),
      ),
    );
    const range = numberRange(values);
    const total = requireNumber(row.total, "combined facet total");

    return {
      total,
      facets: {
        status: combinedFacetBuckets(row.status, "status facet").map(
          (bucket) => ({
            ...bucket,
            label: statusLabels[asStatus(bucket.value)],
          }),
        ),
        modality: combinedFacetBuckets(row.modality, "modality facet").map(
          (bucket) => ({
            ...bucket,
            label: modalityLabels[asModality(bucket.value)],
          }),
        ),
        state: combinedFacetBuckets(row.state, "state facet"),
        source: combinedFacetBuckets(row.source, "source facet"),
        city: combinedFacetBuckets(row.city, "city facet"),
        organization: combinedFacetBuckets(
          row.organization,
          "organization facet",
        ),
        category: combinedFacetBuckets(row.category, "category facet"),
        platform: combinedFacetBuckets(row.platform, "platform facet"),
        groupTotals: {
          status: total,
          modality: total,
          state: total,
          source: total,
          category: total,
          organization: total,
          platform: total,
        },
        valueRange: {
          min: range?.min ?? null,
          max: range?.max ?? null,
          histogram: createValueHistogram(values),
        },
        newCount: requireNumber(row.new_count, "new facet count"),
      },
    };
  }

  private async facets(
    criteria: SearchCriteria,
    now: Date,
  ): Promise<SearchFacets> {
    const [
      status,
      modality,
      state,
      source,
      city,
      organization,
      category,
      platform,
      statusTotal,
      modalityTotal,
      stateTotal,
      sourceTotal,
      categoryTotal,
      organizationTotal,
      platformTotal,
      valueRows,
      newCount,
    ] = await Promise.all([
      buckets(
        tendersTable.status,
        sql<string>`${tendersTable.status}`,
        searchWhereFor(criteria, "status", now),
      ),
      buckets(
        tendersTable.modality,
        sql<string>`${tendersTable.modality}`,
        searchWhereFor(criteria, "modality", now),
      ),
      buckets(
        tendersTable.state,
        sql<string>`${tendersTable.state}`,
        and(
          searchWhereFor(criteria, "state", now),
          sql`${tendersTable.state} is not null`,
        ),
      ),
      buckets(
        tendersTable.sourceId,
        sql<string>`${tendersTable.sourceName}`,
        searchWhereFor(criteria, "source", now),
      ),
      this.cityFacet(criteria, now),
      this.organizationFacet(criteria, now),
      this.categoryFacet(criteria, now),
      buckets(
        tendersTable.platform,
        sql<string>`coalesce(${tendersTable.platformLabel}, ${tendersTable.platform})`,
        searchWhereFor(criteria, "platform", now),
      ),
      countRows(searchWhereFor(criteria, "status", now)),
      countRows(searchWhereFor(criteria, "modality", now)),
      countRows(searchWhereFor(criteria, "state", now)),
      countRows(searchWhereFor(criteria, "source", now)),
      countRows(searchWhereFor(criteria, "category", now)),
      countRows(searchWhereFor(criteria, "organization", now)),
      countRows(searchWhereFor(criteria, "platform", now)),
      db
        .select({ value: tendersTable.estimatedValue })
        .from(tendersTable)
        .where(searchWhereFor(criteria, "valueRange", now)),
      countRows(
        and(
          searchWhereFor(criteria, "new", now),
          sql`${tendersTable.createdAt} > ${newTenderCutoff(now)} and ${tendersTable.createdAt} <= ${now}`,
        ),
      ),
    ]);

    const values = nonNegativeValues(
      valueRows
        .map((row) =>
          row.value === null
            ? null
            : requireNumber(row.value, "estimatedValue"),
        )
        .filter((value): value is number => value !== null),
    );
    const range = numberRange(values);

    return {
      status: status.map((bucket) => ({
        ...bucket,
        label: statusLabels[asStatus(bucket.value)],
      })),
      modality: modality.map((bucket) => ({
        ...bucket,
        label: modalityLabels[asModality(bucket.value)],
      })),
      state: state.filter((bucket) => bucket.value.length > 0),
      source,
      category,
      city,
      organization,
      platform,
      groupTotals: {
        status: statusTotal,
        modality: modalityTotal,
        state: stateTotal,
        source: sourceTotal,
        category: categoryTotal,
        organization: organizationTotal,
        platform: platformTotal,
      },
      valueRange: {
        min: range?.min ?? null,
        max: range?.max ?? null,
        histogram: createValueHistogram(values),
      },
      newCount,
    };
  }

  private async cityFacet(
    criteria: SearchCriteria,
    now: Date,
  ): Promise<FacetBucket[]> {
    const rows = await db
      .select({
        value: tendersTable.cityIbgeCode,
        city: tendersTable.city,
        state: tendersTable.state,
        count: sql<number>`count(*)::int`,
      })
      .from(tendersTable)
      .where(
        and(
          searchWhereFor(criteria, "city", now),
          sql`${tendersTable.cityIbgeCode} is not null`,
          sql`${tendersTable.city} is not null`,
          sql`${tendersTable.state} is not null`,
        ),
      )
      .groupBy(tendersTable.cityIbgeCode, tendersTable.city, tendersTable.state)
      .orderBy(desc(sql`count(*)`), asc(tendersTable.city))
      .limit(30);

    return rows.flatMap((row) => {
      if (!row.value || !row.city || !row.state) return [];
      return [
        {
          value: row.value,
          label: `${row.city}/${row.state}`,
          count: requireNumber(row.count, "city facet count"),
        },
      ];
    });
  }

  private async organizationFacet(
    criteria: SearchCriteria,
    now: Date,
  ): Promise<FacetBucket[]> {
    const where = searchWhereFor(criteria, "organization", now);
    const top = await db
      .select({
        value: tendersTable.organizationId,
        label: tendersTable.organizationName,
        count: sql<number>`count(*)::int`,
      })
      .from(tendersTable)
      .where(where)
      .groupBy(tendersTable.organizationId, tendersTable.organizationName)
      .orderBy(desc(sql`count(*)`), asc(tendersTable.organizationName))
      .limit(20);

    const result: FacetBucket[] = top.map((row) => ({
      value: row.value,
      label: row.label,
      count: requireNumber(row.count, "organization facet count"),
    }));

    for (const organizationId of criteria.organizationId) {
      if (result.some((bucket) => bucket.value === organizationId)) continue;
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tendersTable)
        .where(and(where, eq(tendersTable.organizationId, organizationId)));
      const [nameRow] = await db
        .select({ name: tendersTable.organizationName })
        .from(tendersTable)
        .where(eq(tendersTable.organizationId, organizationId))
        .limit(1);
      result.push({
        value: organizationId,
        label: nameRow?.name ?? organizationId,
        count: requireNumber(
          countRow?.count ?? 0,
          "selected organization count",
        ),
      });
    }

    return result;
  }

  private async categoryFacet(
    criteria: SearchCriteria,
    now: Date,
  ): Promise<FacetBucket[]> {
    const where = searchWhereFor(criteria, "category", now);
    const result = await db.execute<{
      value: string;
      label: string;
      count: number;
    }>(sql`
      select cat->>'slug' as value,
             cat->>'label' as label,
             count(*)::int as count
      from ${tendersTable}
      cross join lateral jsonb_array_elements(${tendersTable.categories}) as cat
      ${where ? sql`where ${where}` : sql``}
      group by 1, 2
      order by count desc, label asc
    `);
    const rows = "rows" in result ? result.rows : [];
    return rows.map((row) => ({
      value: String(row.value),
      label: String(row.label),
      count: requireNumber(row.count, "category facet count"),
    }));
  }
}

const emptyCriteria = (): SearchCriteria => ({
  query: null,
  mode: "keyword",
  status: [],
  modality: [],
  state: [],
  city: [],
  organizationId: [],
  sourceId: [],
  category: [],
  platform: [],
  newOnly: false,
  sort: "relevance",
  page: 1,
  pageSize: 20,
  facets: false,
});
