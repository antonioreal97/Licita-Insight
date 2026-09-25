import { createHash } from "node:crypto";
import { InvalidParameterError, type ApiErrorDetail } from "../lib/api-error";

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
const terms = (
  value: unknown,
  field: string,
  minimum: number,
  details: ApiErrorDetail[],
): string[] => {
  if (!Array.isArray(value)) {
    details.push({ field, issue: "invalid_type" });
    return [];
  }
  if (value.length < minimum || value.length > 20)
    details.push({ field, issue: "invalid_length" });
  const result = value.map((term, index) => {
    if (typeof term !== "string") {
      details.push({ field: `${field}.${index}`, issue: "invalid_type" });
      return "";
    }
    const parsed = normalized(term);
    if (parsed.length < 2 || parsed.length > 80)
      details.push({ field: `${field}.${index}`, issue: "invalid_length" });
    return parsed;
  });
  const comparable = result.filter(Boolean).map(duplicateKey);
  if (new Set(comparable).size !== comparable.length)
    details.push({ field, issue: "duplicate" });
  return result;
};

const money = (
  value: unknown,
  field: string,
  details: ApiErrorDetail[],
): number | null | undefined => {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    details.push({ field, issue: "invalid_value" });
    return undefined;
  }
  return Math.round(value * 100) / 100;
};

export function parseCompanyProfileInput(value: unknown): CompanyProfileInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InvalidParameterError("Company profile is invalid", [
      { field: "body", issue: "invalid_type" },
    ]);
  const body = value as Record<string, unknown>;
  const details: ApiErrorDetail[] = [];
  const description =
    typeof body.description === "string" ? normalized(body.description) : "";
  if (typeof body.description !== "string")
    details.push({ field: "description", issue: "invalid_type" });
  else if (description.length < 20 || description.length > 600)
    details.push({ field: "description", issue: "invalid_length" });
  const offerings = terms(body.offerings, "offerings", 1, details);
  const exclusions = terms(body.exclusions, "exclusions", 0, details);
  let coverage: CompanyProfileInput["coverage"] | undefined;
  if (
    !body.coverage ||
    typeof body.coverage !== "object" ||
    Array.isArray(body.coverage)
  ) {
    details.push({ field: "coverage", issue: "invalid_type" });
  } else {
    const coverageInput = body.coverage as Record<string, unknown>;
    if (coverageInput.scope === "national") coverage = { scope: "national" };
    else if (coverageInput.scope === "states") {
      if (!Array.isArray(coverageInput.states)) {
        details.push({ field: "coverage.states", issue: "invalid_type" });
      } else {
        if (coverageInput.states.length < 1 || coverageInput.states.length > 27)
          details.push({ field: "coverage.states", issue: "invalid_length" });
        const states = coverageInput.states.map((state) =>
          typeof state === "string" ? state.trim().toUpperCase() : "",
        );
        if (
          states.some((state) => !UFS.has(state)) ||
          new Set(states).size !== states.length
        )
          details.push({ field: "coverage.states", issue: "invalid_value" });
        coverage = { scope: "states", states };
      }
    } else details.push({ field: "coverage.scope", issue: "invalid_enum" });
  }
  let min: number | null | undefined;
  let max: number | null | undefined;
  if (
    !body.valueRange ||
    typeof body.valueRange !== "object" ||
    Array.isArray(body.valueRange)
  ) {
    details.push({ field: "valueRange", issue: "invalid_type" });
  } else {
    const range = body.valueRange as Record<string, unknown>;
    min = money(range.min, "valueRange.min", details);
    max = money(range.max, "valueRange.max", details);
  }
  if (
    min !== undefined &&
    max !== undefined &&
    min !== null &&
    max !== null &&
    min > max
  )
    details.push({ field: "valueRange", issue: "invalid_range" });
  const size =
    body.size === "me_epp" ||
    body.size === "cooperative" ||
    body.size === "other"
      ? body.size
      : undefined;
  if (size === undefined)
    details.push({ field: "size", issue: "invalid_enum" });
  if (details.length > 0)
    throw new InvalidParameterError("Company profile is invalid", details);
  return {
    description,
    offerings,
    exclusions,
    coverage: coverage!,
    valueRange: { min: min!, max: max! },
    size: size!,
  };
}

export type SizeRestriction = "me_epp_exclusive" | "me_epp_quota";

export const fitLevel = (
  score: number,
  excluded = false,
  sizeRestriction: SizeRestriction | null = null,
): "high" | "medium" | "low" =>
  excluded || sizeRestriction === "me_epp_exclusive"
    ? "low"
    : score >= 0.75
      ? "high"
      : score >= 0.5
        ? "medium"
        : "low";

export type FitTenderFingerprintInput = {
  title: string;
  objectSummary: string | null;
  description: string | null;
  organizationName: string;
  estimatedValue: string | null;
  state: string | null;
  items: unknown;
};

export const companyFitTenderFingerprint = (
  tender: FitTenderFingerprintInput,
): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        title: tender.title,
        objectSummary: tender.objectSummary,
        description: tender.description,
        organizationName: tender.organizationName,
        estimatedValue: tender.estimatedValue,
        state: tender.state,
        items: tender.items,
      }),
    )
    .digest("hex");
