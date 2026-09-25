import { CULTURAL_INSTALLATIONS } from "../ingest/cultural-installations";
import {
  OPPORTUNITY_PROGRAMS,
  OPPORTUNITY_STATUSES,
  type OpportunityProgram,
  type OpportunityStatus,
} from "../ingest/opportunity-map";
import { InvalidParameterError } from "./api-error";
import { parseDateParameter } from "./sao-paulo-date";

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

const INSTALLATION_IDS = new Set(CULTURAL_INSTALLATIONS.map((installation) => installation.id));

export type OpportunityCriteria = {
  query: string | null;
  state: string[];
  installationId: string[];
  status: OpportunityStatus[];
  program: OpportunityProgram[];
  deadlineFrom?: Date;
  deadlineTo?: Date;
  page: number;
  pageSize: number;
  facets: boolean;
};

const asList = (value: unknown): unknown[] => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

const invalid = (field: string, issue: string, message: string): never => {
  throw new InvalidParameterError(message, [{ field, issue }]);
};

const parseEnumList = <T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
): T[] => {
  const set = new Set<string>(allowed);
  return asList(value).map((item) => {
    if (typeof item !== "string" || !set.has(item)) {
      invalid(field, "invalid_enum", `${field} received an unknown value`);
    }
    return item as T;
  });
};

const parseDate = (field: string, value: unknown): Date | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    return invalid(field, "invalid_date", `${field} must be YYYY-MM-DD`);
  }
  const date = parseDateParameter(value);
  if (!date) return invalid(field, "invalid_date", `${field} must be YYYY-MM-DD`);
  return date;
};

export const parseOpportunityQuery = (raw: unknown): OpportunityCriteria => {
  const query = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = query.q;
  if (text !== undefined && typeof text !== "string") invalid("q", "invalid_type", "q must be a string");

  const state = asList(query.state).map((item) => {
    if (typeof item !== "string" || !UFS.includes(item.toUpperCase())) {
      invalid("state", "invalid_enum", "state must be a two-letter UF");
    }
    return (item as string).toUpperCase();
  });

  const installationId = asList(query.installation).map((item): string => {
    if (typeof item !== "string" || !INSTALLATION_IDS.has(item)) {
      invalid("installation", "invalid_enum", "installation is not a known source");
    }
    return item as string;
  });

  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1) invalid("page", "out_of_range", "page must be an integer >= 1");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    invalid("pageSize", "out_of_range", "pageSize must be between 1 and 100");
  }

  let facets = true;
  if (query.facets === "false" || query.facets === false) facets = false;
  else if (query.facets !== undefined && query.facets !== "true" && query.facets !== true) {
    invalid("facets", "invalid_type", "facets must be true or false");
  }

  const deadlineFrom = parseDate("deadlineFrom", query.deadlineFrom);
  const deadlineTo = parseDate("deadlineTo", query.deadlineTo);
  if (deadlineFrom && deadlineTo && deadlineFrom.getTime() > deadlineTo.getTime()) {
    invalid("deadlineFrom", "invalid_range", "deadlineFrom is after deadlineTo");
  }

  return {
    query: typeof text === "string" && text.trim() !== "" ? text.trim() : null,
    state,
    installationId,
    status: parseEnumList("status", query.status, OPPORTUNITY_STATUSES),
    program: parseEnumList("program", query.program, OPPORTUNITY_PROGRAMS),
    deadlineFrom,
    deadlineTo,
    page,
    pageSize,
    facets,
  };
};
