import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull, ne, or, sql, isNull } from "drizzle-orm";
import {
  culturalOpportunitiesTable,
  db,
  type OpportunityDocument,
  type OpportunityNoticeOrigin,
  type OpportunitySource,
} from "@workspace/db";
import { extractDocuments } from "../ai/document-extractor";
import { logger } from "../lib/logger";
import {
  applicationOnSourcePage,
  canonicalLink,
  CHANGE_TITLE,
  DOCUMENT_URL,
  noticeDocuments,
  normalizedTitle,
  type NoticeDocument,
  findApplicationLink,
  findRegistrationPeriod,
  readableTextFromHtml,
  type ApplicationLink,
  type NoticePeriod,
} from "./application-extract";
import { linksFromHtml } from "./funding-parsers";
import {
  BlockedByRobotsError,
  FEDERAL_USER_AGENT,
  FederalHttpError,
  paced,
  robotsGate,
  textOf,
  type FederalFetch,
  type FederalResponse,
} from "./federal-http";

/**
 * Fills "where to apply" and, when the source gives no dates, the registration period, reading the call
 * page and its official documents without AI. It runs inside the scheduled collections, after they store
 * the calls, and never fails them. A call is read again only when its page or document list changes, or
 * after `recheckAfterMs`; each run reads at most `maxCalls` calls, slowly, and only what robots.txt allows.
 */

/** Bump when the extraction changes, so every call is read again once. */
export const APPLICATION_READER_VERSION = 1;

/** Sources whose call pages and documents are read. The others are answered by a rule or not at all. */
const READ_SOURCES: readonly OpportunitySource[] = [
  "capes",
  "cnpq",
  "finep",
  "minc",
  "funarte",
  "salic",
];

export type ApplicationEnrichmentOptions = {
  sources: readonly OpportunitySource[];
  now: Date;
  fetcher?: FederalFetch;
  delayMs?: number;
  /** Calls whose page and documents are read in this run. */
  maxCalls?: number;
  /** Documents read per call, besides its page. */
  maxDocuments?: number;
  maxDocumentBytes?: number;
  maxDocumentPages?: number;
  recheckAfterMs?: number;
};

export type ApplicationEnrichmentResult = {
  /** Calls answered by the source rule (Mapas, Transferegov, Funding & Tenders) without any request. */
  byRule: number;
  /** Calls whose page or documents were read in this run. */
  read: number;
  found: number;
  dated: number;
  /** Calls left for a later run by the per-run ceiling. */
  deferred: number;
  requests: number;
  errors: string[];
};

const MAX_REDIRECTS = 3;

/** Reads one address with a size ceiling and a timeout; redirects are returned, not followed. */
export const limitedFetch =
  (maxBytes: number, timeoutMs = 30_000): FederalFetch =>
  async (url) => {
    const response = await fetch(url, {
      headers: {
        "user-agent": FEDERAL_USER_AGENT,
        accept:
          "text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document;q=0.9,*/*;q=0.5",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const location = response.headers.get("location");
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > maxBytes) {
      await response.body?.cancel();
      throw new Error(
        `${new URL(url).host} anunciou ${declared} bytes, acima do limite`,
      );
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error(
            `${new URL(url).host} respondeu um corpo acima do limite`,
          );
        }
        chunks.push(value);
      }
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      status: response.status,
      location: location ? new URL(location, url).toString() : null,
      contentType: response.headers.get("content-type"),
      body,
    };
  };

/** What a reading depends on: the extraction version, the page and the documents the source lists. */
export const applicationInputHash = (
  sourceUrl: string | null,
  documents: OpportunityDocument[],
): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        APPLICATION_READER_VERSION,
        sourceUrl,
        documents.map((document) => document.url).sort(),
      ]),
    )
    .digest("hex")
    .slice(0, 32);

type Reading = {
  application:
    | (ApplicationLink & {
        origin: OpportunityNoticeOrigin;
        documentTitle: string | null;
      })
    | null;
  period:
    | (NoticePeriod & {
        origin: OpportunityNoticeOrigin;
        documentTitle: string | null;
      })
    | null;
};

