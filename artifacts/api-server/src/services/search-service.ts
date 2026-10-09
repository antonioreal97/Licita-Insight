import type {
  FacetBucket,
  Modality,
  SearchFacets,
  SearchResponse,
  Suggestion,
  SuggestionsResponse,
  TenderDetail,
  TenderStatus,
  TenderSummary,
} from "@workspace/api-zod";
import type {
  FacetGroup,
  SearchCriteria,
  TenderRepository,
} from "../domain/search";
import { normalizeText, queryTokens } from "../domain/normalize";
import {
  dateInSaoPaulo,
  dateParameterValue,
} from "../lib/sao-paulo-date";
import { isNewTender, type Clock } from "../domain/new-tender";

export const statusLabels: Record<TenderStatus, string> = {
  open: "Aberto",
  under_review: "Em análise",
  closed: "Encerrado",
  suspended: "Suspenso",
  cancelled: "Revogado",
};

export const modalityLabels: Record<Modality, string> = {
  pregao_eletronico: "Pregão eletrônico",
  pregao_presencial: "Pregão presencial",
  concorrencia: "Concorrência",
  concorrencia_eletronica: "Concorrência eletrônica",
  dispensa: "Dispensa",
  inexigibilidade: "Inexigibilidade",
  credenciamento: "Credenciamento",
  leilao: "Leilão",
  dialogo_competitivo: "Diálogo competitivo",
  other: "Outra",
};

const tenderSearchFields = (tender: TenderDetail) => ({
  title: normalizeText(`${tender.displayTitle} ${tender.title}`),
  objectSummary: normalizeText(tender.objectSummary ?? ""),
  items: normalizeText(tender.items.map((item) => item.description).join(" ")),
  organization: normalizeText(tender.organization.name),
  other: normalizeText(
    [
      tender.purchasingUnit,
      tender.location.city,
      tender.location.state,
      tender.modalityLabel,
      ...tender.categories.map((category) => category.label),
    ]
      .filter(Boolean)
      .join(" "),
  ),
});

export const calculateScore = (tender: TenderDetail, tokens: string[]): number => {
  if (tokens.length === 0) return 0;

  const fields = tenderSearchFields(tender);
  const score = tokens.reduce((total, token) => {
    if (fields.title.includes(token)) return total + 5;
    if (fields.objectSummary.includes(token)) return total + 4;
    if (fields.items.includes(token)) return total + 3;
    if (fields.organization.includes(token)) return total + 2;
    if (fields.other.includes(token)) return total + 1;
    return total;
  }, 0);

  return Number(Math.min(1, score / (tokens.length * 5)).toFixed(4));
};

