import type { SearchCriteria } from "../domain/search";
import { parseSearchQuery } from "../lib/query-parser";
import { InvalidParameterError } from "../lib/api-error";

const repeated = new Set([
  "status",
  "modality",
  "state",
  "city",
  "organizationId",
  "sourceId",
  "category",
  "platform",
]);

const allowed = new Set([
  "q",
  "mode",
  ...repeated,
  "valueMin",
  "valueMax",
  "publishedFrom",
  "publishedTo",
  "deadlineFrom",
  "deadlineTo",
  "sort",
  "newOnly",
]);

const appendValues = (
  target: URLSearchParams,
  key: string,
  values: string[],
): void => {
  for (const value of values) target.append(key, value);
};

const dateValue = (value: Date | undefined): string | undefined =>
  value?.toISOString().slice(0, 10);

export const canonicalSearchQuery = (
  raw: unknown,
): { query: string; criteria: SearchCriteria } => {
  if (typeof raw !== "string" || raw.length > 2000) {
    throw new InvalidParameterError("Saved search query is invalid", [
      { field: "query", issue: "invalid_type" },
    ]);
  }
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const parsed: Record<string, unknown> = {};
  for (const key of new Set(params.keys())) {
    if (!allowed.has(key)) {
      if (["page", "pageSize", "view", "facets"].includes(key)) continue;
      throw new InvalidParameterError("Saved search query is invalid", [
        { field: `query.${key}`, issue: "unknown_parameter" },
      ]);
    }
    parsed[key] = repeated.has(key)
      ? params.getAll(key)
      : (params.get(key) ?? undefined);
  }
  parsed.page = 1;
  parsed.pageSize = 20;
  parsed.facets = false;
  const criteria = parseSearchQuery(parsed);
  const canonical = new URLSearchParams();
  if (criteria.query) canonical.set("q", criteria.query);
  if (criteria.mode !== "keyword") canonical.set("mode", criteria.mode);
  appendValues(canonical, "status", criteria.status);
  appendValues(canonical, "modality", criteria.modality);
  appendValues(canonical, "state", criteria.state);
  appendValues(canonical, "city", criteria.city);
  appendValues(canonical, "organizationId", criteria.organizationId);
  appendValues(canonical, "sourceId", criteria.sourceId);
  appendValues(canonical, "category", criteria.category);
  appendValues(canonical, "platform", criteria.platform);
  if (criteria.newOnly) canonical.set("newOnly", "true");
  if (criteria.valueMin !== undefined)
    canonical.set("valueMin", String(criteria.valueMin));
  if (criteria.valueMax !== undefined)
    canonical.set("valueMax", String(criteria.valueMax));
  const dates = [
    ["publishedFrom", dateValue(criteria.publishedFrom)],
    ["publishedTo", dateValue(criteria.publishedTo)],
    ["deadlineFrom", dateValue(criteria.deadlineFrom)],
    ["deadlineTo", dateValue(criteria.deadlineTo)],
  ] as const;
  for (const [key, value] of dates) if (value) canonical.set(key, value);
  if (criteria.sort !== "relevance") canonical.set("sort", criteria.sort);
  return { query: canonical.toString(), criteria };
};