type Row = {
  id: string;
  source: OpportunitySource;
  sourceUrl: string | null;
  documents: OpportunityDocument[];
  registrationFrom: Date | null;
  registrationTo: Date | null;
  applicationUrl: string | null;
  applicationCheckedAt: Date | null;
  applicationInputHash: string | null;
};

/** Reads one call: its page first, then its notice documents until the page's gaps are filled. */
export const readCall = async (
  row: Pick<
    Row,
    "sourceUrl" | "documents" | "registrationFrom" | "registrationTo"
  >,
  get: (url: string) => Promise<FederalResponse>,
  options: { maxDocuments: number; maxDocumentPages: number },
): Promise<Reading> => {
  const reading: Reading = { application: null, period: null };
  const needsDates = !row.registrationFrom && !row.registrationTo;
  const exclude = [
    ...(row.sourceUrl ? [row.sourceUrl] : []),
    ...row.documents.map((document) => document.url),
  ];
  let pageLinks: NoticeDocument[] = [];
  const pageIsDocument = row.sourceUrl
    ? DOCUMENT_URL.test(row.sourceUrl)
    : true;
  if (row.sourceUrl && !pageIsDocument) {
    const response = await get(row.sourceUrl);
    const html = textOf(response);
    const text = readableTextFromHtml(html, row.sourceUrl);
    const link = findApplicationLink(text, exclude);
    if (link)
      reading.application = {
        ...link,
        origin: "source_page",
        documentTitle: null,
      };
    if (needsDates) {
      const period = findRegistrationPeriod(text);
      if (period)
        reading.period = {
          ...period,
          origin: "source_page",
          documentTitle: null,
        };
    }
    const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html;
    pageLinks = linksFromHtml(main, row.sourceUrl);
  }
  if (reading.application && (reading.period || !needsDates)) return reading;

  const listed =
    pageIsDocument &&
    row.sourceUrl &&
    !row.documents.some((d) => d.url === row.sourceUrl)
      ? [
          ...row.documents,
          { title: "Edital", url: row.sourceUrl, mediaType: null },
        ]
      : row.documents;
  const documents = noticeDocuments(listed, pageLinks, options.maxDocuments);
  const periods: Array<NoticePeriod & { title: string }> = [];
  let unreadChange = false;
  for (const document of documents) {
    let text: string;
    try {
      const response = await get(document.url);
      const extracted = await extractDocuments(
        response.body,
        document.title,
        options.maxDocumentPages,
      );
      text = extracted.map((part) => part.pages.join("\n")).join("\n");
    } catch (error) {
      if (CHANGE_TITLE.test(normalizedTitle(document.title)))
        unreadChange = true;
      logger.debug(
        { err: error, url: document.url },
        "Notice document could not be read",
      );
      continue;
    }
    if (!reading.application) {
      const link = findApplicationLink(text, [...exclude, document.url]);
      if (link)
        reading.application = {
          ...link,
          origin: "document",
          documentTitle: document.title,
        };
    }
    if (needsDates && !reading.period) {
      const period = findRegistrationPeriod(text);
      if (period) periods.push({ ...period, title: document.title });
    }
  }
  // The notice and its amendments must state one period; an amendment left unread could have moved it.
  if (needsDates && !reading.period && periods.length > 0 && !unreadChange) {
    const [first] = periods;
    const agree = periods.every(
      (period) =>
        period.from?.getTime() === first!.from?.getTime() &&
        period.to?.getTime() === first!.to?.getTime(),
    );
    if (agree)
      reading.period = {
        from: first!.from,
        to: first!.to,
        origin: "document",
        documentTitle: first!.title,
      };
  }
  return reading;
};

