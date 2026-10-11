import { normalizeText } from "../domain/normalize";
import type { MapasInstallation } from "./cultural-installations";
import {
  matchesAudiovisualText,
  opportunityAreaLabels,
  resolveAreas,
  type OpportunityArea,
} from "./opportunity-areas";

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
  owner?: { id?: unknown; name?: unknown } | null;
  ownerEntity?: { id?: unknown; name?: unknown } | null;
  type?: unknown;
  terms?: unknown;
  parent?: unknown;
  isModel?: unknown;
};

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
  sourceUrl: string | null;
  searchText: string;
  raw: MapasOpportunity;
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

export const mapOpportunity = (
  record: MapasOpportunity,
  installation: MapasInstallation,
  now: Date,
): OpportunityDraft | null => {
  const externalId =
    typeof record.id === "number" && Number.isInteger(record.id)
      ? String(record.id)
      : typeof record.id === "string" && /^\d+$/.test(record.id)
        ? record.id
        : null;
  const title = asText(record.name);
  if (!externalId || !title) return null;
  // Later phases of a call and call templates are not calls of their own.
  if (isSet(record.parent) || isSet(record.isModel)) return null;

  const summary = asText(record.shortDescription);
  const ownerName =
    record.owner && typeof record.owner === "object" ? asText(record.owner.name) : null;
  const organizationName = ownerName ?? installation.name;
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
  const ownerEntityName = nameOf(record.ownerEntity);
  const originName = ownerEntityName && ownerEntityName !== title ? ownerEntityName : null;

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
    raw: record,
  };
};
