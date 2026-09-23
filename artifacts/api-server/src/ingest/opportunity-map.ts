import { normalizeText } from "../domain/normalize";
import type { MapasInstallation } from "./cultural-installations";

export const OPPORTUNITY_STATUSES = ["open", "upcoming", "closed", "undated"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_PROGRAMS = ["audiovisual", "lpg", "fac", "fsa"] as const;
export type OpportunityProgram = (typeof OPPORTUNITY_PROGRAMS)[number];

const AUDIOVISUAL_KEYWORDS = [
  "audiovisual",
  "cinema",
  "filme",
  "filmes",
  "documentario",
  "curta",
  "curta-metragem",
  "longa",
  "longa-metragem",
];

export type MapasOpportunity = {
  id?: unknown;
  name?: unknown;
  shortDescription?: unknown;
  registrationFrom?: unknown;
  registrationTo?: unknown;
  singleUrl?: unknown;
  continuousFlow?: unknown;
  owner?: { name?: unknown } | null;
};

export type OpportunityDraft = {
  id: string;
  installationId: string;
  externalId: string;
  title: string;
  summary: string | null;
  organizationName: string;
  state: string | null;
  registrationFrom: Date | null;
  registrationTo: Date | null;
  status: OpportunityStatus;
  program: OpportunityProgram;
  sourceUrl: string | null;
  searchText: string;
  raw: MapasOpportunity;
};

const keywordPattern = (word: string): RegExp =>
  new RegExp(`(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`);

export const matchesAudiovisualText = (
  title: string,
  summary: string | null,
): boolean => {
  const text = normalizeText(`${title} ${summary ?? ""}`);
  return AUDIOVISUAL_KEYWORDS.some((word) => keywordPattern(normalizeText(word)).test(text));
};

export const programFromText = (
  title: string,
  summary: string | null,
): OpportunityProgram => {
  const text = normalizeText(`${title} ${summary ?? ""}`);
  if (text.includes("fundo setorial") || keywordPattern("fsa").test(text)) return "fsa";
  if (text.includes("lei paulo gustavo") || keywordPattern("lpg").test(text)) return "lpg";
  if (text.includes("fundo de apoio a cultura") || keywordPattern("fac").test(text)) return "fac";
  return "audiovisual";
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

const isContinuous = (value: unknown): boolean =>
  value === true || value === 1 || value === "1" || value === "true";

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

  const summary = asText(record.shortDescription);
  const ownerName =
    record.owner && typeof record.owner === "object" ? asText(record.owner.name) : null;
  const organizationName = ownerName ?? installation.name;
  const registrationFrom = parseMapasDate(record.registrationFrom);
  const registrationTo = parseMapasDate(record.registrationTo);
  const program = programFromText(title, summary);
  const state = installation.uf === "BR" ? null : installation.uf;

  return {
    id: `${installation.id}-${externalId}`,
    installationId: installation.id,
    externalId,
    title,
    summary,
    organizationName,
    state,
    registrationFrom,
    registrationTo,
    status: opportunityStatus(registrationFrom, registrationTo, isContinuous(record.continuousFlow), now),
    program,
    sourceUrl: sourceUrlFor(record, installation, externalId),
    searchText: normalizeText(
      [title, summary, organizationName, installation.name, program, state].filter(Boolean).join(" "),
    ),
    raw: record,
  };
};
