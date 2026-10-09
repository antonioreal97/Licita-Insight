import { createHash } from "node:crypto";
import { InvalidParameterError, type ApiErrorDetail } from "../lib/api-error";
import { TENDER_CATEGORIES } from "../catalog/tender-categories";
import { isRegistrationSlug } from "../catalog/tender-platforms";
import {
  MACROREGION_UFS,
  municipalityReference,
  type Macroregion,
  type ServiceRegionCoverage,
} from "../service-region/service-region";

export type CompanySize = "me_epp" | "cooperative" | "other";
export type CompanyProfileInput = {
  description: string;
  offerings: string[];
  exclusions: string[];
  selectedCategories: string[];
  selectedKeywords: string[];
  excludedKeywords: string[];
  /** Bidding rooms and SICAF the company is registered in. Does not feed the AI fit. */
  registeredPlatforms: string[];
  coverage: ServiceRegionCoverage;
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
const CATEGORY_SLUGS = new Set<string>(
  TENDER_CATEGORIES.map(({ slug }) => slug),
);
const MACROREGIONS = new Set<Macroregion>(
  Object.keys(MACROREGION_UFS) as Macroregion[],
);
const COVERAGE_RADII = new Set([50, 100, 200, 300, 500]);

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
  const selectedKeywords = terms(
    body.selectedKeywords ?? [],
    "selectedKeywords",
    0,
    details,
  );
  const excludedKeywords = terms(
    body.excludedKeywords ?? [],
    "excludedKeywords",
    0,
    details,
  );
  const selectedCategories = Array.isArray(body.selectedCategories)
    ? body.selectedCategories
        .map((category, index) => {
          if (typeof category !== "string" || !CATEGORY_SLUGS.has(category)) {
            details.push({
              field: `selectedCategories.${index}`,
              issue: "invalid_value",
            });
            return "";
          }
          return category;
        })
        .filter(Boolean)
    : [];
  if (
    body.selectedCategories !== undefined &&
    !Array.isArray(body.selectedCategories)
  )
    details.push({ field: "selectedCategories", issue: "invalid_type" });
  if (
    selectedCategories.length > 20 ||
    new Set(selectedCategories).size !== selectedCategories.length
  )
    details.push({ field: "selectedCategories", issue: "invalid_length" });
  const registeredPlatforms = Array.isArray(body.registeredPlatforms)
    ? body.registeredPlatforms.filter((platform, index): platform is string => {
        if (isRegistrationSlug(platform)) return true;
        details.push({
          field: `registeredPlatforms.${index}`,
          issue: "invalid_value",
        });
        return false;
      })
    : [];
  if (
    body.registeredPlatforms !== undefined &&
    !Array.isArray(body.registeredPlatforms)
  )
    details.push({ field: "registeredPlatforms", issue: "invalid_type" });
  if (new Set(registeredPlatforms).size !== registeredPlatforms.length)
    details.push({ field: "registeredPlatforms", issue: "duplicate" });
  let coverage: CompanyProfileInput["coverage"] | undefined;
  if (
    !body.coverage ||
    typeof body.coverage !== "object" ||
    Array.isArray(body.coverage)
  ) {
    details.push({ field: "coverage", issue: "invalid_type" });
  } else {
    const coverageInput = body.coverage as Record<string, unknown>;
    const mode =
      coverageInput.mode === undefined ? "strict" : coverageInput.mode;
    const acceptsRemote =
      coverageInput.acceptsRemote === undefined
        ? false
        : coverageInput.acceptsRemote;
    if (mode !== "strict" && mode !== "prioritize")
      details.push({ field: "coverage.mode", issue: "invalid_enum" });
    if (typeof acceptsRemote !== "boolean")
      details.push({ field: "coverage.acceptsRemote", issue: "invalid_type" });
    if (coverageInput.scope === "national") {
      coverage = {
        scope: "national",
        mode: mode as "strict" | "prioritize",
        acceptsRemote: acceptsRemote as boolean,
      };
    } else if (
      coverageInput.scope === "states" ||
      coverageInput.scope === "custom"
    ) {
      const rawStates = coverageInput.states ?? [];
      const rawRegions =
        coverageInput.scope === "states" ? [] : (coverageInput.regions ?? []);
      const rawMunicipalities =
        coverageInput.scope === "states"
          ? []
          : (coverageInput.municipalities ?? []);
      const rawRadius =
        coverageInput.scope === "states"
          ? null
          : (coverageInput.radius ?? null);
      if (!Array.isArray(rawStates))
        details.push({ field: "coverage.states", issue: "invalid_type" });
      if (!Array.isArray(rawRegions))
        details.push({ field: "coverage.regions", issue: "invalid_type" });
      if (!Array.isArray(rawMunicipalities))
        details.push({
          field: "coverage.municipalities",
          issue: "invalid_type",
        });
      const states = Array.isArray(rawStates)
        ? rawStates.map((state) =>
            typeof state === "string" ? state.trim().toUpperCase() : "",
          )
        : [];
      const regions = Array.isArray(rawRegions)
        ? rawRegions.map(
            (region) =>
              (typeof region === "string" ? region : "") as Macroregion,
          )
        : [];
      const municipalityCodes = Array.isArray(rawMunicipalities)
        ? rawMunicipalities.map((city, index) => {
            const code =
              typeof city === "string"
                ? city
                : city && typeof city === "object" && !Array.isArray(city)
                  ? String((city as Record<string, unknown>).ibgeCode ?? "")
                  : "";
            if (!municipalityReference(code))
              details.push({
                field: `coverage.municipalities.${index}`,
                issue: "invalid_value",
              });
            return code;
          })
        : [];
      if (
        states.some((state) => !UFS.has(state)) ||
        new Set(states).size !== states.length
      )
        details.push({ field: "coverage.states", issue: "invalid_value" });
      if (
        regions.some((region) => !MACROREGIONS.has(region)) ||
        new Set(regions).size !== regions.length
      )
        details.push({ field: "coverage.regions", issue: "invalid_value" });
      if (new Set(municipalityCodes).size !== municipalityCodes.length)
        details.push({ field: "coverage.municipalities", issue: "duplicate" });
      let radius: Extract<
        ServiceRegionCoverage,
        { scope: "custom" }
      >["radius"] = null;
      if (rawRadius !== null) {
        if (
          !rawRadius ||
          typeof rawRadius !== "object" ||
          Array.isArray(rawRadius)
        ) {
          details.push({ field: "coverage.radius", issue: "invalid_type" });
        } else {
          const radiusInput = rawRadius as Record<string, unknown>;
          const centerValue = radiusInput.center;
          const centerCode =
            typeof centerValue === "string"
              ? centerValue
              : centerValue &&
                  typeof centerValue === "object" &&
                  !Array.isArray(centerValue)
                ? String(
                    (centerValue as Record<string, unknown>).ibgeCode ?? "",
                  )
                : "";
          const center = municipalityReference(centerCode);
          const km = radiusInput.km;
          if (!center)
            details.push({
              field: "coverage.radius.center",
              issue: "invalid_value",
            });
          if (typeof km !== "number" || !COVERAGE_RADII.has(km))
            details.push({
              field: "coverage.radius.km",
              issue: "invalid_value",
            });
          if (center && typeof km === "number" && COVERAGE_RADII.has(km))
            radius = { center, km: km as 50 | 100 | 200 | 300 | 500 };
        }
      }
      if (
        states.length + regions.length + municipalityCodes.length === 0 &&
        radius === null
      )
        details.push({ field: "coverage", issue: "invalid_length" });
      coverage = {
        scope: "custom",
        mode: mode as "strict" | "prioritize",
        acceptsRemote: acceptsRemote as boolean,
        states,
        regions,
        municipalities: municipalityCodes.flatMap((code) => {
          const city = municipalityReference(code);
          return city ? [city] : [];
        }),
        radius,
      };
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
    selectedCategories,
    selectedKeywords,
    excludedKeywords,
    registeredPlatforms,
    coverage: coverage!,
    valueRange: { min: min!, max: max! },
    size: size!,
  };
}

export type SizeRestriction = "me_epp_exclusive" | "me_epp_quota";

/** Level cut-offs on the normalized 0–1 score (owner decision, 25 set 2026, after calibration). */
export const FIT_HIGH_MIN = 0.75;
export const FIT_MEDIUM_MIN = 0.55;

export const fitLevel = (
  score: number,
  excluded = false,
  sizeRestriction: SizeRestriction | null = null,
): "high" | "medium" | "low" =>
  excluded || sizeRestriction === "me_epp_exclusive"
    ? "low"
    : score >= FIT_HIGH_MIN
      ? "high"
      : score >= FIT_MEDIUM_MIN
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
  categories?: unknown;
  searchText?: string;
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
        categories: tender.categories,
        searchText: tender.searchText,
      }),
    )
    .digest("hex");
