import { InvalidParameterError } from "./api-error";
import { parseDateParameter } from "./sao-paulo-date";

const SORTS = ["published_desc", "published_asc", "value_desc", "value_asc"] as const;
const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));

export type TransparencyCriteria = {
  query: string | null;
  state: string | null;
  publishedFrom?: Date;
  publishedTo?: Date;
  valueMin?: number;
  valueMax?: number;
  page: number;
  pageSize: number;
  sort: (typeof SORTS)[number];
};

const invalid = (field: string, issue: string, message: string): never => {
  throw new InvalidParameterError(message, [{ field, issue }]);
};

const scalar = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return invalid(field, "invalid_type", `${field} must be a string`);
  return value.trim();
};

const optionalMoney = (value: unknown, field: string): number | undefined => {
  const text = scalar(value, field);
  if (text === undefined) return undefined;
  const number = Number(text);
  if (!text || !Number.isFinite(number) || number < 0 || number > 1e15) {
    return invalid(field, "out_of_range", `${field} must be a non-negative value`);
  }
  return number;
};

const optionalDate = (value: unknown, field: string): Date | undefined => {
  const text = scalar(value, field);
  if (text === undefined) return undefined;
  return parseDateParameter(text) ?? invalid(field, "invalid_date", `${field} must be YYYY-MM-DD`);
};

export function parseTransparencyQuery(raw: unknown): TransparencyCriteria {
  const query = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const q = scalar(query.q, "q");
  if (q && q.length > 160) invalid("q", "out_of_range", "q is too long");
  const state = scalar(query.state, "state")?.toUpperCase();
  if (state && !UFS.has(state)) invalid("state", "invalid_enum", "state must be a Brazilian UF");
  const publishedFrom = optionalDate(query.publishedFrom, "publishedFrom");
  const publishedTo = optionalDate(query.publishedTo, "publishedTo");
  if (publishedFrom && publishedTo && publishedFrom > publishedTo) {
    invalid("publishedFrom", "invalid_range", "publishedFrom is after publishedTo");
  }
  const valueMin = optionalMoney(query.valueMin, "valueMin");
  const valueMax = optionalMoney(query.valueMax, "valueMax");
  if (valueMin !== undefined && valueMax !== undefined && valueMin > valueMax) {
    invalid("valueMin", "invalid_range", "valueMin is greater than valueMax");
  }
  const page = query.page === undefined ? 1 : Number(scalar(query.page, "page"));
  const pageSize = query.pageSize === undefined ? 12 : Number(scalar(query.pageSize, "pageSize"));
  if (!Number.isSafeInteger(page) || page < 1) invalid("page", "out_of_range", "page must be >= 1");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    invalid("pageSize", "out_of_range", "pageSize must be between 1 and 50");
  }
  const sort = scalar(query.sort, "sort") ?? "published_desc";
  if (!SORTS.includes(sort as TransparencyCriteria["sort"])) {
    invalid("sort", "invalid_enum", "sort is not supported");
  }
  return {
    query: q || null,
    state: state || null,
    publishedFrom,
    publishedTo,
    valueMin,
    valueMax,
    page,
    pageSize,
    sort: sort as TransparencyCriteria["sort"],
  };
}
