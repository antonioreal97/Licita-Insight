import { logger } from "../lib/logger";
import { timeoutSignal } from "../lib/http-timeout";
import { fetch as undiciFetch } from "undici";
import type { MapasInstallation } from "./cultural-installations";
import {
  httpMapasError,
  MapasClientError,
  transportMapasError,
} from "./mapas-errors";
import { parseMapasListing } from "./mapas-response";
import { dispatcherForUrl } from "./mapas-tls";
import {
  mapOpportunity,
  type MapasOpportunity,
  type OpportunityDraft,
} from "./opportunity-map";

/**
 * Areas (`terms`), type and origin (`ownerEntity`) come in the same listing; no extra request per call.
 * `owner.type` says whether the publisher is a person (1, "Individual") or an organization (2, "Coletivo"):
 * the name of a person is not stored. No contact, document or address field of an agent is ever requested.
 */
const RICH_SELECT =
  "id,name,shortDescription,registrationFrom,registrationTo,singleUrl,continuousFlow,type,terms,parent,isModel,owner.{id,name,type},ownerEntity.{id,name,type}";
/** Fields every Mapas version answers. Used when an install rejects the rich selection. */
const BASIC_SELECT =
  "id,name,shortDescription,registrationFrom,registrationTo,singleUrl,owner.{id,name,type}";
const PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 20;
/** A longer `Retry-After` is honored by leaving the install for the next cycle, not by holding the run. */
const MAX_RETRY_WAIT_MS = 60_000;

export const MAPAS_USER_AGENT = `PardalDigital/${process.env.npm_package_version ?? "0.0.0"} (+https://pardaldigital.com; contato@pardaldigital.com)`;

export { MapasClientError } from "./mapas-errors";

export type FetchOpportunitiesResult = {
  drafts: OpportunityDraft[];
  pagesRead: number;
  /** False when the listing stopped early (page cap, a broken later page) or was narrowed by a keyword. */
  complete: boolean;
  warning: string | null;
};

export type MapasFetchResponse = {
  status: number;
  body: string;
  metadata: string | null;
  contentType?: string | null;
  retryAfterMs?: number | null;
};

export type MapasFetcher = (url: string) => Promise<MapasFetchResponse>;

export type FetchOpportunitiesOptions = {
  fetcher?: MapasFetcher;
  maxPages?: number;
  /** Extra calendar days before today, for backfills. The daily run collects calls that close today or later. */
  lookbackDays?: number;
  /** Optional `@keyword` narrowing, kept for one-off runs. The daily collection sends none. */
  keyword?: string;
};

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
  const minimumDelay = positiveInteger("CULTURE_PAGE_DELAY_MS", 1_000);
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

/** First day of a window of `days` calendar days that ends today in Brasília. `days = 1` is today. */
export const lookbackStart = (now: Date, days: number): string =>
  addCalendarDays(saoPauloDate(now), -(days - 1));

const query = (params: Record<string, string>): string =>
  Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");

