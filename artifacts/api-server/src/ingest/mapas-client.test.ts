import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FEDERAL_INSTALLATION,
  STATE_INSTALLATIONS,
  type MapasInstallation,
} from "./cultural-installations";
import {
  MAPAS_USER_AGENT,
  fetchOpenOpportunities,
  lookbackStart,
  retryAfterMilliseconds,
  type MapasFetchResponse,
  type MapasFetcher,
} from "./mapas-client";
import { MapasClientError } from "./mapas-errors";
import { mapasFixture } from "./mapas-fixtures";

const now = new Date("2026-10-10T15:00:00-03:00");

const state = (id: string): MapasInstallation => {
  const installation = STATE_INSTALLATIONS.find((row) => row.id === id);
  assert.ok(installation?.kind === "mapas");
  return installation;
};

const ok = (body: unknown, numPages?: number): MapasFetchResponse => ({
  status: 200,
  body: typeof body === "string" ? body : JSON.stringify(body),
  contentType: "application/json",
  metadata: numPages === undefined ? null : JSON.stringify({ numPages }),
});

const htmlPage = (): MapasFetchResponse => ({
  status: 200,
  body: mapasFixture("es-continuous-flow-error.html"),
  contentType: "text/html; charset=UTF-8",
  metadata: null,
});

const page = (url: string): number =>
  Number(new URL(url).searchParams.get("@page"));

const records = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: from + index,
    name: `Edital ${from + index}`,
    registrationTo: "2026-12-01 18:00:00",
  }));

