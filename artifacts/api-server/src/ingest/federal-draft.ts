import { createHash } from "node:crypto";
import type {
  OpportunityDocument,
  OpportunityKind,
  OpportunitySource,
} from "@workspace/db";
import { normalizeText } from "../domain/normalize";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import type { FundingOpportunityDraft } from "./funding-parsers";
import {
  areasFromText,
  opportunityAreaLabels,
  type OpportunityArea,
} from "./opportunity-areas";
import {
  opportunityStatus,
  programFromText,
  type OpportunityProgram,
  type OpportunityStatus,
} from "./opportunity-map";

/** Federal culture sources share the funding draft and add what the culture filters read. */
export type FederalOpportunityDraft = FundingOpportunityDraft & {
  city: string | null;
  continuousFlow: boolean;
  program: OpportunityProgram | null;
  areas: OpportunityArea[];
  areaTerms: string[];
  opportunityType: string | null;
  originName: string | null;
  /** Other official addresses of the same call, used to drop the copy another source also lists. */
  aliases: string[];
};

/** A closing date far in the future is a typo at the source (`15/12/5008`), not a deadline. */
const LATEST_PLAUSIBLE_YEAR = 2100;

const validDay = (year: number, month: number, day: number): string | null => {
  if (year < 1990 || year > LATEST_PLAUSIBLE_YEAR) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date.toISOString().slice(0, 10);
};

/** `DD/MM/YYYY` or `YYYY-MM-DD` to a `YYYY-MM-DD` day; anything else is `null`. */
export const dayFromText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const brazilian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (brazilian)
    return validDay(
      Number(brazilian[3]),
      Number(brazilian[2]),
      Number(brazilian[1]),
    );
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(text);
  return iso ? validDay(Number(iso[1]), Number(iso[2]), Number(iso[3])) : null;
};

const MONTHS = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export const dayFromMonthName = (
  day: string,
  month: string,
  year: string,
): string | null => {
  const index = MONTHS.indexOf(normalizeText(month));
  return index < 0 ? null : validDay(Number(year), index + 1, Number(day));
};

/** Registration days are Brasília local time: a window opens at 00:00 and closes at 23:59:59 of its last day. */
export const startOfDay = (day: string | null): Date | null =>
  day ? new Date(`${day}T00:00:00-03:00`) : null;
export const endOfDay = (day: string | null): Date | null =>
  day ? new Date(`${day}T23:59:59-03:00`) : null;

export const todayInSaoPaulo = (now: Date): string => dateInSaoPaulo(now);

/** Drops the fragment and a trailing slash so two spellings of one address compare equal. */
export const canonicalUrl = (value: string): string => {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  const text = url.toString();
  return url.search === "" && text.endsWith("/") && url.pathname !== "/"
    ? text.slice(0, -1)
    : text;
};

export const hashedExternalId = (key: string): string =>
  createHash("sha256").update(key).digest("hex").slice(0, 24);

const CULTURE_WORDS =
  /(?:^|[^a-z0-9])(?:cultura|cultural|culturais|artes|artistica|artistico|artisticas|artisticos|audiovisual|audiovisuais)(?:[^a-z0-9]|$)/;

/** A call is cultural when a culture body publishes it or its own text says so. */
export const mentionsCulture = (...texts: Array<string | null>): boolean =>
  CULTURE_WORDS.test(normalizeText(texts.filter(Boolean).join(" ")));

/** Areas read from the text; a cultural call that names no area lands in "outras" so the area filter still finds it. */
export const culturalAreas = (
  title: string,
  summary: string | null,
  cultural: boolean,
): OpportunityArea[] => {
  if (!cultural) return [];
  const areas = areasFromText(title, summary);
  return areas.length > 0 ? areas : ["outras"];
};

const clip = (value: string, limit: number): string =>
  value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;

export const federalDraft = (input: {
  source: OpportunitySource;
  externalId: string;
  kind: OpportunityKind;
  title: string;
  summary?: string | null;
  organizationName: string;
  audience?: string | null;
  amount?: number | null;
  documents?: OpportunityDocument[];
  state?: string | null;
  city?: string | null;
  registrationFrom?: Date | null;
  registrationTo?: Date | null;
  continuousFlow?: boolean;
  /** Set when the official listing itself says the call is open and the page gives no dates. */
  listedAsOpen?: boolean;
  cultural: boolean;
  opportunityType?: string | null;
  originName?: string | null;
  sourceUrl: string;
  aliases?: string[];
  searchExtras?: Array<string | null>;
  raw: Record<string, unknown>;
  now: Date;
}): FederalOpportunityDraft => {
  const title = clip(input.title.replace(/\s+/g, " ").trim(), 500);
  const summary = input.summary ? clip(input.summary.trim(), 1_000) : null;
  const audience = input.audience ? clip(input.audience.trim(), 500) : null;
  const registrationFrom = input.registrationFrom ?? null;
  const registrationTo = input.registrationTo ?? null;
  const continuousFlow = input.continuousFlow ?? false;
  const dated = opportunityStatus(
    registrationFrom,
    registrationTo,
    continuousFlow,
    input.now,
  );
  const status: OpportunityStatus =
    dated === "undated" && input.listedAsOpen ? "open" : dated;
  const areas = culturalAreas(title, summary, input.cultural);
  const program = input.cultural ? programFromText(title, summary) : null;
  const state = input.state ?? null;
  const city = input.city ?? null;
  const opportunityType = input.opportunityType ?? null;
  const originName = input.originName ?? null;
  return {
    id: `${input.source}-${input.externalId}`,
    installationId: input.source,
    externalId: input.externalId,
    kind: input.kind,
    source: input.source,
    title,
    summary,
    organizationName: input.organizationName,
    audience,
    amount:
      typeof input.amount === "number" && input.amount > 0
        ? input.amount
        : null,
    documents: input.documents ?? [],
    state,
    city,
    registrationFrom,
    registrationTo,
    continuousFlow,
    status,
    program,
    areas,
    areaTerms: [],
    opportunityType,
    originName,
    sourceUrl: input.sourceUrl,
    aliases: (input.aliases ?? []).flatMap((url) => {
      try {
        return [canonicalUrl(url)];
      } catch {
        return [];
      }
    }),
    searchText: normalizeText(
      [
        title,
        summary,
        input.organizationName,
        audience,
        input.source,
        input.kind,
        state,
        city,
        opportunityType,
        originName,
        program,
        ...areas.map((area) => opportunityAreaLabels[area]),
        ...(input.searchExtras ?? []),
      ]
        .filter(Boolean)
        .join(" "),
    ),
    raw: input.raw,
  };
};
