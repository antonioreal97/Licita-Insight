import { normalizeText } from "../domain/normalize";
import type { MapasInstallation } from "./cultural-installations";
import {
  matchesAudiovisualText,
  opportunityAreaLabels,
  resolveAreas,
  type OpportunityArea,
} from "./opportunity-areas";
import {
  redactContacts,
  resolveOwner,
  type OwnerKind,
  type OwnerReview,
} from "./opportunity-owner";

export { matchesAudiovisualText } from "./opportunity-areas";

export const OPPORTUNITY_STATUSES = ["open", "upcoming", "closed", "undated"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_PROGRAMS = ["audiovisual", "lpg", "fac", "fsa"] as const;
export type OpportunityProgram = (typeof OPPORTUNITY_PROGRAMS)[number];

/** Continuous-flow calls carry a far-future sentinel (2111-01-01) as the closing date. */
const SENTINEL_YEAR = 2100;

export type MapasOpportunity = {
  id?: unknown;
  name?: unknown;
  shortDescription?: unknown;
  registrationFrom?: unknown;
  registrationTo?: unknown;
  singleUrl?: unknown;
  continuousFlow?: unknown;
  owner?: { id?: unknown; name?: unknown; type?: unknown } | null;
  ownerEntity?: { id?: unknown; name?: unknown; type?: unknown } | null;
  type?: unknown;
  terms?: unknown;
  parent?: unknown;
  isModel?: unknown;
  /** Present only on a record read back from `raw_payload`. */
  ownerReview?: unknown;
};

/** What is stored in `raw_payload`: the fields below, the owner as `resolveOwner` allows and its review. */
export type StoredMapasOpportunity = Record<string, unknown> & {
  ownerReview: OwnerReview;
};

/** Source fields copied to `raw_payload` as they came. Anything else the API sends is left out. */
const RAW_FIELDS = [
  "id",
  "registrationFrom",
  "registrationTo",
  "singleUrl",
  "continuousFlow",
  "type",
  "terms",
  "parent",
  "isModel",
  "@entityType",
] as const;

export type OpportunityDraft = {
  id: string;
  installationId: string;
  externalId: string;
  title: string;
  summary: string | null;
  organizationName: string;
  state: string | null;
  city: string | null;
  registrationFrom: Date | null;
  registrationTo: Date | null;
  continuousFlow: boolean;
  status: OpportunityStatus;
  program: OpportunityProgram | null;
  areas: OpportunityArea[];
  areaTerms: string[];
  opportunityType: string | null;
  originName: string | null;
  ownerKind: OwnerKind;
  /** Published by a person, with no sign of a public call. The hub leaves it out unless asked. */
  individualListing: boolean;
  sourceUrl: string | null;
  searchText: string;
  raw: StoredMapasOpportunity;
};

const keywordPattern = (word: string): RegExp =>
  new RegExp(`(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`);

/** Named funds first; a call with no named fund is `audiovisual` only when its text says so. */
export const programFromText = (
  title: string,
  summary: string | null,
): OpportunityProgram | null => {
  const text = normalizeText(`${title} ${summary ?? ""}`);
  if (text.includes("fundo setorial") || keywordPattern("fsa").test(text)) return "fsa";
  if (text.includes("lei paulo gustavo") || keywordPattern("lpg").test(text)) return "lpg";
  if (text.includes("fundo de apoio a cultura") || keywordPattern("fac").test(text)) return "fac";
  return matchesAudiovisualText(title, summary) ? "audiovisual" : null;
};

/** Mapas dates without an offset are Brasília local time. Some installs send `{ date, timezone }`. */
export const parseMapasDate = (value: unknown): Date | null => {
  if (value && typeof value === "object" && "date" in value) {
    return parseMapasDate((value as { date: unknown }).date);
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim();
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(trimmed);
  const date = new Date(local ? `${local[1]}T${local[2]}-03:00` : trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
};

const asText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/** `continuousFlow` is a datetime on current installs (set when the call has no closing date) and a flag on older ones. */
const isContinuous = (value: unknown): boolean => {
  if (!isSet(value)) return false;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  return parseMapasDate(value) !== null;
};

const isSentinel = (date: Date | null): boolean =>
  date !== null && date.getUTCFullYear() >= SENTINEL_YEAR;

const isSet = (value: unknown): boolean =>
  value !== null && value !== undefined && value !== false && value !== 0 && value !== "0" && value !== "";

/** Mapas sends `terms` as `{ area: [...], tag: [...] }`; installs with no terms send `[]`. */
export const areaTermsOf = (terms: unknown): string[] => {
  if (!terms || typeof terms !== "object" || Array.isArray(terms)) return [];
  const area = (terms as { area?: unknown }).area;
  if (!Array.isArray(area)) return [];
  const seen = new Set<string>();
  for (const term of area) {
    const text = asText(term);
    if (text) seen.add(text);
  }
  return [...seen];
};

const nameOf = (value: unknown): string | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? asText((value as { name?: unknown }).name)
    : null;

export const opportunityStatus = (
  from: Date | null,
  to: Date | null,
  continuous: boolean,
  now: Date,
): OpportunityStatus => {
  if (from && from.getTime() > now.getTime()) return "upcoming";
  if (to && to.getTime() < now.getTime()) return "closed";
  if (from || to || continuous) return "open";
  return "undated";
};

const sourceUrlFor = (
  record: MapasOpportunity,
  installation: MapasInstallation,
  externalId: string,
): string | null => {
  const raw = asText(record.singleUrl);
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  const base = installation.baseUrl.replace(/\/$/, "");
  if (raw && raw.startsWith("/")) return `${base}${raw}`;
  return `${base}/oportunidade/${externalId}/`;
};

export type MapOpportunityOptions = {
  /** False when the record is a stored `raw_payload`, not an answer of the source. */
  fromSource?: boolean;
};

export const mapOpportunity = (
  record: MapasOpportunity,
  installation: MapasInstallation,
  now: Date,
  options: MapOpportunityOptions = {},
): OpportunityDraft | null => {
  const externalId =
    typeof record.id === "number" && Number.isInteger(record.id)
      ? String(record.id)
      : typeof record.id === "string" && /^\d+$/.test(record.id)
        ? record.id
        : null;
  const sourceTitle = asText(record.name);
  if (!externalId || !sourceTitle) return null;
  // Later phases of a call and call templates are not calls of their own.
  if (isSet(record.parent) || isSet(record.isModel)) return null;

  const sourceSummary = asText(record.shortDescription);
  const owner = resolveOwner(
    record,
    installation,
    { title: sourceTitle, summary: sourceSummary },
    options,
  );
  // A person's listing often carries their own phone or e-mail in the text.
  const title = owner.personal ? redactContacts(sourceTitle) : sourceTitle;
  const summary =
    sourceSummary && owner.personal ? redactContacts(sourceSummary) : sourceSummary;
  const { organizationName, originName } = owner;
  const registrationFrom = parseMapasDate(record.registrationFrom);
  const closing = parseMapasDate(record.registrationTo);
  const continuousFlow = isContinuous(record.continuousFlow) || isSentinel(closing);
  const registrationTo = isSentinel(closing) ? null : closing;
  const areaTerms = areaTermsOf(record.terms);
  const areas = resolveAreas(areaTerms, title, summary);
  const program =
    programFromText(title, summary) ?? (areas.includes("audiovisual") ? "audiovisual" : null);
  const state = installation.uf === "BR" ? null : installation.uf;
  const city = installation.city ?? null;
  const opportunityType = nameOf(record.type);
  const source = record as Record<string, unknown>;

  return {
    id: `${installation.id}-${externalId}`,
    installationId: installation.id,
    externalId,
    title,
    summary,
    organizationName,
    state,
    city,
    registrationFrom,
    registrationTo,
    continuousFlow,
    status: opportunityStatus(registrationFrom, registrationTo, continuousFlow, now),
    program,
    areas,
    areaTerms,
    opportunityType,
    originName,
    ownerKind: owner.review.ownerKind,
    individualListing: owner.review.individualListing,
    sourceUrl: sourceUrlFor(record, installation, externalId),
    searchText: normalizeText(
      [
        title,
        summary,
        organizationName,
        installation.name,
        program,
        state,
        city,
        opportunityType,
        originName,
        ...areas.map((area) => opportunityAreaLabels[area]),
        ...areaTerms,
      ]
        .filter(Boolean)
        .join(" "),
    ),
    raw: {
      ...Object.fromEntries(
        RAW_FIELDS.filter((field) => source[field] !== undefined).map((field) => [
          field,
          source[field],
        ]),
      ),
      name: title,
      shortDescription: summary,
      owner: owner.owner,
      ownerEntity: owner.ownerEntity,
      ownerReview: owner.review,
    },
  };
};
