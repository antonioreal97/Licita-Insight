import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CULTURAL_INSTALLATIONS,
  FEDERAL_INSTALLATION,
  STATE_INSTALLATIONS,
  mapasInstallations,
} from "./cultural-installations";
import { fetchAudiovisualOpportunities } from "./mapas-client";
import {
  mapOpportunity,
  matchesAudiovisualText,
  programFromText,
} from "./opportunity-map";

const now = new Date("2026-09-23T15:00:00-03:00");

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

describe("cultural installations", () => {
  it("lists the federal map and every UF once", () => {
    assert.equal(FEDERAL_INSTALLATION.baseUrl, "https://mapa.cultura.gov.br");
    assert.equal(STATE_INSTALLATIONS.length, 27);
    assert.deepEqual(
      STATE_INSTALLATIONS.map((installation) => installation.uf),
      UFS,
    );
    const ids = CULTURAL_INSTALLATIONS.map((installation) => installation.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("keeps a URL only for Mapas Culturais installs", () => {
    for (const installation of CULTURAL_INSTALLATIONS) {
      if (installation.kind === "mapas") {
        assert.match(installation.baseUrl, /^https:\/\//);
      } else {
        assert.equal("baseUrl" in installation, false);
        assert.ok(installation.reason.length > 0);
      }
    }
    assert.ok(mapasInstallations().length > 1);
  });
});

describe("mapOpportunity", () => {
  it("maps an open audiovisual call and tags Lei Paulo Gustavo", () => {
    const draft = mapOpportunity(
      {
        id: 77,
        name: "Edital de cinema — Lei Paulo Gustavo",
        shortDescription: "Produção de curtas.",
        registrationFrom: "2026-09-01 00:00:00",
        registrationTo: "2026-10-01 18:00:00",
        owner: { name: "Secretaria de Cultura" },
      },
      { ...FEDERAL_INSTALLATION, uf: "CE", id: "ce", name: "Mapa Cultural do Ceará" },
      now,
    );
    assert.ok(draft);
    assert.equal(draft.id, "ce-77");
    assert.equal(draft.status, "open");
    assert.equal(draft.program, "lpg");
    assert.equal(draft.state, "CE");
    assert.equal(draft.organizationName, "Secretaria de Cultura");
    assert.equal(draft.registrationFrom?.toISOString(), "2026-09-01T03:00:00.000Z");
    assert.equal(draft.sourceUrl, "https://mapa.cultura.gov.br/oportunidade/77/");
  });

  it("leaves the value of a call without dates as undated and uses the installation name", () => {
    const draft = mapOpportunity(
      { id: "12", name: "Prêmio de audiovisual" },
      FEDERAL_INSTALLATION,
      now,
    );
    assert.ok(draft);
    assert.equal(draft.status, "undated");
    assert.equal(draft.state, null);
    assert.equal(draft.organizationName, "Mapa da Cultura");
    assert.equal(draft.program, "audiovisual");
  });

  it("reads registration dates sent as objects", () => {
    const draft = mapOpportunity(
      {
        id: 3,
        name: "Edital de cinema",
        registrationFrom: { date: "2026-09-01 00:00:00.000000", timezone: "America/Fortaleza" },
        registrationTo: { date: "2026-10-01 18:00:00.000000", timezone: "America/Fortaleza" },
      },
      FEDERAL_INSTALLATION,
      now,
    );
    assert.equal(draft?.registrationFrom?.toISOString(), "2026-09-01T03:00:00.000Z");
    assert.equal(draft?.status, "open");
  });

  it("drops a record without a title", () => {
    assert.equal(mapOpportunity({ id: 1 }, FEDERAL_INSTALLATION, now), null);
  });

  it("recognizes FSA and FAC without matching unrelated words", () => {
    assert.equal(programFromText("Chamada FSA de produção", null), "fsa");
    assert.equal(programFromText("Edital FAC de documentário", null), "fac");
    assert.equal(programFromText("Mostra da faculdade de cinema", null), "audiovisual");
    assert.equal(matchesAudiovisualText("Mostra de teatro", null), false);
    assert.equal(matchesAudiovisualText("Oficina de cinema", null), true);
  });
});

describe("fetchAudiovisualOpportunities", () => {
  const respond = (pages: Record<string, unknown>) => async (url: string) => {
    const match = Object.entries(pages).find(([part]) => url.includes(part));
    if (!match) throw new Error(`unexpected url ${url}`);
    return {
      status: 200,
      body: JSON.stringify(match[1]),
      metadata: JSON.stringify({ numPages: 1 }),
    };
  };

  it("searches by keyword and keeps audiovisual titles", async () => {
    const seen: string[] = [];
    const result = await fetchAudiovisualOpportunities(FEDERAL_INSTALLATION, now, 30, {
      maxPages: 2,
      fetcher: async (url) => {
        seen.push(url);
        return {
          status: 200,
          body: JSON.stringify([
            {
              id: 9,
              name: "Edital de cinema",
              registrationFrom: "2026-09-10 00:00:00",
              registrationTo: "2026-09-30 18:00:00",
            },
          ]),
          metadata: JSON.stringify({ numPages: 1 }),
        };
      },
    });
    assert.equal(result.vocabularyFallback, false);
    assert.equal(result.drafts.length, 1);
    assert.equal(result.drafts[0]?.program, "audiovisual");
    assert.ok(seen.some((url) => url.includes("@keyword=audiovisual")));
    assert.equal(seen.some((url) => url.includes("term:linguagem")), false);
  });

  it("drops calls whose title is not audiovisual", async () => {
    const result = await fetchAudiovisualOpportunities(FEDERAL_INSTALLATION, now, 30, {
      fetcher: respond({
        "continuousFlow=": [],
        "/api/opportunity/find": [
          { id: 1, name: "Edital de teatro" },
          { id: 2, name: "Edital de documentário" },
        ],
      }),
    });
    assert.deepEqual(
      result.drafts.map((draft) => draft.id),
      ["br-2"],
    );
  });

  it("fails the installation when every keyword search fails", async () => {
    await assert.rejects(
      () =>
        fetchAudiovisualOpportunities(FEDERAL_INSTALLATION, now, 30, {
          fetcher: async () => ({ status: 503, body: "down", metadata: null }),
        }),
      /listing failed \(503\)/,
    );
  });
});
