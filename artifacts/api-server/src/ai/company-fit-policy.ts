import { InvalidParameterError } from "../lib/api-error";

export type CompanySize = "me_epp" | "cooperative" | "other";
export type CompanyProfileInput = {
  description: string;
  offerings: string[];
  exclusions: string[];
  coverage: { scope: "national" } | { scope: "states"; states: string[] };
  valueRange: { min: number | null; max: number | null };
  size: CompanySize;
};

const UFS = new Set([
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
]);

const normalized = (value: string): string =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ");
const duplicateKey = (value: string): string =>
  normalized(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
const fieldError = (field: string, issue: string): InvalidParameterError =>
  new InvalidParameterError(`${field} is invalid`, [{ field, issue }]);

const terms = (value: unknown, field: string, minimum: number): string[] => {
  if (!Array.isArray(value) || value.length < minimum || value.length > 20)
    throw fieldError(field, "invalid_length");
  const result = value.map((term, index) => {
    if (typeof term !== "string")
      throw fieldError(`${field}.${index}`, "invalid_type");
    const parsed = normalized(term);
    if (parsed.length < 2 || parsed.length > 80)
      throw fieldError(`${field}.${index}`, "invalid_length");
    return parsed;
  });
  if (new Set(result.map(duplicateKey)).size !== result.length)
    throw fieldError(field, "duplicate");
  return result;
};

const money = (value: unknown, field: string): number | null => {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw fieldError(field, "invalid_value");
  return Math.round(value * 100) / 100;
};

export function parseCompanyProfileInput(value: unknown): CompanyProfileInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw fieldError("body", "invalid_type");
  const body = value as Record<string, unknown>;
  if (typeof body.description !== "string")
    throw fieldError("description", "invalid_type");
  const description = normalized(body.description);
  if (description.length < 20 || description.length > 600)
    throw fieldError("description", "invalid_length");
  const offerings = terms(body.offerings, "offerings", 1);
  const exclusions = terms(body.exclusions, "exclusions", 0);
  if (
    !body.coverage ||
    typeof body.coverage !== "object" ||
    Array.isArray(body.coverage)
  )
    throw fieldError("coverage", "invalid_type");
  const coverageInput = body.coverage as Record<string, unknown>;
  let coverage: CompanyProfileInput["coverage"];
  if (coverageInput.scope === "national") coverage = { scope: "national" };
  else if (coverageInput.scope === "states") {
    if (
      !Array.isArray(coverageInput.states) ||
      coverageInput.states.length < 1 ||
      coverageInput.states.length > 27
    )
      throw fieldError("coverage.states", "invalid_length");
    const states = coverageInput.states.map((state) =>
      typeof state === "string" ? state.trim().toUpperCase() : "",
    );
    if (
      states.some((state) => !UFS.has(state)) ||
      new Set(states).size !== states.length
    )
      throw fieldError("coverage.states", "invalid_value");
    coverage = { scope: "states", states };
  } else throw fieldError("coverage.scope", "invalid_enum");
  if (
    !body.valueRange ||
    typeof body.valueRange !== "object" ||
    Array.isArray(body.valueRange)
  )
    throw fieldError("valueRange", "invalid_type");
  const range = body.valueRange as Record<string, unknown>;
  const min = money(range.min, "valueRange.min");
  const max = money(range.max, "valueRange.max");
  if (min !== null && max !== null && min > max)
    throw fieldError("valueRange", "invalid_range");
  if (
    body.size !== "me_epp" &&
    body.size !== "cooperative" &&
    body.size !== "other"
  )
    throw fieldError("size", "invalid_enum");
  return {
    description,
    offerings,
    exclusions,
    coverage,
    valueRange: { min, max },
    size: body.size,
  };
}

export const fitLevel = (
  score: number,
  excluded = false,
  sizeRestricted = false,
): "high" | "medium" | "low" =>
  excluded || sizeRestricted
    ? "low"
    : score >= 0.75
      ? "high"
      : score >= 0.5
        ? "medium"
        : "low";
