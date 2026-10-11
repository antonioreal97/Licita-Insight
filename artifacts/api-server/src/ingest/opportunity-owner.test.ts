import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STATE_INSTALLATIONS } from "./cultural-installations";
import { mapOpportunity, type MapasOpportunity } from "./opportunity-map";
import {
  OWNER_REVIEW_VERSION,
  agentKind,
  hasOrganizationSignal,
  hasPersonalIdentifier,
  looksLikePersonName,
  mentionsPublicCall,
  redactContacts,
  resolveOwner,
} from "./opportunity-owner";

const now = new Date("2026-10-11T12:00:00-03:00");

const ceara = STATE_INSTALLATIONS.find((row) => row.id === "ce");
assert.ok(ceara?.kind === "mapas");

/** Every name of a person in this file is made up. */
const PERSON = "Fulana Exemplo da Silva";
const INDIVIDUAL = { id: 1, name: "Individual" };
const COLLECTIVE = { id: 2, name: "Coletivo" };
const NEUTRAL = "Proponente individual (Mapa Cultural do Ceará)";

const map = (record: MapasOpportunity) => {
  const draft = mapOpportunity(
    { id: 10, registrationTo: "2026-12-01 18:00:00", ...record },
    ceara,
    now,
  );
  assert.ok(draft);
  return draft;
};

const stored = (draft: ReturnType<typeof map>): string =>
  JSON.stringify([
    draft.organizationName,
    draft.originName,
    draft.searchText,
    draft.title,
    draft.summary,
    draft.raw,
  ]);