const reportedPages = (metadata: string | null): number | null => {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as { numPages?: unknown };
    return typeof parsed.numPages === "number" && parsed.numPages >= 0
      ? parsed.numPages
      : null;
  } catch {
    return null;
  }
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
      headers: { Accept: "application/json", "User-Agent": MAPAS_USER_AGENT },
      signal: timeoutSignal("MAPAS_HTTP_TIMEOUT_MS", 30_000),
    });
    const retryAfterMs = retryAfterMilliseconds(
      response.headers.get("Retry-After"),
    );
    const retriable = response.status === 429 || response.status >= 500;
    const waitTooLong =
      retryAfterMs !== null && retryAfterMs > MAX_RETRY_WAIT_MS;
    if (!retriable || attempt >= retries || waitTooLong) {
      return {
        status: response.status,
        body: await response.text(),
        metadata: response.headers.get("API-Metadata"),
        contentType: response.headers.get("Content-Type"),
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

type Listing = {
  records: MapasOpportunity[];
  pagesRead: number;
  complete: boolean;
  warnings: string[];
};

const recordKey = (record: MapasOpportunity): string => String(record.id);

/**
 * Reads the listing page by page. The first page decides whether the install answers at all, so its failure
 * is thrown. A later page that fails keeps what was already read and marks the listing incomplete.
 */
async function listPages(
  baseUrl: string,
  params: Record<string, string>,
  fetcher: MapasFetcher,
  maxPages: number,
): Promise<Listing> {
  const root = baseUrl.replace(/\/$/, "");
  const records: MapasOpportunity[] = [];
  const seen = new Set<string>();
  const warnings: string[] = [];
  let pagesRead = 0;

  for (let page = 1; ; page += 1) {
    if (pagesRead >= maxPages) {
      warnings.push(`A listagem parou no limite de ${maxPages} páginas.`);
      return { records, pagesRead, complete: false, warnings };
    }
    const url = `${root}/api/opportunity/find?${query({ ...params, "@page": String(page) })}`;
    let batch: MapasOpportunity[];
    let metadata: string | null;
    try {
      const response = await getJson(fetcher, url);
      pagesRead += 1;
      if (response.status !== 200) {
        throw httpMapasError(
          response.status,
          url,
          response.retryAfterMs ?? null,
        );
      }
      const parsed = parseMapasListing(response, url);
      if (parsed.recovered) {
        logger.warn(
          { url },
          "Mapas Culturais printed noise before the JSON listing; it was skipped",
        );
      }
      batch = parsed.records;
      metadata = response.metadata;
    } catch (error) {
      if (page === 1) throw error;
      warnings.push(
        `A página ${page} da listagem falhou e as anteriores foram mantidas: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { records, pagesRead, complete: false, warnings };
    }

    const fresh = batch.filter((record) => !seen.has(recordKey(record)));
    for (const record of fresh) seen.add(recordKey(record));
    records.push(...fresh);

    // Past the last page the API answers `[]`. An install that ignores `@page` repeats the same records.
    if (batch.length === 0 || fresh.length === 0) break;
    const total = reportedPages(metadata);
    if (total !== null ? page >= total : batch.length < PAGE_SIZE) break;
  }

  return { records, pagesRead, complete: true, warnings };
}

const isSelectionRejection = (error: unknown): boolean =>
  error instanceof MapasClientError &&
  (error.kind === "invalid_response" ||
    (error.kind === "http" && (error.status === 400 || error.status >= 500)));

/** Reads a listing with the rich selection and, if the install rejects it, again with the basic fields. */
async function listWithFallback(
  installation: MapasInstallation,
  paramsFor: (select: string) => Record<string, string>,
  fetcher: MapasFetcher,
  maxPages: number,
): Promise<Listing> {
  try {
    return await listPages(
      installation.baseUrl,
      paramsFor(RICH_SELECT),
      fetcher,
      maxPages,
    );
  } catch (error) {
    if (!isSelectionRejection(error)) throw error;
    logger.warn(
      { err: error, installationId: installation.id },
      "Mapas Culturais rejected the rich selection; retrying with basic fields",
    );
    let listing: Listing;
    try {
      listing = await listPages(
        installation.baseUrl,
        paramsFor(BASIC_SELECT),
        fetcher,
        maxPages,
      );
    } catch {
      // The first answer is the one that says what the install returned.
      throw error;
    }
    listing.warnings.unshift(
      "A instalação não respondeu à consulta com áreas e tipo; as chamadas foram coletadas com os campos básicos.",
    );
    return listing;
  }
}

/**
 * Every call of an install whose registration closes today or later. Continuous-flow calls are in the same
 * listing: Mapas stores them with a far-future `registrationTo`. Filtering on `continuousFlow` itself is not
 * possible with a boolean: the column is a datetime and `EQ(true)` makes the install answer an HTML error page.
 */
export async function fetchOpenOpportunities(
  installation: MapasInstallation,
  now: Date,
  options: FetchOpportunitiesOptions = {},
): Promise<FetchOpportunitiesResult> {
  const fetcher = options.fetcher ?? defaultMapasFetch;
  const maxPages =
    options.maxPages ?? positiveInteger("CULTURE_MAX_PAGES", DEFAULT_MAX_PAGES);
  const since = lookbackStart(now, options.lookbackDays ?? 1);
  const keyword = options.keyword?.trim();
  const paramsFor = (select: string): Record<string, string> => ({
    registrationTo: `GTE(${since})`,
    "@select": select,
    "@order": "registrationTo ASC",
    "@limit": String(PAGE_SIZE),
    ...(keyword ? { "@keyword": keyword } : {}),
  });

  const listing = await listWithFallback(
    installation,
    paramsFor,
    fetcher,
    maxPages,
  );

  const seen = new Set<string>();
  const drafts: OpportunityDraft[] = [];
  for (const record of listing.records) {
    const draft = mapOpportunity(record, installation, now);
    if (!draft || seen.has(draft.id)) continue;
    seen.add(draft.id);
    drafts.push(draft);
  }

  if (!listing.complete) {
    logger.error(
      {
        installationId: installation.id,
        pagesRead: listing.pagesRead,
        warnings: listing.warnings,
      },
      "Mapas Culturais listing is incomplete",
    );
  }

  return {
    drafts,
    pagesRead: listing.pagesRead,
    complete: listing.complete && !keyword,
    warning: listing.warnings.length > 0 ? listing.warnings.join(" ") : null,
  };
}

/** Most ids one request asks for: under a page, so the answer never needs a second request. */
export const MAX_IDS_PER_REQUEST = 40;

/**
 * The calls of an install with the given ids, as the source publishes them today. A call the install no
 * longer publishes is simply absent from the answer. Used to re-read the owner of rows stored before the
 * agent type was collected.
 */
export async function fetchOpportunitiesByIds(
  installation: MapasInstallation,
  externalIds: string[],
  now: Date,
  options: { fetcher?: MapasFetcher } = {},
): Promise<Map<string, OpportunityDraft>> {
  const ids = [...new Set(externalIds.filter((id) => /^\d+$/.test(id)))];
  if (ids.length > MAX_IDS_PER_REQUEST) {
    throw new Error(
      `fetchOpportunitiesByIds accepts at most ${MAX_IDS_PER_REQUEST} ids, received ${ids.length}`,
    );
  }
  const drafts = new Map<string, OpportunityDraft>();
  if (ids.length === 0) return drafts;

  const listing = await listWithFallback(
    installation,
    (select) => ({
      id: `IN(${ids.join(",")})`,
      "@select": select,
      "@limit": String(PAGE_SIZE),
    }),
    options.fetcher ?? defaultMapasFetch,
    1,
  );
  if (!listing.complete) {
    throw new Error(
      `${installation.name} não respondeu só às chamadas pedidas: ${listing.warnings.join(" ")}`,
    );
  }
  const asked = new Set(ids);
  for (const record of listing.records) {
    const draft = mapOpportunity(record, installation, now);
    // An install that ignores the id filter would answer with other calls.
    if (draft && asked.has(draft.externalId))
      drafts.set(draft.externalId, draft);
  }
  return drafts;
}
