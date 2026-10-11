import { FUNDING_USER_AGENT, robotsAllows } from "./funding-client";

/** One honest identity for every public source: `PardalDigital/<version> (+site; contact)`. */
export const FEDERAL_USER_AGENT = FUNDING_USER_AGENT;

export type FederalResponse = {
  status: number;
  /** Target of a redirect, already absolute. Redirects are never followed here. */
  location: string | null;
  contentType: string | null;
  body: Uint8Array;
};

export type FederalFetch = (url: string) => Promise<FederalResponse>;

/** The largest body read is the Transferegov programs archive (about 11 MB). */
const MAX_BODY_BYTES = 64 * 1024 * 1024;

export const defaultFederalFetch: FederalFetch = async (url) => {
  const response = await fetch(url, {
    headers: {
      "user-agent": FEDERAL_USER_AGENT,
      accept:
        "text/html,application/json,application/zip,text/plain;q=0.9,*/*;q=0.5",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  });
  const location = response.headers.get("location");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES)
    throw new Error(
      `${new URL(url).host} anunciou ${declared} bytes, acima do limite`,
    );
  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > MAX_BODY_BYTES)
    throw new Error(`${new URL(url).host} respondeu um corpo acima do limite`);
  return {
    status: response.status,
    location: location ? new URL(location, url).toString() : null,
    contentType: response.headers.get("content-type"),
    body,
  };
};

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Spaces consecutive requests by at least `delayMs`, whatever the source. */
export const paced = (fetcher: FederalFetch, delayMs: number): FederalFetch => {
  let last = 0;
  return async (url) => {
    const pause = last + delayMs - Date.now();
    if (delayMs > 0 && pause > 0) await wait(pause);
    try {
      return await fetcher(url);
    } finally {
      last = Date.now();
    }
  };
};

export const textOf = (response: FederalResponse): string =>
  new TextDecoder("utf-8").decode(response.body);

export class FederalHttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`${new URL(url).host} respondeu HTTP ${status}`);
    this.name = "FederalHttpError";
  }
}

/** Reads one page that must answer 200 itself: a redirect or an error is a failure, never worked around. */
export const getOk = async (
  fetcher: FederalFetch,
  url: string,
): Promise<FederalResponse> => {
  const response = await fetcher(url);
  if (response.status !== 200) throw new FederalHttpError(url, response.status);
  return response;
};

export class BlockedByRobotsError extends Error {
  constructor(readonly url: string) {
    super("A fonte proíbe coleta automatizada desta página no robots.txt.");
    this.name = "BlockedByRobotsError";
  }
}

/**
 * Consults each robots.txt once per run. A missing file (404/410) places no restriction; any other
 * failure leaves the source out of this run instead of assuming permission.
 */
export const robotsGate = (fetcher: FederalFetch, robotsUrls: string[]) => {
  const bodies = new Map<string, Promise<string | null>>();
  const read = (robotsUrl: string): Promise<string | null> => {
    let body = bodies.get(robotsUrl);
    if (!body) {
      body = fetcher(robotsUrl).then((response) => {
        if (response.status === 200) return textOf(response);
        if (response.status === 404 || response.status === 410) return null;
        throw new FederalHttpError(robotsUrl, response.status);
      });
      bodies.set(robotsUrl, body);
    }
    return body;
  };
  return async (url: string): Promise<void> => {
    for (const robotsUrl of robotsUrls) {
      const robots = await read(robotsUrl);
      if (robots !== null && !robotsAllows(robots, url))
        throw new BlockedByRobotsError(url);
    }
  };
};
