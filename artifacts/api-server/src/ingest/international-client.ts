import {
  EU_FT_PAGE_SIZE,
  EU_FT_ROBOTS_URL,
  euFacetRequest,
  euSearchRequest,
  parseEuFacets,
  parseEuPage,
  type EuLabels,
} from "./eu-ft-parsers";
import type {
  InternationalOpportunityDraft,
  InternationalSource,
} from "./international-draft";
import {
  defaultInternationalFetch,
  defaultWait,
  InternationalBlockedByRobotsError,
  InternationalRateLimitError,
  internationalRobotsGate,
  pacedInternational,
  requestJson,
  type InternationalFetch,
  type Wait,
} from "./international-http";
import {
  parseWorldBankPage,
  WORLD_BANK_PAGE_SIZE,
  WORLD_BANK_ROBOTS_URL,
  worldBankPageUrl,
} from "./worldbank-parsers";

export const INTERNATIONAL_SOURCES = [
  "worldbank",
  "eu_ft",
] as const satisfies readonly InternationalSource[];

export type InternationalSourceResult = {
  source: InternationalSource;
  outcome: "ok" | "partial" | "failed" | "blocked_by_robots" | "rate_limited";
  /** True when the listing was read to the end, so what is missing from it can be closed. */
  complete: boolean;
  requests: number;
  /** Calls the source says the query matches. */
  listed: number;
  /** Rows read and left out (not a call, cancelled, deadline past). */
  skipped: number;
  count: number;
  message: string | null;
  drafts: InternationalOpportunityDraft[];
};

type SourceContext = {
  fetcher: InternationalFetch;
  wait: Wait;
  now: Date;
  maxPages: number;
};

type Listing = {
  drafts: InternationalOpportunityDraft[];
  listed: number;
  skipped: number;
  complete: boolean;
  message: string | null;
};

