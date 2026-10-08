import { logger } from "../lib/logger";
import { timeoutSignal } from "../lib/http-timeout";
import { fetch as undiciFetch } from "undici";
import type { MapasInstallation } from "./cultural-installations";
import {
  httpMapasError,
  MapasClientError,
  transportMapasError,
} from "./mapas-errors";
import { dispatcherForUrl } from "./mapas-tls";
import {
  mapOpportunity,
  matchesAudiovisualText,
  type MapasOpportunity,
  type OpportunityDraft,
} from "./opportunity-map";

const SELECT =
  "id,name,shortDescription,registrationFrom,registrationTo,singleUrl,continuousFlow,owner.{id,name}";
const PAGE_SIZE = 50;
const USER_AGENT =
  "PardalDigital/0.1 (+https://pardaldigital.com; contato@pardaldigital.com)";
/** `term:linguagem` returns 500 or HTML on the live installs. Keyword search does not. */
const KEYWORDS = ["audiovisual", "cinema", "filme", "documentario"] as const;

export { MapasClientError } from "./mapas-errors";

export type FetchOpportunitiesResult = {
  drafts: OpportunityDraft[];
  pagesRead: number;
  vocabularyFallback: boolean;
  warning: string | null;
};

export type MapasFetchResponse = {
  status: number;
  body: string;
  metadata: string | null;
  retryAfterMs?: number | null;
};

export type MapasFetcher = (url: string) => Promise<MapasFetchResponse>;

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const positiveInteger = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `${name} must be a non-negative integer, received "${value}"`,
    );
  }
  return parsed;
};

export const retryAfterMilliseconds = (
  value: string | null,
  now = Date.now(),
): number | null => {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.ceil(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
};

let lastLiveRequestAt = 0;

const waitForPace = async (): Promise<void> => {
  const minimumDelay = positiveInteger("CULTURE_PAGE_DELAY_MS", 500);
  const remaining = lastLiveRequestAt + minimumDelay - Date.now();
  if (remaining > 0) await sleep(remaining);
  lastLiveRequestAt = Date.now();
};

const saoPauloDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const addCalendarDays = (isoDate: string, days: number): string => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
};

export const lookbackStart = (now: Date, days: number): string =>
  addCalendarDays(saoPauloDate(now), -(days - 1));

const query = (params: Record<string, string>): string =>
  Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

const pageCount = (
  metadata: string | null,
  received: number,
): number | null => {
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
      "invalid_response",
    );
  }
  if (!Array.isArray(parsed)) {
    throw new MapasClientError(
      `Mapas Culturais listing was not an array: ${url}`,
      200,
      "invalid_response",
    );
  }
  return parsed.filter(
    (item): item is MapasOpportunity =>
      item !== null && typeof item === "object",
  );
};

export async function defaultMapasFetch(
  url: string,
): Promise<MapasFetchResponse> {
  const retries = positiveInteger("CULTURE_HTTP_MAX_RETRIES", 2);
  const backoffBaseMs = positiveInteger("CULTURE_RETRY_BASE_MS", 1_000);

  for (let attempt = 0; ; attempt += 1) {
    await waitForPace();
    const response = await undiciFetch(url, {
      dispatcher: dispatcherForUrl(url),
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: timeoutSignal("MAPAS_HTTP_TIMEOUT_MS", 30_000),
    });
    const retryAfterMs = retryAfterMilliseconds(
      response.headers.get("Retry-After"),
    );
    const retriable = response.status === 429 || response.status >= 500;
    if (!retriable || attempt >= retries) {
      return {
        status: response.status,
        body: await response.text(),
        metadata: response.headers.get("API-Metadata"),
        retryAfterMs,
      };
    }

    await response.body?.cancel();
    const delay = retryAfterMs ?? backoffBaseMs * 2 ** attempt;
    logger.warn(
      { url, status: response.status, attempt: attempt + 1, delay },
      "Retrying Mapas request",
    );
    await sleep(delay);
  }
}

async function getJson(
  fetcher: MapasFetcher,
  url: string,
): Promise<MapasFetchResponse> {
  try {
    return await fetcher(url);
  } catch (error) {
    if (error instanceof MapasClientError) throw error;
    throw transportMapasError(error, url);
  }
}

async function listPages(
  baseUrl: string,
  params: Record<string, string>,
  fetcher: MapasFetcher,
  maxPages: number,
): Promise<{
  records: MapasOpportunity[];
  pagesRead: number;
  truncated: boolean;
}> {
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
      throw httpMapasError(response.status, url, response.retryAfterMs ?? null);
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
  options: { fetcher?: MapasFetcher; maxPages?: number } = {},
): Promise<FetchOpportunitiesResult> {
  const fetcher = options.fetcher ?? defaultMapasFetch;
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
  const keywordErrors: unknown[] = [];
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
      if (
        error instanceof MapasClientError &&
        [
          "blocked",
          "rate_limited",
          "tls_expired",
          "tls_name_mismatch",
          "tls_self_signed",
          "tls_untrusted_ca",
          "tls_incomplete_chain",
          "tls_pin_mismatch",
        ].includes(error.kind)
      ) {
        throw error;
      }
      keywordErrors.push(error);
      logger.error(
        { err: error, installationId: installation.id, keyword },
        "Mapas Culturais keyword search failed",
      );
    }
  }
  if (datedRecords.length === 0 && keywordErrors.length === KEYWORDS.length) {
    const first = keywordErrors[0];
    if (first instanceof Error) throw first;
    throw new MapasClientError(
      "Mapas Culturais keyword search failed",
      0,
      "network",
    );
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
      error instanceof Error
        ? error.message
        : "A listagem de fluxo contínuo falhou";
    logger.error(
      { err: error, installationId: installation.id },
      "Continuous-flow listing failed; dated opportunities are kept",
    );
    return {
      records: [] as MapasOpportunity[],
      pagesRead: 0,
      truncated: false,
    };
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
    keywordErrors.length > 0
      ? keywordErrors
          .map((error) =>
            error instanceof Error ? error.message : String(error),
          )
          .join(" ")
      : null,
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
}
