import { CULTURAL_INSTALLATIONS } from "../ingest/cultural-installations";
import {
  OPPORTUNITY_AREAS,
  type OpportunityArea,
} from "../ingest/opportunity-areas";
import {
  OPPORTUNITY_PROGRAMS,
  OPPORTUNITY_STATUSES,
  type OpportunityProgram,
  type OpportunityStatus,
} from "../ingest/opportunity-map";
import {
  INTERNATIONAL_REGIONS,
  type InternationalRegion,
} from "../ingest/international-countries";
import { InvalidParameterError } from "./api-error";
import { assertWithinResultWindow } from "./result-window";
import { parseDateParameter } from "./sao-paulo-date";
import type {
  BrazilEligibility,
  OpportunityKind,
  OpportunitySource,
} from "@workspace/db";

export const OPPORTUNITY_KINDS = [
  "culture",
  "funding",
  "innovation",
  "partnership",
  "procurement",
] as const satisfies readonly OpportunityKind[];
export const OPPORTUNITY_SOURCES = [
  "mapas",
  "finep",
  "cnpq",
  "capes",
  "transferegov",
  "funarte",
  "minc",
  "salic",
  "worldbank",
  "eu_ft",
  "idb",
  "fap",
] as const satisfies readonly OpportunitySource[];
/** `national` is the default, so a client that never heard of international calls keeps its results. */
export const OPPORTUNITY_SCOPES = ["national", "international", "all"] as const;
export type OpportunityScopeFilter = (typeof OPPORTUNITY_SCOPES)[number];
export const BRAZIL_ELIGIBILITIES = [
  "yes",
  "conditional",
  "no",
  "unknown",
] as const satisfies readonly BrazilEligibility[];

const UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
];

const INSTALLATION_IDS = new Set(
  CULTURAL_INSTALLATIONS.map((installation) => installation.id),
);

export type OpportunityCriteria = {
  query: string | null;
  state: string[];
  installationId: string[];
  kind: OpportunityKind[];
  source: OpportunitySource[];
  status: OpportunityStatus[];
  program: OpportunityProgram[];
  area: OpportunityArea[];
  /** Municipality names, exactly as stored. Pair with `state` to tell homonyms apart. */
  city: string[];
  /** Publishing institution names, exactly as stored. */
  organization: string[];
  scope: OpportunityScopeFilter;
  /** Funding body names, exactly as stored ("Banco Mundial"). International calls only. */
  agency: string[];
  region: InternationalRegion[];
  /** ISO 3166-1 alpha-2 codes of the country where the call is executed. */
  country: string[];
  /** BCP 47 language codes of the notice. */
  language: string[];
  /** Type of the call at the source ("Bens", "Obras", "Consultoria", "Subvenção"…), exactly as stored. */
  opportunityType: string[];
  /** Whether an entity from Brazil can take part. */
  eligibility: BrazilEligibility[];
  /** Whether the funder pays a participant from Brazil. */
  funding: BrazilEligibility[];
  deadlineFrom?: Date;
  deadlineTo?: Date;
  /** Also return listings published by a person with no sign of a public call. Off unless asked. */
  includeIndividual: boolean;
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

const MAX_NAME_FILTERS = 20;
const MAX_NAME_LENGTH = 200;

/** Free-text equality filters (`city`, `organization`): bounded so a request cannot grow the query at will. */
const parseNameList = (field: string, value: unknown): string[] => {
  const items = asList(value);
  if (items.length > MAX_NAME_FILTERS) {
    invalid(
      field,
      "out_of_range",
      `${field} accepts at most ${MAX_NAME_FILTERS} values`,
    );
  }
  return items.map((item) => {
    if (
      typeof item !== "string" ||
      item.trim() === "" ||
      item.length > MAX_NAME_LENGTH
    ) {
      invalid(field, "invalid_type", `${field} must be a non-empty name`);
    }
    return (item as string).trim();
  });
};

const parseCodeList = (
  field: string,
  value: unknown,
  pattern: RegExp,
  normalize: (code: string) => string,
): string[] => {
  const items = asList(value);
  if (items.length > MAX_NAME_FILTERS) {
    invalid(
      field,
      "out_of_range",
      `${field} accepts at most ${MAX_NAME_FILTERS} values`,
    );
  }
  return items.map((item) => {
    if (typeof item !== "string" || !pattern.test(item)) {
      invalid(field, "invalid_enum", `${field} received an unknown value`);
    }
    return normalize(item as string);
  });
};

const parseDate = (field: string, value: unknown): Date | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    return invalid(field, "invalid_date", `${field} must be YYYY-MM-DD`);
  }
  const date = parseDateParameter(value);
  if (!date)
    return invalid(field, "invalid_date", `${field} must be YYYY-MM-DD`);
  return date;
};