describe("owner of a Mapas Culturais call", () => {
  it("reads the agent type in the shapes installs send", () => {
    assert.equal(agentKind({ id: 1, name: "Individual" }), "individual");
    assert.equal(agentKind({ id: 2, name: "Coletivo" }), "collective");
    assert.equal(agentKind(1), "individual");
    assert.equal(agentKind("2"), "collective");
    assert.equal(agentKind({ name: "Coletivo" }), "collective");
    assert.equal(agentKind(undefined), "unknown");
    assert.equal(agentKind({ id: 9, name: "Edital" }), "unknown");
  });

  it("keeps the name of an organization as the institution", () => {
    const draft = map({
      name: "Edital de fomento ao teatro",
      owner: {
        id: 5975,
        name: "Secretaria da Cultura do Estado do Ceará",
        type: COLLECTIVE,
      },
    });
    assert.equal(
      draft.organizationName,
      "Secretaria da Cultura do Estado do Ceará",
    );
    assert.equal(draft.ownerKind, "collective");
    assert.equal(draft.individualListing, false);
    assert.deepEqual(draft.raw.owner, {
      id: 5975,
      name: "Secretaria da Cultura do Estado do Ceará",
      type: COLLECTIVE,
    });
    assert.deepEqual(draft.raw.ownerReview, {
      version: OWNER_REVIEW_VERSION,
      ownerKind: "collective",
      nameWithheld: false,
      individualListing: false,
      sourceChecked: true,
    });
  });

  it("never stores the name of a person: neutral label, no name and no agent id anywhere", () => {
    const draft = map({
      name: "Edital de chamamento público nº 9/2026 — PNAB",
      shortDescription: "Seleção de projetos culturais do município.",
      owner: { id: 121274, name: PERSON, type: INDIVIDUAL },
      ownerEntity: null,
    });
    assert.equal(draft.organizationName, NEUTRAL);
    assert.equal(draft.originName, null);
    assert.equal(draft.ownerKind, "individual");
    // A municipal call published from a civil servant's own account is still a public call.
    assert.equal(draft.individualListing, false);
    assert.deepEqual(draft.raw.owner, { type: INDIVIDUAL });
    assert.equal(draft.raw.ownerReview.nameWithheld, true);
    const everything = stored(draft).toLowerCase();
    for (const piece of ["fulana", "exemplo", "silva", "121274"]) {
      assert.equal(everything.includes(piece), false, piece);
    }
  });

  it("uses the linked project or space as the institution of a person's call", () => {
    const project = map({
      name: "Edital de ocupação 2026",
      owner: { id: 7, name: PERSON, type: INDIVIDUAL },
      ownerEntity: {
        id: 3080,
        name: "Circuito Exemplo",
        "@entityType": "project",
      } as never,
    });
    assert.equal(project.organizationName, "Circuito Exemplo");
    assert.equal(project.originName, "Circuito Exemplo");
    assert.deepEqual(project.raw.ownerEntity, {
      id: 3080,
      name: "Circuito Exemplo",
      "@entityType": "project",
    });
    assert.equal(stored(project).includes("Fulana"), false);

    const organization = map({
      name: "Edital de premiação",
      owner: { id: 7, name: PERSON, type: INDIVIDUAL },
      ownerEntity: {
        id: 99,
        name: "Secretaria Municipal de Cultura de Exemplo",
        "@entityType": "agent",
      } as never,
    });
    assert.equal(
      organization.organizationName,
      "Secretaria Municipal de Cultura de Exemplo",
    );
  });

  it("drops a linked agent that is the same person or another person", () => {
    const same = map({
      name: "Aulas de capoeira",
      owner: { id: 7, name: PERSON, type: INDIVIDUAL },
      ownerEntity: { id: 7, name: PERSON, "@entityType": "agent" } as never,
    });
    assert.equal(same.organizationName, NEUTRAL);
    assert.equal(same.originName, null);
    assert.deepEqual(same.raw.ownerEntity, { "@entityType": "agent" });

    const other = map({
      name: "Aulas de capoeira",
      owner: { id: 7, name: PERSON, type: INDIVIDUAL },
      ownerEntity: {
        id: 8,
        name: "Beltrano Exemplo Souza",
        "@entityType": "agent",
      } as never,
    });
    assert.equal(other.organizationName, NEUTRAL);
    assert.equal(other.originName, null);
    assert.equal(stored(other).includes("Beltrano"), false);
  });

  it("with no agent type, keeps only a name that is clearly an organization's", () => {
    const organization = map({
      name: "Edital de música",
      owner: { id: 3, name: "Secretaria de Cultura de Natal" },
    });
    assert.equal(
      organization.organizationName,
      "Secretaria de Cultura de Natal",
    );
    assert.equal(organization.ownerKind, "unknown");
    assert.equal(organization.raw.ownerReview.nameWithheld, false);

    const person = map({
      name: "Edital de música",
      owner: { id: 4, name: PERSON },
    });
    assert.equal(person.organizationName, NEUTRAL);
    assert.equal(person.ownerKind, "unknown");
    assert.equal(person.raw.ownerReview.nameWithheld, true);
    assert.deepEqual(person.raw.owner, {});
    assert.equal(stored(person).includes("Fulana"), false);

    assert.equal(looksLikePersonName(PERSON), true);
    assert.equal(looksLikePersonName("Associação Exemplo de Artes"), false);
    assert.equal(hasOrganizationSignal("Maria de Sá"), false);
  });

  it("withholds an organization name that carries a CPF, and cuts contacts from a person's text", () => {
    assert.equal(hasPersonalIdentifier("FULANA EXEMPLO 12345678901"), true);
    assert.equal(hasPersonalIdentifier("Bienal 2025-2026"), false);
    assert.equal(
      hasPersonalIdentifier("Instituto Exemplo 12.345.678/0001-90"),
      false,
    );

    const mei = map({
      name: "Oficina de cerâmica",
      owner: { id: 5, name: "FULANA EXEMPLO 12345678901", type: COLLECTIVE },
    });
    assert.equal(mei.organizationName, NEUTRAL);
    assert.equal(stored(mei).includes("12345678901"), false);

    const listing = map({
      name: "Aulas de violão — (85) 99999-0000",
      shortDescription:
        "Fale com fulana@exemplo.com.br ou 85 3101-0000. CPF 123.456.789-01.",
      owner: { id: 6, name: PERSON, type: INDIVIDUAL },
    });
    assert.equal(listing.title, "Aulas de violão — [contato removido]");
    assert.equal(
      listing.summary,
      "Fale com [contato removido] ou [contato removido]. CPF [contato removido].",
    );
    assert.equal(listing.raw.name, listing.title);
    assert.equal(listing.raw.shortDescription, listing.summary);
    assert.equal(
      redactContacts(
        "Lei nº 14.399/2022, de 10/10/2026 a 20/11/2026, R$ 10.000,00",
      ),
      "Lei nº 14.399/2022, de 10/10/2026 a 20/11/2026, R$ 10.000,00",
    );

    // An organization's own contact in the text of its call is not touched.
    const body = map({
      name: "Edital de fomento",
      shortDescription: "Dúvidas: cultura@exemplo.ce.gov.br",
      owner: { id: 9, name: "Secretaria de Cultura", type: COLLECTIVE },
    });
    assert.equal(body.summary, "Dúvidas: cultura@exemplo.ce.gov.br");
  });

  it("stores only the selected source fields in the raw payload", () => {
    const draft = map({
      name: "Edital de fomento",
      owner: {
        id: 9,
        name: "Secretaria de Cultura",
        type: COLLECTIVE,
        emailPrivado: "alguem@exemplo.com",
        telefone1: "85999990000",
        documento: "12345678901",
        endereco: "Rua Exemplo, 1",
      } as never,
      emailPrivado: "alguem@exemplo.com",
    } as never);
    assert.deepEqual(Object.keys(draft.raw).sort(), [
      "id",
      "name",
      "owner",
      "ownerEntity",
      "ownerReview",
      "registrationTo",
      "shortDescription",
    ]);
    assert.deepEqual(Object.keys(draft.raw.owner as object).sort(), [
      "id",
      "name",
      "type",
    ]);
  });
});