/** Reads pages until the listing ends. A page that fails keeps what was read and marks it incomplete. */
const readPages = async (
  readPage: (index: number) => Promise<{
    total: number;
    rows: number;
    skipped: number;
    drafts: InternationalOpportunityDraft[];
  }>,
  pageSize: number,
  maxPages: number,
): Promise<Listing> => {
  const drafts = new Map<string, InternationalOpportunityDraft>();
  let listed = 0;
  let skipped = 0;
  for (let index = 0; index < maxPages; index += 1) {
    let page;
    try {
      page = await readPage(index);
    } catch (error) {
      if (index === 0) throw error;
      return {
        drafts: [...drafts.values()],
        listed,
        skipped,
        complete: false,
        message: `Página ${index + 1} falhou: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    listed = page.total;
    skipped += page.skipped;
    for (const draft of page.drafts)
      if (!drafts.has(draft.externalId)) drafts.set(draft.externalId, draft);
    if (page.rows < pageSize || (index + 1) * pageSize >= page.total)
      return {
        drafts: [...drafts.values()],
        listed,
        skipped,
        complete: true,
        message: null,
      };
  }
  return {
    drafts: [...drafts.values()],
    listed,
    skipped,
    complete: false,
    message: `Listagem maior que o teto de ${maxPages} páginas`,
  };
};

const collectWorldBank = async (context: SourceContext): Promise<Listing> => {
  const allowed = internationalRobotsGate(
    context.fetcher,
    WORLD_BANK_ROBOTS_URL,
  );
  return await readPages(
    async (index) => {
      const url = worldBankPageUrl(index * WORLD_BANK_PAGE_SIZE, context.now);
      await allowed(url);
      return parseWorldBankPage(
        await requestJson(context.fetcher, { url }, { wait: context.wait }),
        context.now,
      );
    },
    WORLD_BANK_PAGE_SIZE,
    context.maxPages,
  );
};

const collectEuFt = async (context: SourceContext): Promise<Listing> => {
  const allowed = internationalRobotsGate(context.fetcher, EU_FT_ROBOTS_URL);
  const facets = euFacetRequest();
  await allowed(facets.url);
  let labels: EuLabels = new Map();
  let labelsMessage: string | null = null;
  try {
    labels = parseEuFacets(
      await requestJson(context.fetcher, facets, { wait: context.wait }),
    );
  } catch (error) {
    if (error instanceof InternationalRateLimitError) throw error;
    // Without the label tables the calls still enter; programme and zone names are just missing.
    labelsMessage = `Rótulos de programa indisponíveis: ${error instanceof Error ? error.message : String(error)}`;
  }
  const listing = await readPages(
    async (index) => {
      const request = euSearchRequest(index + 1);
      await allowed(request.url);
      return parseEuPage(
        await requestJson(context.fetcher, request, { wait: context.wait }),
        labels,
        context.now,
      );
    },
    EU_FT_PAGE_SIZE,
    context.maxPages,
  );
  return {
    ...listing,
    message:
      [listing.message, labelsMessage].filter(Boolean).join(" · ") || null,
  };
};

const collectors: Record<
  InternationalSource,
  (context: SourceContext) => Promise<Listing>
> = { worldbank: collectWorldBank, eu_ft: collectEuFt };

/** `INTERNATIONAL_SOURCES=worldbank` reads a single source. Unknown names are an error, not a silent skip. */
export const internationalSourcesFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): InternationalSource[] => {
  const raw = env.INTERNATIONAL_SOURCES?.trim();
  if (!raw) return [...INTERNATIONAL_SOURCES];
  const names = raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  for (const name of names)
    if (!(INTERNATIONAL_SOURCES as readonly string[]).includes(name))
      throw new Error(
        `INTERNATIONAL_SOURCES accepts ${INTERNATIONAL_SOURCES.join(", ")}; received "${name}"`,
      );
  return [...new Set(names)] as InternationalSource[];
};

const positiveInteger = (
  name: string,
  fallback: number,
  env: NodeJS.ProcessEnv,
): number => {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${name} must be a non-negative integer`);
  return value;
};

export type CollectInternationalOptions = {
  fetcher?: InternationalFetch;
  now?: Date;
  delayMs?: number;
  wait?: Wait;
  sources?: InternationalSource[];
  maxPages?: number;
};

/**
 * Reads the open calls of each international source from its public API. Each source fails on its own: a
 * blocked, rate-limited or broken source is reported and the others are still read.
 */
export const collectInternationalOnce = async (
  options: CollectInternationalOptions = {},
): Promise<InternationalSourceResult[]> => {
  const now = options.now ?? new Date();
  const wait = options.wait ?? defaultWait;
  const delayMs =
    options.delayMs ??
    positiveInteger("INTERNATIONAL_PAGE_DELAY_MS", 1_000, process.env);
  const maxPages =
    options.maxPages ??
    Math.max(1, positiveInteger("INTERNATIONAL_MAX_PAGES", 40, process.env));
  const sources = options.sources ?? internationalSourcesFromEnv();
  const results: InternationalSourceResult[] = [];

  for (const source of sources) {
    let requests = 0;
    const counted: InternationalFetch = async (request) => {
      requests += 1;
      return await (options.fetcher ?? defaultInternationalFetch)(request);
    };
    const fetcher = pacedInternational(counted, delayMs, wait);
    try {
      const listing = await collectors[source]({
        fetcher,
        wait,
        now,
        maxPages,
      });
      results.push({
        source,
        outcome: listing.complete ? "ok" : "partial",
        complete: listing.complete,
        requests,
        listed: listing.listed,
        skipped: listing.skipped,
        count: listing.drafts.length,
        message: listing.message,
        drafts: listing.drafts,
      });
    } catch (error) {
      results.push({
        source,
        outcome:
          error instanceof InternationalBlockedByRobotsError
            ? "blocked_by_robots"
            : error instanceof InternationalRateLimitError
              ? "rate_limited"
              : "failed",
        complete: false,
        requests,
        listed: 0,
        skipped: 0,
        count: 0,
        message: error instanceof Error ? error.message : String(error),
        drafts: [],
      });
    }
  }
  return results;
};