const matchesQuery = (tender: TenderDetail, tokens: string[]): boolean => {
  if (tokens.length === 0) return true;
  const searchable = Object.values(tenderSearchFields(tender)).join(" ");
  return tokens.every((token) => searchable.includes(token));
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlight = (value: string, rawQuery: string): string | null => {
  const terms = [...new Set(rawQuery.trim().split(/\s+/).filter(Boolean))];
  if (terms.length === 0) return null;

  const escapedValue = escapeHtml(value);
  const escapedTerms = terms.map(escapeHtml).map(escapeRegExp);
  const pattern = new RegExp(`(${escapedTerms.join("|")})`, "giu");
  if (!pattern.test(escapedValue)) return null;
  pattern.lastIndex = 0;
  return escapedValue.replace(pattern, "<mark>$1</mark>");
};

export const createHighlights = (
  tender: TenderDetail,
  query: string | null,
): TenderSummary["relevance"]["highlights"] => {
  if (!query) return [];

  const candidates = [
    { field: "title" as const, value: tender.displayTitle },
    ...(tender.displayTitle === tender.title
      ? []
      : [{ field: "title" as const, value: tender.title }]),
    { field: "objectSummary" as const, value: tender.objectSummary },
    {
      field: "items" as const,
      value: tender.items.map((item) => item.description).join("; "),
    },
  ];

  return candidates.flatMap(({ field, value }) => {
    if (!value) return [];
    const fragment = highlight(value, query);
    return fragment ? [{ field, fragments: [fragment] }] : [];
  });
};

const includesNormalized = (
  values: string[],
  candidate: string | null,
): boolean =>
  candidate !== null &&
  values.some((value) => normalizeText(value) === normalizeText(candidate));

const applyFilters = (
  tenders: readonly TenderDetail[],
  criteria: SearchCriteria,
  skippedFacet?: FacetGroup,
  now = new Date(),
): TenderDetail[] => {
  const tokens = queryTokens(criteria.query);

  return tenders.filter((tender) => {
    if (!matchesQuery(tender, tokens)) return false;
    if (
      skippedFacet !== "new" &&
      criteria.newOnly &&
      !isNewTender(tender.createdAt, now)
    ) {
      return false;
    }
    if (
      skippedFacet !== "status" &&
      criteria.status.length > 0 &&
      !criteria.status.includes(tender.status)
    ) {
      return false;
    }
    if (
      skippedFacet !== "modality" &&
      criteria.modality.length > 0 &&
      !criteria.modality.includes(tender.modality)
    ) {
      return false;
    }
    if (
      skippedFacet !== "state" &&
      criteria.state.length > 0 &&
      !includesNormalized(criteria.state, tender.location.state)
    ) {
      return false;
    }
    if (
      skippedFacet !== "city" &&
      criteria.city.length > 0 &&
      !criteria.city.some(
        (city) =>
          normalizeText(city) === normalizeText(tender.location.city ?? "") ||
          city === tender.location.cityIbgeCode,
      )
    ) {
      return false;
    }
    if (
      skippedFacet !== "organization" &&
      criteria.organizationId.length > 0 &&
      !criteria.organizationId.includes(tender.organization.id)
    ) {
      return false;
    }
    if (
      skippedFacet !== "source" &&
      criteria.sourceId.length > 0 &&
      !criteria.sourceId.includes(tender.source.id)
    ) {
      return false;
    }
    if (
      skippedFacet !== "category" &&
      criteria.category.length > 0 &&
      !criteria.category.some((slug) =>
        tender.categories.some((category) => category.slug === slug),
      )
    ) {
      return false;
    }
    if (
      skippedFacet !== "platform" &&
      criteria.platform.length > 0 &&
      (tender.platform === null || !criteria.platform.includes(tender.platform.slug))
    ) {
      return false;
    }
    if (skippedFacet !== "valueRange") {
      if (
        criteria.valueMin !== undefined &&
        (tender.estimatedValue === null ||
          tender.estimatedValue < criteria.valueMin)
      ) {
        return false;
      }
      if (
        criteria.valueMax !== undefined &&
        (tender.estimatedValue === null ||
          tender.estimatedValue > criteria.valueMax)
      ) {
        return false;
      }
    }
    if (
      criteria.publishedFrom &&
      (!tender.publishedAt ||
        dateInSaoPaulo(tender.publishedAt) <
          dateParameterValue(criteria.publishedFrom))
    ) {
      return false;
    }
    if (
      criteria.publishedTo &&
      (!tender.publishedAt ||
        dateInSaoPaulo(tender.publishedAt) >
          dateParameterValue(criteria.publishedTo))
    ) {
      return false;
    }
    if (
      criteria.deadlineFrom &&
      (!tender.proposalDeadline ||
        dateInSaoPaulo(tender.proposalDeadline) <
          dateParameterValue(criteria.deadlineFrom))
    ) {
      return false;
    }
    if (
      criteria.deadlineTo &&
      (!tender.proposalDeadline ||
        dateInSaoPaulo(tender.proposalDeadline) >
          dateParameterValue(criteria.deadlineTo))
    ) {
      return false;
    }
    return true;
  });
};

const countBuckets = (
  values: { value: string; label: string }[],
): FacetBucket[] => {
  const counts = new Map<string, { label: string; count: number }>();
  for (const { value, label } of values) {
    const current = counts.get(value);
    counts.set(value, { label, count: (current?.count ?? 0) + 1 });
  }

  return [...counts.entries()]
    .map(([value, item]) => ({ value, label: item.label, count: item.count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    );
};

export const createValueHistogram = (
  values: number[],
): NonNullable<SearchFacets["valueRange"]["histogram"]> => {
  const histogramValues = nonNegativeValues(values);
  const range = numberRange(histogramValues);
  if (!range) return [];

  const { min, max } = range;
  if (min === max) return [{ from: min, to: max, count: histogramValues.length }];

  const bucketCount = Math.min(
    12,
    Math.max(1, Math.ceil(Math.sqrt(histogramValues.length))),
  );
  const logMin = Math.log1p(min);
  const logMax = Math.log1p(max);
  const width = (logMax - logMin) / bucketCount;
  const counts = Array.from({ length: bucketCount }, () => 0);

  for (const value of histogramValues) {
    const index = Math.min(
      bucketCount - 1,
      Math.floor((Math.log1p(value) - logMin) / width),
    );
    counts[index] = (counts[index] ?? 0) + 1;
  }

  const roundMoney = (value: number): number => Number(value.toFixed(2));
  return counts.map((count, index) => ({
    from: index === 0 ? min : roundMoney(Math.expm1(logMin + width * index)),
    to:
      index === bucketCount - 1
        ? max
        : roundMoney(Math.expm1(logMin + width * (index + 1))),
    count,
  }));
};

export const numberRange = (
  values: readonly number[],
): { min: number; max: number } | null => {
  let min = Infinity;
  let max = -Infinity;

  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return min === Infinity ? null : { min, max };
};

export const nonNegativeValues = (values: readonly number[]): number[] =>
  values.filter((value) => Number.isFinite(value) && value >= 0);

const includeSelectedOrganizations = (
  topBuckets: FacetBucket[],
  allBuckets: FacetBucket[],
  selectedOrganizationIds: string[],
  tenders: readonly TenderDetail[],
): FacetBucket[] => {
  const result = [...topBuckets];
  const allBucketById = new Map(
    allBuckets.map((bucket) => [bucket.value, bucket]),
  );
  const labelsById = new Map(
    tenders.map((tender) => [tender.organization.id, tender.organization.name]),
  );

  for (const organizationId of selectedOrganizationIds) {
    if (result.some((bucket) => bucket.value === organizationId)) continue;
    result.push(
      allBucketById.get(organizationId) ?? {
        value: organizationId,
        label: labelsById.get(organizationId) ?? organizationId,
        count: 0,
      },
    );
  }

  return result;
};

const createFacets = (
  tenders: readonly TenderDetail[],
  criteria: SearchCriteria,
  now: Date,
): SearchFacets => {
  const byStatus = applyFilters(tenders, criteria, "status", now);
  const byModality = applyFilters(tenders, criteria, "modality", now);
  const byState = applyFilters(tenders, criteria, "state", now);
  const byCity = applyFilters(tenders, criteria, "city", now);
  const bySource = applyFilters(tenders, criteria, "source", now);
  const byCategory = applyFilters(tenders, criteria, "category", now);
  const byOrganization = applyFilters(tenders, criteria, "organization", now);
  const byPlatform = applyFilters(tenders, criteria, "platform", now);
  const byNew = applyFilters(tenders, criteria, "new", now);
  const byValue = applyFilters(tenders, criteria, "valueRange", now)
    .map((tender) => tender.estimatedValue)
    .filter((value): value is number => value !== null && value >= 0);
  const valueRange = numberRange(byValue);
  const allOrganizationBuckets = countBuckets(
    byOrganization.map((tender) => ({
      value: tender.organization.id,
      label: tender.organization.name,
    })),
  );

  return {
    status: countBuckets(
      byStatus.map((tender) => ({
        value: tender.status,
        label: statusLabels[tender.status],
      })),
    ),
    modality: countBuckets(
      byModality.map((tender) => ({
        value: tender.modality,
        label: modalityLabels[tender.modality],
      })),
    ),
    state: countBuckets(
      byState
        .filter((tender) => tender.location.state !== null)
        .map((tender) => ({
          value: tender.location.state!,
          label: tender.location.state!,
        })),
    ),
    source: countBuckets(
      bySource.map((tender) => ({
        value: tender.source.id,
        label: tender.source.name,
      })),
    ),
    category: countBuckets(
      byCategory.flatMap((tender) =>
        tender.categories.map((category) => ({
          value: category.slug,
          label: category.label,
        })),
      ),
    ),
    city: countBuckets(
      byCity
        .filter(
          (tender) =>
            tender.location.cityIbgeCode !== null &&
            tender.location.city !== null &&
            tender.location.state !== null,
        )
        .map((tender) => ({
          value: tender.location.cityIbgeCode!,
          label: `${tender.location.city!}/${tender.location.state!}`,
        })),
    ).slice(0, 30),
    organization: includeSelectedOrganizations(
      allOrganizationBuckets.slice(0, 20),
      allOrganizationBuckets,
      criteria.organizationId,
      tenders,
    ),
    platform: countBuckets(
      byPlatform.flatMap((tender) =>
        tender.platform
          ? [{ value: tender.platform.slug, label: tender.platform.label }]
          : [],
      ),
    ),
    groupTotals: {
      status: byStatus.length,
      modality: byModality.length,
      state: byState.length,
      source: bySource.length,
      category: byCategory.length,
      organization: byOrganization.length,
      platform: byPlatform.length,
    },
    valueRange: {
      min: valueRange?.min ?? null,
      max: valueRange?.max ?? null,
      histogram: createValueHistogram(byValue),
    },
    newCount: byNew.filter((tender) => isNewTender(tender.createdAt, now)).length,
  };
};

const compareNullableNumbers = (
  left: number | null,
  right: number | null,
  direction: "asc" | "desc",
): number => {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return direction === "asc" ? left - right : right - left;
};

const compareNullableDates = (
  left: Date | null,
  right: Date | null,
  direction: "asc" | "desc",
): number =>
  compareNullableNumbers(
    left?.getTime() ?? null,
    right?.getTime() ?? null,
    direction,
  );

export const toSummary = (
  tender: TenderDetail,
  criteria: SearchCriteria,
  tokens: string[],
  now = new Date(),
): TenderSummary => {
  const {
    description: _description,
    processNumber: _processNumber,
    items: _items,
    documents: _documents,
    timeline: _timeline,
    createdAt: _createdAt,
    ...summary
  } = tender;

  const usesRelevance = criteria.sort === "relevance" && tokens.length > 0;
  return {
    ...summary,
    firstSeenAt: tender.createdAt,
    isNew: isNewTender(tender.createdAt, now),
    relevance: {
      score: usesRelevance ? calculateScore(tender, tokens) : null,
      highlights: usesRelevance ? createHighlights(tender, criteria.query) : [],
    },
  };
};

export const normalizePageRelevance = (
  summaries: TenderSummary[],
): TenderSummary[] => {
  const scores = summaries
    .map((summary) => summary.relevance.score)
    .filter((score): score is number => score !== null);
  if (scores.length === 0) return summaries;

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const hasDiscrimination = max - min > Number.EPSILON;

  return summaries.map((summary) => {
    const score = summary.relevance.score;
    return {
      ...summary,
      relevance: {
        ...summary.relevance,
        score:
          score === null || !hasDiscrimination
            ? null
            : Number(((score - min) / (max - min)).toFixed(4)),
      },
    };
  });
};

export class SearchService {
  constructor(
    private readonly repository: TenderRepository,
    private readonly clock: Clock = () => new Date(),
  ) {}

  search(criteria: SearchCriteria): SearchResponse {
    const startedAt = performance.now();
    const now = this.clock();
    const tokens = queryTokens(criteria.query);
    const filtered = applyFilters(this.repository.findAll(), criteria, undefined, now);
    const summaries = filtered.map((tender) =>
      toSummary(tender, criteria, tokens, now),
    );

    summaries.sort((left, right) => {
      switch (criteria.sort) {
        case "deadline_asc":
          return compareNullableDates(
            left.proposalDeadline,
            right.proposalDeadline,
            "asc",
          );
        case "published_desc":
          return compareNullableDates(
            left.publishedAt,
            right.publishedAt,
            "desc",
          );
        case "first_seen_desc":
          return right.firstSeenAt.getTime() - left.firstSeenAt.getTime();
        case "value_desc":
          return compareNullableNumbers(
            left.estimatedValue,
            right.estimatedValue,
            "desc",
          );
        case "value_asc":
          return compareNullableNumbers(
            left.estimatedValue,
            right.estimatedValue,
            "asc",
          );
        case "relevance":
          return tokens.length > 0
            ? (right.relevance.score ?? 0) - (left.relevance.score ?? 0) ||
                compareNullableDates(
                  left.publishedAt,
                  right.publishedAt,
                  "desc",
                )
            : compareNullableDates(left.publishedAt, right.publishedAt, "desc");
      }
    });

    const total = summaries.length;
    const offset = (criteria.page - 1) * criteria.pageSize;

    return {
      data: normalizePageRelevance(
        summaries.slice(offset, offset + criteria.pageSize),
      ),
      pagination: {
        page: criteria.page,
        pageSize: criteria.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / criteria.pageSize),
        totalIsEstimate: false,
      },
      facets: criteria.facets
        ? createFacets(this.repository.findAll(), criteria, now)
        : null,
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
        indexUpdatedAt: this.repository.getIndexUpdatedAt(),
      },
    };
  }

  findById(id: string): TenderDetail | undefined {
    return this.repository.findById(id);
  }

  suggestions(query: string, limit: number): SuggestionsResponse {
    const normalizedQuery = normalizeText(query);
    const tenders = this.repository.findAll();
    const candidates: Suggestion[] = [];

    for (const organization of countBuckets(
      tenders.map((tender) => ({
        value: tender.organization.id,
        label: tender.organization.name,
      })),
    )) {
      if (normalizeText(organization.label).includes(normalizedQuery)) {
        candidates.push({
          type: "organization",
          value: organization.value,
          label: organization.label,
          count: organization.count,
        });
      }
    }

    for (const category of countBuckets(
      tenders.flatMap((tender) =>
        tender.categories.map((item) => ({
          value: item.slug,
          label: item.label,
        })),
      ),
    )) {
      if (normalizeText(category.label).includes(normalizedQuery)) {
        candidates.push({
          type: "category",
          value: category.value,
          label: category.label,
          count: category.count,
        });
      }
    }

    const matchingTermCount = tenders.filter((tender) =>
      matchesQuery(tender, queryTokens(query)),
    ).length;
    if (matchingTermCount > 0) {
      candidates.push({
        type: "term",
        value: query.trim(),
        label: query.trim(),
        count: matchingTermCount,
      });
    }

    return {
      suggestions: candidates
        .sort((left, right) => (right.count ?? 0) - (left.count ?? 0))
        .slice(0, limit),
    };
  }
}