describe("individual listings", () => {
  const person = { id: 7, name: PERSON, type: INDIVIDUAL };

  it("flags a person's listing with no sign of a public call", () => {
    for (const name of [
      "Aulas de Capoeira",
      "Oportunidade Teste para Cursos de Formação",
      "Edital teste",
      "Oficina de bordado no meu ateliê",
    ]) {
      assert.equal(map({ name, owner: person }).individualListing, true, name);
    }
  });

  it("keeps a person's record that names a public instrument, law or body", () => {
    for (const name of [
      "III Edital das Artes de Exemplo",
      "Chamamento público de artistas locais",
      "Credenciamento de bandas — Secretaria Municipal de Cultura",
      "Prêmio Aldir Blanc de Exemplo",
      "Mostra de teatro da Prefeitura de Exemplo",
    ]) {
      assert.equal(map({ name, owner: person }).individualListing, false, name);
    }
    assert.equal(mentionsPublicCall("Aulas de capoeira", null), false);
    assert.equal(
      mentionsPublicCall("Roda de conversa", "Recursos da PNAB"),
      true,
    );
  });

  it("never flags the call of an organization", () => {
    const draft = map({
      name: "Aulas de capoeira",
      owner: {
        id: 2,
        name: "Associação Exemplo de Capoeira",
        type: COLLECTIVE,
      },
    });
    assert.equal(draft.individualListing, false);
  });
});

describe("re-evaluating a stored payload", () => {
  it("is stable: the minimized payload maps to the same row", () => {
    for (const record of [
      {
        name: "Aulas de capoeira",
        owner: { id: 7, name: PERSON, type: INDIVIDUAL },
      },
      { name: "Edital de música", owner: { id: 4, name: PERSON } },
      {
        name: "Edital de ocupação",
        owner: { id: 7, name: PERSON, type: INDIVIDUAL },
        ownerEntity: {
          id: 3080,
          name: "Circuito Exemplo",
          "@entityType": "project",
        },
      },
      {
        name: "Edital de fomento",
        owner: { id: 9, name: "Secretaria de Cultura", type: COLLECTIVE },
      },
    ] as MapasOpportunity[]) {
      const first = map(record);
      const again = mapOpportunity(first.raw as MapasOpportunity, ceara, now, {
        fromSource: false,
      });
      assert.ok(again);
      assert.equal(again.organizationName, first.organizationName);
      assert.equal(again.originName, first.originName);
      assert.equal(again.searchText, first.searchText);
      assert.deepEqual(again.raw, first.raw);
    }
  });

  it("marks a legacy payload with no agent type as not yet checked at the source", () => {
    const legacy = mapOpportunity(
      { id: 3, name: "Edital de dança", owner: { id: 4, name: PERSON } },
      ceara,
      now,
      { fromSource: false },
    );
    assert.equal(legacy?.raw.ownerReview.sourceChecked, false);
    assert.equal(legacy?.organizationName, NEUTRAL);
  });
});

it("public bodies registered as an Individual agent keep their name", () => {
  const installation = { name: "Mapa Cultural do Ceará" };
  const texts = { title: "Edital de chamamento público nº 01/2026", summary: null };
  for (const name of ["Secretaria Municipal de Cultura de Pindoretama", "Prefeitura de Aracati", "Fundação Cultural de Viana", "Coordenadoria de Patrimônio Cultural"]) {
    const resolved = resolveOwner({ owner: { id: 7, name, type: { id: 1, name: "Individual" } } }, installation, texts);
    assert.equal(resolved.organizationName, name, name);
    assert.equal(resolved.review.nameWithheld, false, name);
  }
});

it("a person registered as an Individual agent still has the name withheld", () => {
  const installation = { name: "Mapa Cultural do Ceará" };
  const texts = { title: "Edital de chamamento público nº 01/2026", summary: null };
  for (const name of ["Barbara Rodrigues Pereira Teofilo", "Antônia Almeida", "Secretário João Silva Produções"]) {
    const resolved = resolveOwner({ owner: { id: 8, name, type: { id: 1, name: "Individual" } } }, installation, texts);
    assert.equal(resolved.organizationName, "Proponente individual (Mapa Cultural do Ceará)", name);
    assert.equal(resolved.review.nameWithheld, true, name);
  }
});