/** Follows a few redirects by hand, asking each host's robots.txt first. */
const politeGetter = (fetcher: FederalFetch) => {
  const gates = new Map<string, ReturnType<typeof robotsGate>>();
  const counter = { requests: 0 };
  const counted: FederalFetch = (url) => {
    counter.requests += 1;
    return fetcher(url);
  };
  const get = async (start: string): Promise<FederalResponse> => {
    let url = start;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const target = new URL(url);
      if (!/^https?:$/.test(target.protocol))
        throw new Error("Endereço sem HTTP");
      let gate = gates.get(target.origin);
      if (!gate) {
        gate = robotsGate(counted, [`${target.origin}/robots.txt`]);
        gates.set(target.origin, gate);
      }
      await gate(url);
      const response = await counted(url);
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.location
      ) {
        url = response.location;
        continue;
      }
      if (response.status !== 200)
        throw new FederalHttpError(url, response.status);
      return response;
    }
    throw new Error("Redirecionamentos demais");
  };
  return { get, counter };
};

const linkColumns = (
  application: Reading["application"],
): Pick<
  typeof culturalOpportunitiesTable.$inferInsert,
  | "applicationUrl"
  | "applicationPlatform"
  | "applicationLabel"
  | "applicationSource"
  | "applicationDocumentTitle"
> => ({
  applicationUrl: application?.url ?? null,
  applicationPlatform: application?.platform ?? null,
  applicationLabel: application?.label ?? null,
  applicationSource: application?.origin ?? null,
  applicationDocumentTitle: application?.documentTitle ?? null,
});

/** Mapas Culturais: every call takes its applications on its own page, so the page is the answer. */
const markMapasCalls = async (now: Date): Promise<number> => {
  const rows = await db
    .update(culturalOpportunitiesTable)
    .set({
      applicationUrl: sql`${culturalOpportunitiesTable.sourceUrl}`,
      applicationPlatform: "mapas-culturais",
      applicationLabel: "Mapas Culturais",
      applicationSource: "source_page",
      applicationDocumentTitle: null,
      applicationCheckedAt: now,
    })
    .where(
      and(
        eq(culturalOpportunitiesTable.source, "mapas"),
        isNotNull(culturalOpportunitiesTable.sourceUrl),
        or(
          isNull(culturalOpportunitiesTable.applicationUrl),
          ne(
            culturalOpportunitiesTable.applicationUrl,
            culturalOpportunitiesTable.sourceUrl,
          ),
        ),
      ),
    )
    .returning({ id: culturalOpportunitiesTable.id });
  return rows.length;
};