const parseFlag = (
  field: string,
  value: unknown,
  fallback: boolean,
): boolean => {
  if (value === undefined) return fallback;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return invalid(field, "invalid_type", `${field} must be true or false`);
};

export const parseOpportunityQuery = (raw: unknown): OpportunityCriteria => {
  const query =
    raw !== null && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  const text = query.q;
  if (text !== undefined && typeof text !== "string")
    invalid("q", "invalid_type", "q must be a string");

  const state = asList(query.state).map((item) => {
    if (typeof item !== "string" || !UFS.includes(item.toUpperCase())) {
      invalid("state", "invalid_enum", "state must be a two-letter UF");
    }
    return (item as string).toUpperCase();
  });

  const installationId = asList(query.installation).map((item): string => {
    if (typeof item !== "string" || !INSTALLATION_IDS.has(item)) {
      invalid(
        "installation",
        "invalid_enum",
        "installation is not a known source",
      );
    }
    return item as string;
  });

  const scope =
    query.scope === undefined
      ? "national"
      : parseEnumList("scope", query.scope, OPPORTUNITY_SCOPES)[0];
  if (scope === undefined || asList(query.scope).length > 1)
    invalid("scope", "invalid_enum", "scope accepts a single value");

  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isInteger(page) || page < 1)
    invalid("page", "out_of_range", "page must be an integer >= 1");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    invalid("pageSize", "out_of_range", "pageSize must be between 1 and 100");
  }
  assertWithinResultWindow(page, pageSize);

  const facets = parseFlag("facets", query.facets, true);
  const includeIndividual = parseFlag(
    "includeIndividual",
    query.includeIndividual,
    false,
  );

  const deadlineFrom = parseDate("deadlineFrom", query.deadlineFrom);
  const deadlineTo = parseDate("deadlineTo", query.deadlineTo);
  if (
    deadlineFrom &&
    deadlineTo &&
    deadlineFrom.getTime() > deadlineTo.getTime()
  ) {
    invalid(
      "deadlineFrom",
      "invalid_range",
      "deadlineFrom is after deadlineTo",
    );
  }

  return {
    query: typeof text === "string" && text.trim() !== "" ? text.trim() : null,
    state,
    installationId,
    kind: parseEnumList("kind", query.kind, OPPORTUNITY_KINDS),
    source: parseEnumList("source", query.source, OPPORTUNITY_SOURCES),
    status: parseEnumList("status", query.status, OPPORTUNITY_STATUSES),
    program: parseEnumList("program", query.program, OPPORTUNITY_PROGRAMS),
    area: parseEnumList("area", query.area, OPPORTUNITY_AREAS),
    city: parseNameList("city", query.city),
    organization: parseNameList("organization", query.organization),
    scope: scope as OpportunityScopeFilter,
    agency: parseNameList("agency", query.agency),
    region: parseEnumList("region", query.region, INTERNATIONAL_REGIONS),
    country: parseCodeList("country", query.country, /^[A-Za-z]{2}$/, (code) =>
      code.toUpperCase(),
    ),
    language: parseCodeList(
      "language",
      query.language,
      /^[A-Za-z]{2}$/,
      (code) => code.toLowerCase(),
    ),
    opportunityType: parseNameList("opportunityType", query.opportunityType),
    eligibility: parseEnumList(
      "eligibility",
      query.eligibility,
      BRAZIL_ELIGIBILITIES,
    ),
    funding: parseEnumList("funding", query.funding, BRAZIL_ELIGIBILITIES),
    deadlineFrom,
    deadlineTo,
    includeIndividual,
    page,
    pageSize,
    facets,
  };
};
