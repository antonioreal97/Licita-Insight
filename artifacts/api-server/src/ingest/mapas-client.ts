import { logger } from "../lib/logger";
import { timeoutSignal } from "../lib/http-timeout";
import type { MapasInstallation } from "./cultural-installations";
import {
  mapOpportunity,
  matchesAudiovisualText,
  type MapasOpportunity,
  type OpportunityDraft,
} from "./opportunity-map";

const SELECT =
  "id,name,shortDescription,registrationFrom,registrationTo,singleUrl,continuousFlow,owner.{id,name}";
const PAGE_SIZE = 50;
/** `term:linguagem` returns 500 or HTML on the live installs. Keyword search does not. */
const KEYWORDS = ["audiovisual", "cinema", "filme", "documentario"] as const;

export class MapasClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MapasClientError";
  }
}

export type FetchOpportunitiesResult = {
  drafts: OpportunityDraft[];
  pagesRead: number;
  vocabularyFallback: boolean;
  warning: string | null;
};

type Fetcher = (url: string) => Promise<{ status: number; body: string; metadata: string | null }>;

const saoPauloDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const addCalendarDays = (isoDate: string, days: number): string => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

export const lookbackStart = (now: Date, days: number): string =>
  addCalendarDays(saoPauloDate(now), -(days - 1));

const query = (params: Record<string, string>): string =>
  Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

const pageCount = (metadata: string | null, received: number): number | null => {
  if (!metadata) return received < PAGE_SIZE ? 1 : null;
  try {
    const parsed = JSON.parse(metadata) as { numPages?: unknown };
    return typeof parsed.numPages === "number" && parsed.numPages >= 1
      ? parsed.numPages
      : null;
  } catch {
    return null;
  }
};

const asRecords = (body: string, url: string): MapasOpportunity[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new MapasClientError(
      `Mapas Culturais returned invalid JSON for ${url}: ${error instanceof Error ? error.message : String(error)}`,
      200,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new MapasClientError(`Mapas Culturais listing was not an array: ${url}`, 200);
  }
  return parsed.filter((item): item is MapasOpportunity => item !== null && typeof item === "object");
};

async function defaultFetch(url: string): Promise<{ status: number; body: string; metadata: string | null }> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PardalDigital/0.1 (coleta de oportunidades do Mapas Culturais)",
    },
    signal: timeoutSignal("MAPAS_HTTP_TIMEOUT_MS", 30_000),
  });
  return {
    status: response.status,
    body: await response.text(),
    metadata: response.headers.get("API-Metadata"),
  };
}

const failureText = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  const causeText =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  return causeText ? `${error.message}: ${causeText}` : error.message;
};

async function getJson(
  fetcher: Fetcher,
  url: string,
): Promise<{ status: number; body: string; metadata: string | null }> {
  try {
    return await fetcher(url);
  } catch (error) {
    if (error instanceof MapasClientError) throw error;
    throw new MapasClientError(
      `Mapas Culturais request failed for ${url}: ${failureText(error)}`,
      0,
    );
  }
}

async function listPages(
  baseUrl: string,
  params: Record<string, string>,
  fetcher: Fetcher,
  maxPages: number,
): Promise<{ records: MapasOpportunity[]; pagesRead: number; truncated: boolean }> {
  const root = baseUrl.replace(/\/$/, "");
  const records: MapasOpportunity[] = [];
  let pagesRead = 0;
  let totalPages = 1;

  for (let page = 1; page <= totalPages; page += 1) {
    if (pagesRead >= maxPages) {
      return { records, pagesRead, truncated: true };
    }
    const url = `${root}/api/opportunity/find?${query({ ...params, "@page": String(page) })}`;
    const response = await getJson(fetcher, url);
    pagesRead += 1;
    if (response.status !== 200) {
      throw new MapasClientError(
        `Mapas Culturais listing failed (${response.status}) for ${url}`,
        response.status,
      );
    }
    const batch = asRecords(response.body, url);
    records.push(...batch);
    const reported = pageCount(response.metadata, batch.length);
    if (reported === null && batch.length === PAGE_SIZE) {
      totalPages = page + 1;
    } else {
      totalPages = reported ?? page;
    }
  }

  return { records, pagesRead, truncated: false };
}

export async function fetchAudiovisualOpportunities(
  installation: MapasInstallation,
  now: Date,
  lookbackDays: number,
  options: { fetcher?: Fetcher; maxPages?: number } = {},
): Promise<FetchOpportunitiesResult> {
  const fetcher = options.fetcher ?? defaultFetch;
  const maxPages = options.maxPages ?? 20;
  const since = lookbackStart(now, lookbackDays);
  const baseParams = {
    registrationTo: `GTE(${since})`,
    "@select": SELECT,
    "@limit": String(PAGE_SIZE),
  };

  const datedRecords: MapasOpportunity[] = [];
  let pagesRead = 0;
  let truncated = false;
  const keywordErrors: string[] = [];
  for (const keyword of KEYWORDS) {
    try {
      const page = await listPages(
        installation.baseUrl,
        { ...baseParams, "@keyword": keyword },
        fetcher,
        maxPages,
      );
      datedRecords.push(...page.records);
      pagesRead += page.pagesRead;
      truncated = truncated || page.truncated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      keywordErrors.push(message);
      logger.error(
        { err: error, installationId: installation.id, keyword },
        "Mapas Culturais keyword search failed",
      );
    }
  }
  if (datedRecords.length === 0 && keywordErrors.length === KEYWORDS.length) {
    throw new MapasClientError(keywordErrors[0] ?? "Mapas Culturais keyword search failed", 0);
  }

  let continuousWarning: string | null = null;
  const continuous = await listPages(
    installation.baseUrl,
    {
      continuousFlow: "EQ(true)",
      "@keyword": "audiovisual",
      "@select": SELECT,
      "@limit": String(PAGE_SIZE),
    },
    fetcher,
    maxPages,
  ).catch((error: unknown) => {
    continuousWarning =
      error instanceof Error ? error.message : "A listagem de fluxo contínuo falhou";
    logger.error(
      { err: error, installationId: installation.id },
      "Continuous-flow listing failed; dated opportunities are kept",
    );
    return { records: [] as MapasOpportunity[], pagesRead: 0, truncated: false };
  });

  const seen = new Set<string>();
  const drafts: OpportunityDraft[] = [];
  for (const record of [...datedRecords, ...continuous.records]) {
    const draft = mapOpportunity(record, installation, now);
    if (!draft || seen.has(draft.id)) continue;
    if (!matchesAudiovisualText(draft.title, draft.summary)) continue;
    seen.add(draft.id);
    drafts.push(draft);
  }

  const warnings = [
    keywordErrors.length > 0 ? keywordErrors.join(" ") : null,
    continuousWarning,
    truncated || continuous.truncated
      ? `A listagem parou no limite de ${maxPages} páginas.`
      : null,
  ].filter((warning): warning is string => Boolean(warning));
  if (truncated || continuous.truncated) {
    logger.error(
      { installationId: installation.id, maxPages },
      "Mapas Culturais listing hit the page cap",
    );
  }

  return {
    drafts,
    pagesRead: pagesRead + continuous.pagesRead,
    vocabularyFallback: false,
    warning: warnings.length > 0 ? warnings.join(" ") : null,
  };
};
