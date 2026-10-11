import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CULTURAL_INSTALLATIONS,
  FEDERAL_INSTALLATION,
  MUNICIPAL_INSTALLATIONS,
  STATE_INSTALLATIONS,
  mapasInstallations,
} from "./cultural-installations";
import {
  mapOpportunity,
  matchesAudiovisualText,
  programFromText,
} from "./opportunity-map";

const now = new Date("2026-09-23T15:00:00-03:00");

const UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
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
        // Plain HTTP is accepted only where the official list publishes it and it is flagged as such.
        assert.match(
          installation.baseUrl,
          installation.plainHttp ? /^http:\/\// : /^https:\/\//,
        );
      } else {
        assert.equal("baseUrl" in installation, false);
        assert.ok(installation.reason.length > 0);
      }
    }
    assert.ok(mapasInstallations().length > 1);
  });

  it("gives every municipal install a UF, a municipality and its own id", () => {
    assert.equal(MUNICIPAL_INSTALLATIONS.length, 31);
    for (const installation of MUNICIPAL_INSTALLATIONS) {
      assert.equal(installation.scope, "municipal");
      assert.ok(UFS.includes(installation.uf), installation.id);
      assert.ok(installation.city && installation.city.length > 0);
      assert.match(installation.id, /^[a-z]{2}-[a-z0-9-]+$/);
    }
    const natal = MUNICIPAL_INSTALLATIONS.find(
      (installation) => installation.city === "Natal",
    );
    assert.equal(natal?.id, "rn-natal");
    assert.equal(natal?.uf, "RN");
    assert.deepEqual(
      MUNICIPAL_INSTALLATIONS.filter(
        (installation) => installation.plainHttp,
      ).map((installation) => installation.city),
      ["Aracaju", "Bento Gonçalves", "Iguatu"],
    );
    for (const installation of STATE_INSTALLATIONS) {
      assert.equal(installation.scope, "state");
    }
    assert.equal(FEDERAL_INSTALLATION.scope, "federal");
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
      {
        ...FEDERAL_INSTALLATION,
        uf: "CE",
        id: "ce",
        name: "Mapa Cultural do Ceará",
      },
      now,
    );
    assert.ok(draft);
    assert.equal(draft.id, "ce-77");
    assert.equal(draft.status, "open");
    assert.equal(draft.program, "lpg");
    assert.equal(draft.state, "CE");
    assert.equal(draft.organizationName, "Secretaria de Cultura");
    assert.equal(
      draft.registrationFrom?.toISOString(),
      "2026-09-01T03:00:00.000Z",
    );
    assert.equal(
      draft.sourceUrl,
      "https://mapa.cultura.gov.br/oportunidade/77/",
    );
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
    assert.deepEqual(draft.areas, ["audiovisual"]);
  });

  it("keeps a call of another area, with no audiovisual program", () => {
    const draft = mapOpportunity(
      { id: 5, name: "Edital de circulação de teatro de rua" },
      FEDERAL_INSTALLATION,
      now,
    );
    assert.ok(draft);
    assert.equal(draft.program, null);
    assert.deepEqual(draft.areas, ["teatro"]);
  });

  it("stores source areas, type, origin and the municipality", () => {
    const natal = MUNICIPAL_INSTALLATIONS.find(
      (installation) => installation.id === "rn-natal",
    );
    assert.ok(natal);
    const draft = mapOpportunity(
      {
        id: 41,
        name: "Edital de fomento 2026",
        registrationFrom: "2026-09-01 00:00:00",
        registrationTo: "2026-10-01 18:00:00",
        type: { id: 9, name: "Edital" },
        terms: { tag: ["pnab"], area: ["Cinema", "Música", "Cinema", "Rádio"] },
        owner: { id: 1, name: "Secretaria de Cultura de Natal" },
        ownerEntity: { id: 7, name: "Editais PNAB 2026" },
        parent: null,
        isModel: null,
      },
      natal,
      now,
    );
    assert.ok(draft);
    assert.equal(draft.id, "rn-natal-41");
    assert.equal(draft.state, "RN");
    assert.equal(draft.city, "Natal");
    assert.deepEqual(draft.areaTerms, ["Cinema", "Música", "Rádio"]);
    assert.deepEqual(draft.areas, ["audiovisual", "musica", "outras"]);
    assert.equal(draft.program, "audiovisual");
    assert.equal(draft.opportunityType, "Edital");
    assert.equal(draft.originName, "Editais PNAB 2026");
    for (const word of ["natal", "edital", "musica", "audiovisual", "pnab"]) {
      assert.ok(draft.searchText.includes(word), word);
    }
  });

  it("reads continuous flow from its sentinel date and leaves the call with no closing date", () => {
    const draft = mapOpportunity(
      {
        id: 8,
        name: "Credenciamento permanente de artistas",
        registrationFrom: { date: "2025-11-01 23:05:00.000000" },
        registrationTo: { date: "2111-01-01 00:00:00.000000" },
        continuousFlow: { date: "2111-01-01 00:00:00.000000" },
      },
      FEDERAL_INSTALLATION,
      now,
    );
    assert.ok(draft);
    assert.equal(draft.continuousFlow, true);
    assert.equal(draft.registrationTo, null);
    assert.equal(draft.status, "open");
  });

  it("keeps the closing date of a continuous-flow call that sets one", () => {
    const draft = mapOpportunity(
      {
        id: 9,
        name: "Credenciamento de artistas — ciclo 2",
        registrationFrom: "2026-01-01 00:00:00",
        registrationTo: "2028-12-31 00:00:00",
        continuousFlow: { date: "2111-01-01 00:00:00.000000" },
      },
      FEDERAL_INSTALLATION,
      now,
    );
    assert.equal(draft?.continuousFlow, true);
    assert.equal(
      draft?.registrationTo?.toISOString(),
      "2028-12-31T03:00:00.000Z",
    );
  });

  it("does not read a null or false continuousFlow as continuous", () => {
    for (const continuousFlow of [null, false, 0, "0", ""]) {
      const draft = mapOpportunity(
        {
          id: 10,
          name: "Edital",
          registrationTo: "2026-10-01 18:00:00",
          continuousFlow,
        },
        FEDERAL_INSTALLATION,
        now,
      );
      assert.equal(draft?.continuousFlow, false);
    }
  });

  it("drops later phases of a call and call templates", () => {
    assert.equal(
      mapOpportunity(
        { id: 11, name: "Fase de recursos", parent: { id: 10 } },
        FEDERAL_INSTALLATION,
        now,
      ),
      null,
    );
    assert.equal(
      mapOpportunity(
        { id: 12, name: "Modelo de edital", isModel: 1 },
        FEDERAL_INSTALLATION,
        now,
      ),
      null,
    );
  });

  it("reads registration dates sent as objects", () => {
    const draft = mapOpportunity(
      {
        id: 3,
        name: "Edital de cinema",
        registrationFrom: {
          date: "2026-09-01 00:00:00.000000",
          timezone: "America/Fortaleza",
        },
        registrationTo: {
          date: "2026-10-01 18:00:00.000000",
          timezone: "America/Fortaleza",
        },
      },
      FEDERAL_INSTALLATION,
      now,
    );
    assert.equal(
      draft?.registrationFrom?.toISOString(),
      "2026-09-01T03:00:00.000Z",
    );
    assert.equal(draft?.status, "open");
  });

  it("drops a record without a title", () => {
    assert.equal(mapOpportunity({ id: 1 }, FEDERAL_INSTALLATION, now), null);
  });

  it("recognizes FSA and FAC without matching unrelated words", () => {
    assert.equal(programFromText("Chamada FSA de produção", null), "fsa");
    assert.equal(programFromText("Edital FAC de documentário", null), "fac");
    assert.equal(
      programFromText("Mostra da faculdade de cinema", null),
      "audiovisual",
    );
    assert.equal(programFromText("Mostra da faculdade de teatro", null), null);
    assert.equal(
      programFromText("Edital de dança — Lei Paulo Gustavo", null),
      "lpg",
    );
    assert.equal(matchesAudiovisualText("Mostra de teatro", null), false);
    assert.equal(matchesAudiovisualText("Oficina de cinema", null), true);
  });
});
