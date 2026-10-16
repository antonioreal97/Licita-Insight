import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { EU_FT_ROBOTS_URL } from "./eu-ft-parsers";
import { IDB_API_URL, IDB_ROBOTS_URL } from "./idb-parsers";
import type {
  InternationalFetch,
  InternationalRequest,
  InternationalResponse,
} from "./international-http";
import { WORLD_BANK_ROBOTS_URL } from "./worldbank-parsers";

/** Recorded answers of the international sources. See `fixtures/international/README.md`. */
export const internationalFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/international/${name}`, import.meta.url)),
    "utf8",
  );

export const internationalFixtureJson = (name: string): unknown =>
  JSON.parse(internationalFixture(name));

/** The day the fixtures were recorded: every "open" call in them is still open at this instant. */
export const FIXTURE_NOW = new Date("2026-10-11T21:20:00Z");

export const internationalResponse = (
  status: number,
  body = "",
  retryAfter: string | null = null,
): InternationalResponse => ({ status, body, retryAfter });

export type RecordedRequest = InternationalRequest & { at: number };

/**
 * The sources as they answered on the recording day: no robots.txt at the World Bank or the EU (404), one page
 * of World Bank notices, the EU facet tables, one page of EU results, and the robots.txt, dataset record and one
 * page of notices of the IDB. `overrides` replaces an answer by URL prefix.
 */
export const fixtureFetcher = (
  overrides: Array<
    [prefix: string, answer: (request: InternationalRequest) => InternationalResponse]
  > = [],
): { fetcher: InternationalFetch; requests: RecordedRequest[] } => {
  const requests: RecordedRequest[] = [];
  const fetcher: InternationalFetch = async (request) => {
    requests.push({ ...request, at: Date.now() });
    const override = overrides.find(([prefix]) => request.url.startsWith(prefix));
    if (override) return override[1](request);
    if (
      request.url === WORLD_BANK_ROBOTS_URL ||
      request.url === EU_FT_ROBOTS_URL
    )
      return internationalResponse(404, "Not Found");
    if (request.url === IDB_ROBOTS_URL)
      return internationalResponse(200, internationalFixture("idb-robots.txt"));
    if (request.url.startsWith(`${IDB_API_URL}/package_show`))
      return internationalResponse(200, internationalFixture("idb-package.json"));
    if (request.url.startsWith(`${IDB_API_URL}/datastore_search`))
      return internationalResponse(200, internationalFixture("idb-notices.json"));
    if (request.url.startsWith("https://search.worldbank.org/api/v2/procnotices"))
      return internationalResponse(
        200,
        internationalFixture("worldbank-procnotices.json"),
      );
    if (request.url.includes("/search-api/prod/rest/facet"))
      return internationalResponse(200, internationalFixture("eu-ft-facet.json"));
    if (request.url.includes("/search-api/prod/rest/search"))
      return internationalResponse(200, internationalFixture("eu-ft-search.json"));
    if (request.url.startsWith("https://olinda.bcb.gov.br/"))
      return internationalResponse(200, internationalFixture("ptax-eur.json"));
    return internationalResponse(404, "Not Found");
  };
  return { fetcher, requests };
};