describe("fetchOpenOpportunities", () => {
  it("asks for every call that closes today or later, with no keyword and no continuousFlow filter", async () => {
    const seen: string[] = [];
    const result = await fetchOpenOpportunities(state("es"), now, {
      fetcher: async (url) => {
        seen.push(url);
        return ok(mapasFixture("es-open.json"), 1);
      },
    });

    assert.equal(seen.length, 1);
    const url = new URL(seen[0]!);
    assert.equal(url.origin, "https://mapa.cultura.es.gov.br");
    assert.equal(url.pathname, "/api/opportunity/find");
    assert.equal(url.searchParams.get("registrationTo"), "GTE(2026-10-10)");
    assert.equal(url.searchParams.get("@limit"), "50");
    assert.equal(url.searchParams.get("@page"), "1");
    assert.equal(url.searchParams.has("@keyword"), false);
    // Regression: `continuousFlow=EQ(true)` made eight installs answer an HTML error page.
    assert.equal(url.searchParams.has("continuousFlow"), false);
    for (const field of ["terms", "type", "ownerEntity.{id,name}"]) {
      assert.ok(url.searchParams.get("@select")?.includes(field), field);
    }

    assert.equal(result.complete, true);
    assert.equal(result.warning, null);
    assert.deepEqual(
      result.drafts.map((draft) => [
        draft.id,
        draft.areas,
        draft.opportunityType,
      ]),
      [
        ["es-2314", ["circo"], "Outros tipos de inscrição"],
        ["es-2578", ["outras"], "Edital"],
        ["es-2656", ["outras"], "Edital"],
      ],
    );
    assert.equal(result.drafts[2]?.originName, "Editais Funcultura 2026");
    assert.equal(
      result.drafts[2]?.organizationName,
      "SECRETARIA DA CULTURA (SECULT) - ES",
    );
  });

  it("keeps calls of every area and marks audiovisual and continuous flow", async () => {
    const result = await fetchOpenOpportunities(state("pe"), now, {
      fetcher: async () => ok(mapasFixture("pe-open.json"), 1),
    });
    const byId = new Map(
      result.drafts.map((draft) => [draft.externalId, draft]),
    );
    assert.equal(result.drafts.length, 3);

    const festival = byId.get("3402");
    assert.deepEqual(festival?.areaTerms, ["Cinema"]);
    assert.deepEqual(festival?.areas, ["audiovisual"]);
    assert.equal(festival?.program, "audiovisual");
    assert.equal(festival?.status, "open");

    // Continuous flow with a closing date of its own: the date is kept.
    const continuous = byId.get("3207");
    assert.equal(continuous?.continuousFlow, true);
    assert.equal(
      continuous?.registrationTo?.toISOString(),
      "2028-06-16T19:59:00.000Z",
    );
    assert.equal(continuous?.status, "open");
    assert.equal(continuous?.program, null);
  });

  it("classifies from the text where the install publishes no area terms", async () => {
    const result = await fetchOpenOpportunities(state("ce"), now, {
      fetcher: async () => ok(mapasFixture("ce-open.json"), 1),
    });
    assert.equal(result.drafts.length, 3);
    for (const draft of result.drafts) {
      assert.deepEqual(draft.areaTerms, []);
      assert.equal(draft.state, "CE");
      assert.equal(draft.city, null);
    }
  });

  it("follows the page count the API reports", async () => {
    const pages: number[] = [];
    const result = await fetchOpenOpportunities(FEDERAL_INSTALLATION, now, {
      fetcher: async (url) => {
        pages.push(page(url));
        return ok(records(page(url) * 100, page(url) === 3 ? 7 : 50), 3);
      },
    });
    assert.deepEqual(pages, [1, 2, 3]);
    assert.equal(result.drafts.length, 107);
    assert.equal(result.pagesRead, 3);
    assert.equal(result.complete, true);
  });

  it("stops at a short page when the API sends no metadata", async () => {
    const pages: number[] = [];
    const result = await fetchOpenOpportunities(FEDERAL_INSTALLATION, now, {
      fetcher: async (url) => {
        pages.push(page(url));
        return ok(records(page(url) * 100, page(url) === 1 ? 50 : 12));
      },
    });
    assert.deepEqual(pages, [1, 2]);
    assert.equal(result.drafts.length, 62);
    assert.equal(result.complete, true);
  });

  it("stops at the empty page past the end", async () => {
    const pages: number[] = [];
    const result = await fetchOpenOpportunities(FEDERAL_INSTALLATION, now, {
      fetcher: async (url) => {
        pages.push(page(url));
        return ok(page(url) === 1 ? records(1, 50) : []);
      },
    });
    assert.deepEqual(pages, [1, 2]);
    assert.equal(result.drafts.length, 50);
    assert.equal(result.complete, true);
  });

  it("keeps the pages already read when the page past the end is an HTML page", async () => {
    const result = await fetchOpenOpportunities(FEDERAL_INSTALLATION, now, {
      fetcher: async (url) =>
        page(url) === 1 ? ok(records(1, 50)) : htmlPage(),
    });
    assert.equal(result.drafts.length, 50);
    assert.equal(result.complete, false);
    assert.match(result.warning ?? "", /página 2 da listagem falhou/);
    assert.match(result.warning ?? "", /content-type text\/html/);
  });

  it("stops when an install ignores @page and repeats the same records", async () => {
    let calls = 0;
    const result = await fetchOpenOpportunities(FEDERAL_INSTALLATION, now, {
      fetcher: async () => {
        calls += 1;
        return ok(records(1, 50));
      },
    });
    assert.equal(calls, 2);
    assert.equal(result.drafts.length, 50);
  });

  it("stops at the page cap and says the listing is incomplete", async () => {
    let calls = 0;
    const result = await fetchOpenOpportunities(FEDERAL_INSTALLATION, now, {
      maxPages: 2,
      fetcher: async (url) => {
        calls += 1;
        return ok(records(page(url) * 100, 50), 9);
      },
    });
    assert.equal(calls, 2);
    assert.equal(result.drafts.length, 100);
    assert.equal(result.complete, false);
    assert.match(result.warning ?? "", /limite de 2 páginas/);
  });

  it("falls back to basic fields when the install answers HTML to the rich selection", async () => {
    const selects: string[] = [];
    const result = await fetchOpenOpportunities(state("ce"), now, {
      fetcher: async (url) => {
        const select = new URL(url).searchParams.get("@select") ?? "";
        selects.push(select);
        return select.includes("terms")
          ? htmlPage()
          : ok(
              [
                {
                  id: 7,
                  name: "Edital de cinema",
                  registrationTo: "2026-11-01 18:00:00",
                },
              ],
              1,
            );
      },
    });
    assert.equal(selects.length, 2);
    assert.equal(selects[1]?.includes("terms"), false);
    assert.deepEqual(
      result.drafts.map((draft) => draft.id),
      ["ce-7"],
    );
    assert.deepEqual(result.drafts[0]?.areas, ["audiovisual"]);
    assert.match(result.warning ?? "", /campos básicos/);
    assert.equal(result.complete, true);
  });

  it("fails the install with the first answer when the basic selection fails too", async () => {
    await assert.rejects(
      () =>
        fetchOpenOpportunities(state("ce"), now, {
          fetcher: async () => ({
            status: 500,
            body: mapasFixture("ce-continuous-flow-500.html"),
            contentType: "text/html;charset=UTF-8",
            metadata: null,
          }),
        }),
      (error: unknown) =>
        error instanceof MapasClientError &&
        error.kind === "http" &&
        error.status === 500 &&
        /@select=id%2Cname.*terms/.test(error.message),
    );
  });

  it("stops after one request when the site blocks the collector", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        fetchOpenOpportunities(FEDERAL_INSTALLATION, now, {
          fetcher: async () => {
            calls += 1;
            return {
              status: 403,
              body: "<title>Just a moment...</title>",
              metadata: null,
            };
          },
        }),
      (error: unknown) =>
        error instanceof MapasClientError && error.kind === "blocked",
    );
    assert.equal(calls, 1);
  });

  it("does not retry with other fields when the site limits the rate, and carries Retry-After", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        fetchOpenOpportunities(FEDERAL_INSTALLATION, now, {
          fetcher: async () => {
            calls += 1;
            return {
              status: 429,
              body: "",
              metadata: null,
              retryAfterMs: 120_000,
            };
          },
        }),
      (error: unknown) =>
        error instanceof MapasClientError &&
        error.kind === "rate_limited" &&
        error.retryAfterMs === 120_000,
    );
    assert.equal(calls, 1);
  });

  it("classifies a transport failure without losing its cause", async () => {
    const cause = Object.assign(new Error("certificate has expired"), {
      code: "CERT_HAS_EXPIRED",
    });
    await assert.rejects(
      () =>
        fetchOpenOpportunities(state("mt"), now, {
          fetcher: async () => {
            throw new TypeError("fetch failed", { cause });
          },
        }),
      (error: unknown) =>
        error instanceof MapasClientError && error.kind === "tls_expired",
    );
  });

  it("narrows by @keyword on request and then does not claim a complete listing", async () => {
    const seen: string[] = [];
    const result = await fetchOpenOpportunities(FEDERAL_INSTALLATION, now, {
      keyword: "audiovisual",
      lookbackDays: 30,
      fetcher: async (url) => {
        seen.push(url);
        return ok(records(1, 2), 1);
      },
    });
    const url = new URL(seen[0]!);
    assert.equal(url.searchParams.get("@keyword"), "audiovisual");
    assert.equal(url.searchParams.get("registrationTo"), "GTE(2026-09-11)");
    assert.equal(result.complete, false);
  });
});

describe("collector identity and pacing", () => {
  it("identifies itself honestly", () => {
    assert.match(
      MAPAS_USER_AGENT,
      /^PardalDigital\/\d+\.\d+(\.\d+)? \(\+https:\/\/pardaldigital\.com; contato@pardaldigital\.com\)$/,
    );
  });

  it("honors Retry-After in seconds or HTTP-date form", () => {
    const at = Date.parse("2026-10-08T15:00:00Z");
    assert.equal(retryAfterMilliseconds("12", at), 12_000);
    assert.equal(
      retryAfterMilliseconds("Thu, 08 Oct 2026 15:00:30 GMT", at),
      30_000,
    );
    assert.equal(retryAfterMilliseconds("invalid", at), null);
  });

  it("starts the window today in Brasília", () => {
    assert.equal(
      lookbackStart(new Date("2026-10-11T01:30:00Z"), 1),
      "2026-10-10",
    );
    assert.equal(
      lookbackStart(new Date("2026-10-11T03:30:00Z"), 1),
      "2026-10-11",
    );
  });
});

const _typecheck: MapasFetcher = async () => ok([]);
void _typecheck;
