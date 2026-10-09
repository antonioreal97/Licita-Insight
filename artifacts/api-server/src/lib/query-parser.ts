import {
  GetSearchSuggestionsQueryParams,
  SearchTendersQueryParams,
} from "@workspace/api-zod";
import type { SearchCriteria } from "../domain/search";
import { InvalidParameterError } from "./api-error";
import { parseDateParameter } from "./sao-paulo-date";

const arrayFields = [
  "status",
  "modality",
  "state",
  "city",
  "organizationId",
  "sourceId",
  "category",
  "platform",
] as const;

const dateFields = [
  "publishedFrom",
  "publishedTo",
  "deadlineFrom",
  "deadlineTo",
] as const;

const toRecord = (raw: unknown): Record<string, unknown> =>
  raw !== null && typeof raw === "object"
    ? { ...(raw as Record<string, unknown>) }
    : {};

const validationDetails = (
  issues: readonly { path: (string | number)[]; code: string }[],
) =>
  issues.map((issue) => ({
    field: issue.path.join(".") || "query",
    issue: issue.code,
  }));

const assertRangeOrder = (
  field: string,
  from: number | Date | undefined,
  to: number | Date | undefined,
): void => {
  if (from === undefined || to === undefined) return;
  const fromValue = from instanceof Date ? from.getTime() : from;
  const toValue = to instanceof Date ? to.getTime() : to;
  if (fromValue > toValue) {
    throw new InvalidParameterError(`${field} minimum exceeds maximum`, [
      { field, issue: "invalid_range" },
    ]);
  }
};

export const parseSearchQuery = (raw: unknown): SearchCriteria => {
  const normalized = toRecord(raw);

  for (const field of arrayFields) {
    const value = normalized[field];
    if (value !== undefined && !Array.isArray(value)) {
      normalized[field] = [value];
    }
  }

  for (const field of dateFields) {
    const value = normalized[field];
    if (typeof value === "string") {
      normalized[field] = parseDateParameter(value) ?? new Date(Number.NaN);
    }
  }

  if (normalized.facets === "true") normalized.facets = true;
  if (normalized.facets === "false") normalized.facets = false;

  const result = SearchTendersQueryParams.safeParse(normalized);
  if (!result.success) {
    throw new InvalidParameterError(
      "One or more search parameters are invalid",
      validationDetails(result.error.issues),
    );
  }

  assertRangeOrder("value", result.data.valueMin, result.data.valueMax);
  assertRangeOrder(
    "publicationDate",
    result.data.publishedFrom,
    result.data.publishedTo,
  );
  assertRangeOrder(
    "deadline",
    result.data.deadlineFrom,
    result.data.deadlineTo,
  );

  const query = result.data.q?.trim() || null;
  return {
    query,
    mode: result.data.mode ?? "keyword",
    status: result.data.status ?? [],
    modality: result.data.modality ?? [],
    state: (result.data.state ?? []).map((state) => state.toUpperCase()),
    city: result.data.city ?? [],
    organizationId: result.data.organizationId ?? [],
    sourceId: result.data.sourceId ?? [],
    category: result.data.category ?? [],
    platform: result.data.platform ?? [],
    valueMin: result.data.valueMin,
    valueMax: result.data.valueMax,
    publishedFrom: result.data.publishedFrom,
    publishedTo: result.data.publishedTo,
    deadlineFrom: result.data.deadlineFrom,
    deadlineTo: result.data.deadlineTo,
    sort: result.data.sort ?? "relevance",
    page: result.data.page,
    pageSize: result.data.pageSize,
    facets: result.data.facets,
  };
};

export const parseSuggestionsQuery = (
  raw: unknown,
): { query: string; limit: number } => {
  const result = GetSearchSuggestionsQueryParams.safeParse(toRecord(raw));
  if (!result.success) {
    throw new InvalidParameterError(
      "Suggestion parameters are invalid",
      validationDetails(result.error.issues),
    );
  }

  const query = result.data.q.trim();
  if (query.length < 2) {
    throw new InvalidParameterError(
      "Suggestion query must contain at least two characters",
      [{ field: "q", issue: "too_small" }],
    );
  }

  return { query, limit: result.data.limit };
};
