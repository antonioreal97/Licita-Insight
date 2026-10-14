import type {
  FitReasonRecord,
  QualificationItem,
  TenderSheetField,
} from "@workspace/db";
import { platformKind } from "../catalog/tender-platforms";

/**
 * "Destaques" of a tender: short, plain-language lines built only from data that is already stored — the latest
 * ready tender sheet (`tender_ai_sheets`: sheet fields and qualification checklist), the user's stored fit
 * (`company_tender_fits`) and the bidding platform. Nothing here generates a sheet, enqueues a job or calls a
 * model: a tender without a ready sheet or fit simply has fewer (or no) highlights.
 */

export const REQUIREMENT_HIGHLIGHT_CODES = [
  "me_epp_exclusive",
  "me_epp_quota",
  "site_visit",
  "bid_guarantee",
  "samples",
  "technical_certificate",
  "technical_qualification",
  "minimum_capital",
  "contract_guarantee",
] as const;

export type RequirementHighlightCode = (typeof REQUIREMENT_HIGHLIGHT_CODES)[number];
export type RequirementHighlight = { code: RequirementHighlightCode; label: string };

/** Card and e-mail show at most this many requirements per tender. */
export const REQUIREMENT_HIGHLIGHT_LIMIT = 3;

export const REQUIREMENT_HIGHLIGHT_LABELS: Readonly<Record<RequirementHighlightCode, string>> = {
  me_epp_exclusive: "Exclusivo para ME/EPP",
  me_epp_quota: "Cota reservada para ME/EPP",
  site_visit: "Visita técnica obrigatória",
  bid_guarantee: "Exige garantia de proposta",
  samples: "Exige amostra ou prova de conceito",
  technical_certificate: "Exige atestado de capacidade técnica",
  technical_qualification: "Exige qualificação técnica",
  minimum_capital: "Exige capital ou patrimônio mínimo",
  contract_guarantee: "Exige garantia contratual",
};

export type StoredSheet = {
  fields: TenderSheetField[];
  qualificationChecklist: QualificationItem[];
};

const CERTIFICATE = /atestad/i;
const MINIMUM_CAPITAL = /capital\s+(social\s+)?m[ií]nimo|patrim[oô]nio\s+l[ií]quido/i;

/**
 * The requirements worth reading before opening the tender, most decisive first (who may bid, then what must be
 * done or paid before the session, then documents). Sheet answers are the stored classification; an answer that
 * the sheet left undefined is never turned into a requirement.
 */
export function requirementHighlights(sheet: StoredSheet | null | undefined): RequirementHighlight[] {
  if (!sheet) return [];
  const field = (id: TenderSheetField["id"]) =>
    sheet.fields.find((candidate) => candidate.id === id && candidate.status === "found");
  const answer = (id: TenderSheetField["id"]) => field(id)?.answer ?? null;
  const checklist = (type: QualificationItem["type"]) =>
    sheet.qualificationChecklist.filter((item) => item.type === type);

  const codes = new Set<RequirementHighlightCode>();
  const meEpp = answer("me_epp");
  if (meEpp === "exclusive") codes.add("me_epp_exclusive");
  if (meEpp === "quota") codes.add("me_epp_quota");
  if (answer("site_visit") === "mandatory") codes.add("site_visit");
  if (answer("bid_guarantee") === "required") codes.add("bid_guarantee");
  if (answer("samples") === "required") codes.add("samples");

  const technicalTexts = [
    ...checklist("qualificacao_tecnica").map(({ evidence }) => evidence.text),
    ...(field("technical_qualification")?.evidence ? [field("technical_qualification")!.evidence!.text] : []),
  ];
  if (technicalTexts.some((text) => CERTIFICATE.test(text))) codes.add("technical_certificate");
  else if (technicalTexts.length > 0) codes.add("technical_qualification");

  const financialTexts = [
    ...checklist("qualificacao_economica").map(({ evidence }) => evidence.text),
    ...(field("financial_qualification")?.evidence ? [field("financial_qualification")!.evidence!.text] : []),
  ];
  if (financialTexts.some((text) => MINIMUM_CAPITAL.test(text))) codes.add("minimum_capital");
  if (answer("contract_guarantee") === "required") codes.add("contract_guarantee");

  return REQUIREMENT_HIGHLIGHT_CODES.filter((code) => codes.has(code))
    .slice(0, REQUIREMENT_HIGHLIGHT_LIMIT)
    .map((code) => ({ code, label: REQUIREMENT_HIGHLIGHT_LABELS[code] }));
}

export type StoredFit = {
  level: "high" | "medium" | "low" | null;
  reasons: FitReasonRecord[];
};

const quoted = (terms: string[]) => terms.slice(0, 3).map((term) => `“${term}”`).join(", ");

/** The one reason that best says why a tender suits the profile; the e-mail never explains a weak match. */
export function fitHighlight(fit: StoredFit | null | undefined): string | null {
  if (!fit || (fit.level !== "high" && fit.level !== "medium")) return null;
  const badge = fit.level === "high" ? "Alta aderência ao seu perfil" : "Aderência média ao seu perfil";
  for (const reason of fit.reasons) {
    if (reason.kind === "offering_match" && reason.terms.length > 0)
      return `${badge}: combina com ${quoted(reason.terms)}`;
    if (reason.kind === "service_region") return `${badge}: ${reason.text.replace(/\.$/, "")}`;
  }
  return badge;
}

export type StoredPlatform = { slug: string | null; label: string | null };

export function platformHighlight(
  platform: StoredPlatform,
  registeredPlatforms: readonly string[],
): { text: string; missingRegistration: boolean } | null {
  if (!platform.slug || !platform.label || platformKind(platform.slug) !== "platform") return null;
  // Same rule as the app's badge: with nothing declared in the profile every tender would carry the warning.
  const missingRegistration = registeredPlatforms.length > 0 && !registeredPlatforms.includes(platform.slug);
  return {
    text: missingRegistration
      ? `Disputa em ${platform.label}: você ainda não é cadastrado nesta plataforma`
      : `Disputa em ${platform.label}`,
    missingRegistration,
  };
}

/**
 * Up to three lines for an e-mail: fit, requirements, platform. The platform alone is not news (every tender has
 * one), so it only shows next to another highlight or when it carries the registration warning.
 */
export function tenderHighlightLines(input: {
  sheet?: StoredSheet | null;
  fit?: StoredFit | null;
  platform?: StoredPlatform | null;
  registeredPlatforms?: readonly string[];
}): string[] {
  const fit = fitHighlight(input.fit);
  const requirements = requirementHighlights(input.sheet).map(({ label }) => label);
  const platform = input.platform
    ? platformHighlight(input.platform, input.registeredPlatforms ?? [])
    : null;
  const lines = [
    ...(fit ? [fit] : []),
    ...(requirements.length > 0 ? [requirements.join(" · ")] : []),
  ];
  if (platform && (lines.length > 0 || platform.missingRegistration)) lines.push(platform.text);
  return lines;
}

/** Highlights of one tender an e-mail cites, with what the e-mail needs to link it. */
export type EmailTenderHighlight = {
  tenderId: string;
  title: string;
  organizationName: string;
  lines: string[];
};
