import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DISABLE_AFTER_FAILURES,
  RETRY_DISABLED_AFTER_MS,
  collectInstallations,
  disabledUntil,
  pendingCoverage,
  type InstallationCoverage,
} from "./collect-installations";
import {
  CULTURAL_INSTALLATIONS,
  FEDERAL_INSTALLATION,
  MUNICIPAL_INSTALLATIONS,
  STATE_INSTALLATIONS,
  type CulturalInstallation,
  type MapasInstallation,
} from "./cultural-installations";
import {
  fetchOpenOpportunities,
  type MapasFetchResponse,
} from "./mapas-client";
import { mapasFixture } from "./mapas-fixtures";

const now = new Date("2026-10-10T15:00:00-03:00");

const byId = (id: string): CulturalInstallation => {
  const installation = CULTURAL_INSTALLATIONS.find((row) => row.id === id);
  assert.ok(installation, id);
  return installation;
};

const municipal = (id: string): MapasInstallation => {
  const installation = MUNICIPAL_INSTALLATIONS.find((row) => row.id === id);
  assert.ok(installation, id);
  return installation;
};

const json = (body: string): MapasFetchResponse => ({
  status: 200,
  body,
  contentType: "application/json",
  metadata: JSON.stringify({ numPages: 1 }),
});

/** One mocked network for every install: the host decides the answer. */
const network = (url: string): MapasFetchResponse => {
  const host = new URL(url).hostname;
  switch (host) {
    case "mapa.cultura.gov.br":
      return {
        status: 403,
        body: "<title>Just a moment...</title>",
        contentType: "text/html",
        metadata: null,
      };
    case "mapa.cultura.es.gov.br":
      return json(mapasFixture("es-open.json"));
    case "www.mapacultural.pe.gov.br":
      return json(mapasFixture("pe-open.json"));
    case "mapacultural.secult.ce.gov.br":
      return json(mapasFixture("ce-open.json"));
    case "mapacultural.pa.gov.br":
      return {
        status: 200,
        body: mapasFixture("es-continuous-flow-error.html"),
        contentType: "text/html; charset=UTF-8",
        metadata: null,
      };
    case "mapas.mt.gov.br":
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("certificate has expired"), {
          code: "CERT_HAS_EXPIRED",
        }),
      });
    case "mapacultural.natal.rn.gov.br":
      return json(
        JSON.stringify([
          {
            id: 1,
            name: "Edital de música de Natal",
            registrationTo: "2026-11-01 18:00:00",
          },
        ]),
      );
    case "cultura.toledo.pr.gov.br":
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("connect timeout"), {
          code: "UND_ERR_CONNECT_TIMEOUT",
        }),
      });
    default:
      return json("[]");
  }
};

const run = (
  installations: CulturalInstallation[],
  previous = new Map<string, InstallationCoverage>(),
) => {
  const requested: string[] = [];
  const stored: { id: string; ids: string[]; complete: boolean }[] = [];
  return collectInstallations(now, {
    installations,
    previous,
    fetchOpportunities: (installation, at) =>
      fetchOpenOpportunities(installation, at, {
        fetcher: async (url) => {
          requested.push(new URL(url).hostname);
          return network(url);
        },
      }),
    store: async (installation, result) => {
      stored.push({
        id: installation.id,
        ids: result.drafts.map((draft) => draft.id),
        complete: result.complete,
      });
      return { upserted: result.drafts.length, closed: 0 };
    },
  }).then((summary) => ({ summary, requested, stored }));
};

