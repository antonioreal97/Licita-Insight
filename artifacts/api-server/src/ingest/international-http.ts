import { FUNDING_USER_AGENT, robotsAllows } from "./funding-client";

/** The same honest identity of every other collector: `PardalDigital/<version> (+site; contact)`. */
export const INTERNATIONAL_USER_AGENT = FUNDING_USER_AGENT;

export type InternationalRequest = {
  url: string;
  method?: "GET" | "POST";
  /** Parts of a `multipart/form-data` body, each sent as an `application/json` file part. */
  jsonParts?: Record<string, unknown>;
  /** A source that authorized one exact identity gets it instead of `INTERNATIONAL_USER_AGENT`. */
  userAgent?: string;
};

export type InternationalResponse = {
  status: number;
  retryAfter: string | null;
  body: string;
};

export type InternationalFetch = (
  request: InternationalRequest,
) => Promise<InternationalResponse>;

/** A page of 100 Funding & Tenders topics is about 4 MB. */
const MAX_BODY_BYTES = 32 * 1024 * 1024;

export const defaultInternationalFetch: InternationalFetch = async (
  request,
) => {
  let body: FormData | undefined;
  if (request.jsonParts) {
    body = new FormData();
    for (const [name, value] of Object.entries(request.jsonParts))
      body.append(
        name,
        new Blob([JSON.stringify(value)], { type: "application/json" }),
        `${name}.json`,
      );
  }
  const response = await fetch(request.url, {
    method: request.method ?? "GET",
    headers: {
      "user-agent": request.userAgent ?? INTERNATIONAL_USER_AGENT,
      accept: "application/json,text/plain;q=0.9,*/*;q=0.5",
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(
      `${new URL(request.url).host} anunciou ${declared} bytes, acima do limite`,
    );
  }
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES)
    throw new Error(
      `${new URL(request.url).host} respondeu um corpo acima do limite`,
    );
  return {
    status: response.status,
    retryAfter: response.headers.get("retry-after"),
    body: text,
  };
};

export type Wait = (milliseconds: number) => Promise<void>;

export const defaultWait: Wait = (milliseconds) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Spaces consecutive requests by at least `delayMs`. */
export const pacedInternational = (
  fetcher: InternationalFetch,
  delayMs: number,
  wait: Wait = defaultWait,
): InternationalFetch => {
  let last = 0;
  return async (request) => {
    const pause = last + delayMs - Date.now();
    if (delayMs > 0 && pause > 0) await wait(pause);
    try {
      return await fetcher(request);
    } finally {
      last = Date.now();
    }
  };
};

export class InternationalHttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`${new URL(url).host} respondeu HTTP ${status}`);
    this.name = "InternationalHttpError";
  }
}

/** The source asked for a pause longer than one run should wait; it is read again on the next cycle. */
export class InternationalRateLimitError extends Error {
  constructor(
    readonly url: string,
    readonly retryAfterMs: number | null,
  ) {
    super(
      retryAfterMs === null
        ? `${new URL(url).host} limitou as requisições`
        : `${new URL(url).host} pediu ${Math.ceil(retryAfterMs / 1_000)} s de espera (Retry-After)`,
    );
    this.name = "InternationalRateLimitError";
  }
}

export class InternationalBlockedByRobotsError extends Error {
  constructor(readonly url: string) {
    super("A fonte proíbe coleta automatizada deste endereço no robots.txt.");
    this.name = "InternationalBlockedByRobotsError";
  }
}

/** `Retry-After` as seconds or as an HTTP date. Anything else is `null`. */
export const retryAfterMs = (value: string | null, now: Date): number | null => {
  const text = value?.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text) * 1_000;
  const date = Date.parse(text);
  return Number.isNaN(date) ? null : Math.max(0, date - now.getTime());
};

export const MAX_RETRY_AFTER_MS = 60_000;

/**
 * One JSON document. A 429 or 503 is retried once, after the pause the source asked for; a pause above
 * `MAX_RETRY_AFTER_MS`, or a second refusal, leaves the source for the next cycle. Nothing else is retried.
 */
export const requestJson = async (
  fetcher: InternationalFetch,
  request: InternationalRequest,
  options: { wait?: Wait; now?: () => Date } = {},
): Promise<unknown> => {
  const wait = options.wait ?? defaultWait;
  const now = options.now ?? (() => new Date());
  let response = await fetcher(request);
  if (response.status === 429 || response.status === 503) {
    const pause = retryAfterMs(response.retryAfter, now());
    if (pause === null || pause > MAX_RETRY_AFTER_MS)
      throw new InternationalRateLimitError(request.url, pause);
    await wait(pause);
    response = await fetcher(request);
    if (response.status === 429 || response.status === 503)
      throw new InternationalRateLimitError(
        request.url,
        retryAfterMs(response.retryAfter, now()),
      );
  }
  if (response.status !== 200)
    throw new InternationalHttpError(request.url, response.status);
  try {
    return JSON.parse(response.body);
  } catch {
    throw new Error(`${new URL(request.url).host} respondeu JSON inválido`);
  }
};

/**
 * Reads each robots.txt once per run. A missing file (404/410) places no restriction; any other answer
 * leaves the source out of this run instead of assuming permission.
 */
export const internationalRobotsGate = (
  fetcher: InternationalFetch,
  robotsUrl: string,
) => {
  let body: Promise<string | null> | undefined;
  return async (url: string): Promise<void> => {
    body ??= fetcher({ url: robotsUrl }).then((response) => {
      if (response.status === 200) return response.body;
      if (response.status === 404 || response.status === 410) return null;
      throw new InternationalHttpError(robotsUrl, response.status);
    });
    const robots = await body;
    if (robots !== null && !robotsAllows(robots, url))
      throw new InternationalBlockedByRobotsError(url);
  };
};
