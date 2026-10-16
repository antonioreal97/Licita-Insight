import type {
  OpportunityDocument,
  OpportunityKind,
  OpportunitySource,
  OpportunityTranslationSource,
} from "@workspace/db";
import { normalizeText } from "../domain/normalize";
import {
  internationalLanguageLabels,
  internationalRegionLabels,
  type InternationalPlace,
} from "./international-countries";
import type { InternationalDeadline } from "./international-deadline";
import type { EligibilityDecision } from "./international-eligibility";
import { opportunityStatus, type OpportunityStatus } from "./opportunity-map";

export type InternationalSource = Extract<
  OpportunitySource,
  "worldbank" | "eu_ft" | "idb"
>;

export const internationalAgencies: Record<InternationalSource, string> = {
  worldbank: "Banco Mundial",
  eu_ft: "União Europeia",
  idb: "BID",
};

/** A labelled fact of the notice shown on the detail page ("Método", "Projeto", "Programa"…). */
export type InternationalDetail = { label: string; value: string };

export type InternationalOpportunityDraft = {
  id: string;
  installationId: InternationalSource;
  externalId: string;
  kind: OpportunityKind;
  source: InternationalSource;
  scope: "international";
  agency: string;
  /** What the hub shows: the Portuguese title when the source already publishes one, else the original. */
  title: string;
  titleOriginal: string;
  titlePt: string | null;
  translationSource: OpportunityTranslationSource | null;
  language: string | null;
  /** Written by rules, in Portuguese, from structured fields. Never a copy of the notice text. */
  summary: string | null;
  organizationName: string;
  originName: string | null;
  opportunityType: string | null;
  country: string | null;
  countryName: string | null;
  region: string | null;
  amountOriginal: number | null;
  currency: string | null;
  documents: OpportunityDocument[];
  registrationFrom: Date | null;
  registrationTo: Date | null;
  deadlineTimeZone: string | null;
  deadlinePrecision: InternationalDeadline["precision"] | null;
  deadlineOriginal: string | null;
  status: OpportunityStatus;
  brazilEligibility: EligibilityDecision;
  /** `null` where the question does not apply (a procurement contract is paid to whoever wins it). */
  brazilFunding: EligibilityDecision | null;
  sourceUrl: string;
  searchText: string;
  /** A closed list of fields of the source. No contact person, e-mail, phone or notice text. */
  raw: Record<string, unknown>;
};

const clip = (value: string, limit: number): string =>
  value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;

const squash = (value: string): string => value.replace(/\s+/g, " ").trim();

/** `€ 17 mi`, `US$ 2,5 mil`. Falls back to the plain number for a code `Intl` does not know. */
export const compactMoney = (amount: number, currency: string): string => {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat("pt-BR").format(amount)} ${currency}`;
  }
};

export const searchTextFor = (
  draft: Pick<
    InternationalOpportunityDraft,
    | "titleOriginal"
    | "titlePt"
    | "summary"
    | "organizationName"
    | "originName"
    | "opportunityType"
    | "agency"
    | "countryName"
    | "region"
    | "language"
    | "kind"
    | "source"
  >,
  extras: Array<string | null> = [],
): string =>
  normalizeText(
    [
      draft.titlePt,
      draft.titleOriginal,
      draft.summary,
      draft.organizationName,
      draft.originName,
      draft.opportunityType,
      draft.agency,
      draft.countryName,
      draft.region
        ? internationalRegionLabels[
            draft.region as keyof typeof internationalRegionLabels
          ]
        : null,
      draft.language ? internationalLanguageLabels[draft.language] : null,
      draft.kind,
      draft.source,
      "internacional",
      ...extras,
    ]
      .filter(Boolean)
      .join(" "),
  );

export const internationalDraft = (input: {
  source: InternationalSource;
  externalId: string;
  kind: OpportunityKind;
  titleOriginal: string;
  language: string | null;
  summary: string | null;
  organizationName: string;
  originName?: string | null;
  opportunityType?: string | null;
  place: InternationalPlace;
  amountOriginal?: number | null;
  currency?: string | null;
  documents?: OpportunityDocument[];
  registrationFrom?: Date | null;
  deadline: InternationalDeadline | null;
  /** What the source itself says, used when there are no dates to decide from. */
  sourceStatus?: "open" | "upcoming";
  brazilEligibility: EligibilityDecision;
  brazilFunding?: EligibilityDecision | null;
  sourceUrl: string;
  details: InternationalDetail[];
  searchExtras?: Array<string | null>;
  raw: Record<string, unknown>;
  now: Date;
}): InternationalOpportunityDraft => {
  const titleOriginal = clip(squash(input.titleOriginal), 500);
  // A notice already in Portuguese needs no translation; the source is the author of the Portuguese title.
  const inPortuguese = input.language === "pt";
  const registrationFrom = input.registrationFrom ?? null;
  const registrationTo = input.deadline?.at ?? null;
  const dated = opportunityStatus(
    registrationFrom,
    registrationTo,
    false,
    input.now,
  );
  const status: OpportunityStatus =
    dated === "closed"
      ? "closed"
      : input.sourceStatus === "upcoming"
        ? "upcoming"
        : dated === "undated"
          ? (input.sourceStatus ?? "undated")
          : dated;
  const amount =
    typeof input.amountOriginal === "number" &&
    Number.isFinite(input.amountOriginal) &&
    input.amountOriginal > 0
      ? input.amountOriginal
      : null;
  const details = input.details
    .map(({ label, value }) => ({ label, value: clip(squash(value), 300) }))
    .filter(({ value }) => value !== "");
  const base = {
    id: `${input.source}-${input.externalId}`,
    installationId: input.source,
    externalId: input.externalId,
    kind: input.kind,
    source: input.source,
    scope: "international" as const,
    agency: internationalAgencies[input.source],
    title: titleOriginal,
    titleOriginal,
    titlePt: inPortuguese ? titleOriginal : null,
    translationSource: inPortuguese ? ("source" as const) : null,
    language: input.language,
    summary: input.summary ? clip(squash(input.summary), 1_000) : null,
    organizationName: clip(squash(input.organizationName), 300),
    originName: input.originName ? clip(squash(input.originName), 300) : null,
    opportunityType: input.opportunityType ?? null,
    country: input.place.country,
    countryName: input.place.countryName,
    region: input.place.region,
    amountOriginal: amount,
    currency: amount === null ? null : (input.currency ?? null),
    documents: input.documents ?? [],
    registrationFrom,
    registrationTo,
    deadlineTimeZone: input.deadline?.timeZone ?? null,
    deadlinePrecision: input.deadline?.precision ?? null,
    deadlineOriginal: input.deadline?.original ?? null,
    status,
    brazilEligibility: input.brazilEligibility,
    brazilFunding: input.brazilFunding ?? null,
    sourceUrl: input.sourceUrl,
    raw: { ...input.raw, details },
  };
  return { ...base, searchText: searchTextFor(base, input.searchExtras) };
};