export async function enrichOpportunityApplications(
  options: ApplicationEnrichmentOptions,
): Promise<ApplicationEnrichmentResult> {
  const now = options.now;
  const maxCalls =
    options.maxCalls ?? Number(process.env.APPLICATION_READ_MAX_CALLS ?? 20);
  const recheckAfterMs = options.recheckAfterMs ?? 7 * 24 * 60 * 60 * 1_000;
  const result: ApplicationEnrichmentResult = {
    byRule: 0,
    read: 0,
    found: 0,
    dated: 0,
    deferred: 0,
    requests: 0,
    errors: [],
  };
  const sources = [...new Set(options.sources)];
  if (sources.includes("mapas")) result.byRule += await markMapasCalls(now);
  const others = sources.filter((source) => source !== "mapas");
  if (others.length === 0) return result;

  const rows: Row[] = await db
    .select({
      id: culturalOpportunitiesTable.id,
      source: culturalOpportunitiesTable.source,
      sourceUrl: culturalOpportunitiesTable.sourceUrl,
      documents: culturalOpportunitiesTable.documents,
      registrationFrom: culturalOpportunitiesTable.registrationFrom,
      registrationTo: culturalOpportunitiesTable.registrationTo,
      applicationUrl: culturalOpportunitiesTable.applicationUrl,
      applicationCheckedAt: culturalOpportunitiesTable.applicationCheckedAt,
      applicationInputHash: culturalOpportunitiesTable.applicationInputHash,
    })
    .from(culturalOpportunitiesTable)
    .where(
      and(
        inArray(culturalOpportunitiesTable.source, others),
        ne(culturalOpportunitiesTable.status, "closed"),
      ),
    )
    .orderBy(
      sql`${culturalOpportunitiesTable.applicationCheckedAt} asc nulls first`,
      sql`${culturalOpportunitiesTable.registrationTo} asc nulls last`,
      culturalOpportunitiesTable.id,
    );

  const toRead: Row[] = [];
  for (const row of rows) {
    const hash = applicationInputHash(row.sourceUrl, row.documents);
    const rule = applicationOnSourcePage(row.source, row.sourceUrl);
    if (rule) {
      if (row.applicationUrl === rule.url && row.applicationInputHash === hash)
        continue;
      await db
        .update(culturalOpportunitiesTable)
        .set({
          ...linkColumns({
            ...rule,
            origin: "source_page",
            documentTitle: null,
          }),
          applicationCheckedAt: now,
          applicationInputHash: hash,
        })
        .where(eq(culturalOpportunitiesTable.id, row.id));
      result.byRule += 1;
      continue;
    }
    if (!READ_SOURCES.includes(row.source)) continue;
    const fresh =
      row.applicationInputHash === hash &&
      row.applicationCheckedAt !== null &&
      now.getTime() - row.applicationCheckedAt.getTime() < recheckAfterMs;
    if (!fresh) toRead.push(row);
  }
  result.deferred = Math.max(0, toRead.length - maxCalls);
  if (toRead.length === 0) return result;

  const fetcher = paced(
    options.fetcher ??
      limitedFetch(options.maxDocumentBytes ?? 15 * 1024 * 1024),
    options.delayMs ?? Number(process.env.APPLICATION_READ_DELAY_MS ?? 1_000),
  );
  const { get: politeGet, counter } = politeGetter(fetcher);
  // One download per address in the run: several calls often share the same notice.
  const cache = new Map<string, Promise<FederalResponse>>();
  const get = (url: string) => {
    const key = canonicalLink(url);
    let response = cache.get(key);
    if (!response) {
      response = politeGet(url);
      cache.set(key, response);
    }
    return response;
  };

  for (const row of toRead.slice(0, maxCalls)) {
    const hash = applicationInputHash(row.sourceUrl, row.documents);
    try {
      const reading = await readCall(row, get, {
        maxDocuments: options.maxDocuments ?? 3,
        maxDocumentPages: options.maxDocumentPages ?? 150,
      });
      await db
        .update(culturalOpportunitiesTable)
        .set({
          ...linkColumns(reading.application),
          noticeRegistrationFrom: reading.period?.from ?? null,
          noticeRegistrationTo: reading.period?.to ?? null,
          noticeDatesSource: reading.period?.origin ?? null,
          noticeDatesDocumentTitle: reading.period?.documentTitle ?? null,
          applicationCheckedAt: now,
          applicationInputHash: hash,
        })
        .where(eq(culturalOpportunitiesTable.id, row.id));
      result.read += 1;
      if (reading.application) result.found += 1;
      if (reading.period) result.dated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Forbidden by robots.txt or gone (4xx): recorded as read, so it is not asked again before the
      // recheck. A timeout or a 5xx is left unread and retried by the next run.
      const permanent =
        error instanceof BlockedByRobotsError ||
        (error instanceof FederalHttpError &&
          error.status >= 400 &&
          error.status < 500);
      if (permanent) {
        await db
          .update(culturalOpportunitiesTable)
          .set({ applicationCheckedAt: now, applicationInputHash: hash })
          .where(eq(culturalOpportunitiesTable.id, row.id));
      }
      result.errors.push(`${row.id}: ${message}`);
    }
  }
  result.requests = counter.requests;
  return result;
}

/** The step as the collections call it: its outcome goes to the run details, and it never throws. */
export async function readApplicationsSafely(
  sources: readonly OpportunitySource[],
  now: Date,
  options: Omit<ApplicationEnrichmentOptions, "sources" | "now"> = {},
): Promise<ApplicationEnrichmentResult | { error: string }> {
  if (process.env.OPPORTUNITY_APPLICATION_READING === "false")
    return {
      error:
        "Leitura de inscrições desligada (OPPORTUNITY_APPLICATION_READING=false).",
    };
  try {
    return await enrichOpportunityApplications({ ...options, sources, now });
  } catch (error) {
    logger.warn(
      { err: error, sources },
      "Opportunity application reading was skipped",
    );
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export type ApplicationReader = typeof readApplicationsSafely;