describe("collectInstallations", () => {
  it("collects every install and lets none of them stop the others", async () => {
    const { summary, stored } = await run(
      ["br", "ac", "ce", "es", "mt", "pa", "pe", "rn-natal", "pr-toledo"].map(
        byId,
      ),
    );

    const outcome = Object.fromEntries(
      summary.coverage.map((row) => [
        row.id,
        [row.outcome, row.upserted, row.open],
      ]),
    );
    assert.deepEqual(outcome, {
      br: ["blocked", 0, 0],
      ac: ["gap", 0, undefined],
      ce: ["ok", 3, 3],
      es: ["ok", 3, 3],
      mt: ["degraded", 0, 0],
      pa: ["failed", 0, 0],
      pe: ["ok", 3, 3],
      "rn-natal": ["ok", 1, 1],
      "pr-toledo": ["failed", 0, 0],
    });
    assert.equal(summary.upserted, 10);
    assert.equal(summary.attempted, 8);
    assert.equal(summary.failed, 4);
    assert.equal(summary.failures.length, 4);
    assert.deepEqual(
      stored.map((row) => row.id),
      ["ce", "es", "pe", "rn-natal"],
    );
    assert.ok(stored.every((row) => row.complete));

    const natal = summary.coverage.find((row) => row.id === "rn-natal");
    assert.equal(natal?.uf, "RN");
    assert.equal(natal?.city, "Natal");
    assert.equal(natal?.scope, "municipal");

    const para = summary.coverage.find((row) => row.id === "pa");
    assert.match(para?.message ?? "", /página em vez dos dados/);
    const toledo = summary.coverage.find((row) => row.id === "pr-toledo");
    assert.equal(toledo?.consecutiveFailures, 1);
    assert.equal(toledo?.disabledAt, null);
  });

  it("switches a municipal install off at the third failure in a row", async () => {
    const toledo = municipal("pr-toledo");
    const previous = new Map<string, InstallationCoverage>([
      [
        toledo.id,
        {
          ...pendingCoverage().find((row) => row.id === toledo.id)!,
          outcome: "failed",
          consecutiveFailures: DISABLE_AFTER_FAILURES - 1,
        },
      ],
    ]);
    const { summary } = await run([toledo], previous);
    const row = summary.coverage[0];
    assert.equal(row?.outcome, "disabled");
    assert.equal(row?.consecutiveFailures, DISABLE_AFTER_FAILURES);
    assert.equal(row?.disabledAt, now.toISOString());
    assert.match(
      row?.message ?? "",
      /desativada automaticamente após 3 falhas seguidas; nova tentativa em 17\/10\/2026/,
    );
  });

  it("does not request a switched-off install until the retry date", async () => {
    const toledo = municipal("pr-toledo");
    const disabledAt = new Date(
      now.getTime() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const previous = new Map<string, InstallationCoverage>([
      [
        toledo.id,
        {
          ...pendingCoverage().find((row) => row.id === toledo.id)!,
          outcome: "disabled",
          consecutiveFailures: 3,
          disabledAt,
        },
      ],
    ]);
    const { summary, requested } = await run([toledo], previous);
    assert.deepEqual(requested, []);
    assert.equal(summary.attempted, 0);
    assert.equal(summary.failed, 0);
    assert.equal(summary.coverage[0]?.outcome, "disabled");
    assert.equal(summary.coverage[0]?.disabledAt, disabledAt);
    assert.match(
      summary.coverage[0]?.message ?? "",
      /nova tentativa em 15\/10\/2026/,
    );
  });

  it("tries a switched-off install again after the rest period and brings it back when it answers", async () => {
    const natal = municipal("rn-natal");
    const disabledAt = new Date(
      now.getTime() - RETRY_DISABLED_AFTER_MS - 1,
    ).toISOString();
    const previous = new Map<string, InstallationCoverage>([
      [
        natal.id,
        {
          ...pendingCoverage().find((row) => row.id === natal.id)!,
          outcome: "disabled",
          consecutiveFailures: 3,
          disabledAt,
        },
      ],
    ]);
    const { summary, requested } = await run([natal], previous);
    assert.deepEqual(requested, ["mapacultural.natal.rn.gov.br"]);
    assert.equal(summary.coverage[0]?.outcome, "ok");
    assert.equal(summary.coverage[0]?.consecutiveFailures, 0);
    assert.equal(summary.coverage[0]?.disabledAt, null);
  });

  it("never switches off the federal or a state install", async () => {
    const mt = STATE_INSTALLATIONS.find((row) => row.id === "mt");
    assert.ok(mt?.kind === "mapas");
    const streak = (id: string): [string, InstallationCoverage] => [
      id,
      {
        ...pendingCoverage().find((row) => row.id === id)!,
        outcome: "failed",
        consecutiveFailures: 40,
      },
    ];
    const { summary, requested } = await run(
      [FEDERAL_INSTALLATION, mt],
      new Map([streak("br"), streak("mt")]),
    );
    assert.deepEqual(requested, ["mapa.cultura.gov.br", "mapas.mt.gov.br"]);
    assert.deepEqual(
      summary.coverage.map((row) => row.outcome),
      ["blocked", "degraded"],
    );
    assert.equal(
      disabledUntil(
        mt,
        {
          ...summary.coverage[1]!,
          outcome: "disabled",
          disabledAt: now.toISOString(),
        },
        now,
      ),
      null,
    );
  });

  it("does not count a rate limit towards switching an install off", async () => {
    const natal = municipal("rn-natal");
    const previous = new Map<string, InstallationCoverage>([
      [
        natal.id,
        {
          ...pendingCoverage().find((row) => row.id === natal.id)!,
          outcome: "failed",
          consecutiveFailures: 2,
        },
      ],
    ]);
    const summary = await collectInstallations(now, {
      installations: [natal],
      previous,
      fetchOpportunities: (installation, at) =>
        fetchOpenOpportunities(installation, at, {
          fetcher: async () => ({
            status: 429,
            body: "",
            metadata: null,
            retryAfterMs: 3_600_000,
          }),
        }),
      store: async () => ({ upserted: 0, closed: 0 }),
    });
    assert.equal(summary.coverage[0]?.outcome, "degraded");
    assert.equal(summary.coverage[0]?.consecutiveFailures, 2);
  });

  it("reports progress after each install", async () => {
    const seen: number[] = [];
    await collectInstallations(now, {
      installations: ["ce", "es"].map(byId),
      fetchOpportunities: (installation, at) =>
        fetchOpenOpportunities(installation, at, {
          fetcher: async (url) => network(url),
        }),
      store: async (_installation, result) => ({
        upserted: result.drafts.length,
        closed: 1,
      }),
      onProgress: async (summary) => {
        seen.push(summary.upserted);
      },
    }).then((summary) => {
      assert.equal(summary.closed, 2);
    });
    assert.deepEqual(seen, [3, 6]);
  });
});

describe("pendingCoverage", () => {
  it("lists every install, municipal ones with UF and municipality", () => {
    const pending = pendingCoverage();
    assert.equal(pending.length, CULTURAL_INSTALLATIONS.length);
    const campinas = pending.find((row) => row.id === "sp-campinas");
    assert.equal(campinas?.uf, "SP");
    assert.equal(campinas?.city, "Campinas");
    assert.equal(campinas?.outcome, "pending");
  });
});
