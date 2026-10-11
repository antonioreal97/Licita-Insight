import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPPORTUNITY_AREAS,
  areaFromTerm,
  areasFromText,
  opportunityAreaLabels,
  resolveAreas,
} from "./opportunity-areas";

describe("areaFromTerm", () => {
  it("maps terms published by the installs to a canonical area", () => {
    const expected: Record<string, string> = {
      Cinema: "audiovisual",
      "Audiovisual e Mídias Interativas": "audiovisual",
      "Produção Audiovisual": "audiovisual",
      Websérie: "audiovisual",
      Música: "musica",
      Ópera: "musica",
      Teatro: "teatro",
      "Teatro de Rua": "teatro",
      "Dança Contemporânea": "danca",
      "Forró (Dança)": "danca",
      "Artes Circenses": "circo",
      "Circo Itinerante": "circo",
      "Artes Visuais": "artes-visuais",
      Fotografia: "artes-visuais",
      "Arte de Rua": "artes-visuais",
      "Livro, Leitura e Literatura": "literatura",
      Cordel: "literatura",
      "Patrimônio Cultural Imaterial": "patrimonio",
      "Museu (Patrimônio Material)": "patrimonio",
      "Culturas Populares": "culturas-populares",
      Capoeira: "culturas-populares",
      "Cultura dos Povos Originários": "culturas-populares",
      Artesanato: "artesanato",
      "Cultura Digital": "cultura-digital",
      "Jogos eletrônicos/Games": "cultura-digital",
      Gastronomia: "gastronomia",
      "Produção Cultural": "gestao-producao",
      "Cultura e Educação": "formacao",
      "Cultura LGBTQIAPN+": "diversidade",
      "Acessibilidade Cultural": "diversidade",
      Outra: "outras",
      Rádio: "outras",
    };
    for (const [term, area] of Object.entries(expected)) {
      assert.equal(areaFromTerm(term), area, term);
    }
  });

  it("matches whole words only", () => {
    assert.equal(areaFromTerm("Cultivo"), "outras");
    assert.equal(areaFromTerm("Bandeiras"), "outras");
  });

  it("labels every area", () => {
    for (const area of OPPORTUNITY_AREAS) {
      assert.ok(opportunityAreaLabels[area].length > 0);
    }
  });
});

describe("resolveAreas", () => {
  it("uses the source terms, in canonical order and without repeats", () => {
    assert.deepEqual(
      resolveAreas(
        ["Circo", "Artes Circenses", "Teatro", "Cinema"],
        "Edital",
        null,
      ),
      ["audiovisual", "teatro", "circo"],
    );
  });

  it("adds audiovisual from the title even when the terms do not say so", () => {
    assert.deepEqual(
      resolveAreas(["Outra"], "17º Festival de Cinema de Triunfo", null),
      ["audiovisual", "outras"],
    );
  });

  it("does not read other areas from the text when the source published terms", () => {
    assert.deepEqual(
      resolveAreas(["Artesanato"], "Feira de artesanato e música", null),
      ["artesanato"],
    );
  });

  it("classifies from the text when the install publishes no area terms", () => {
    assert.deepEqual(
      resolveAreas(
        [],
        "Edital de circulação",
        "Espetáculos de dança, teatro e música.",
      ),
      ["musica", "teatro", "danca"],
    );
    assert.deepEqual(
      resolveAreas([], "Edital de chamamento público nº 6", null),
      [],
    );
  });

  it("does not take loose wording for an audiovisual call", () => {
    assert.deepEqual(
      areasFromText("Oficina de curta duração", "Uma longa jornada"),
      [],
    );
    assert.deepEqual(areasFromText("Mostra de curtas-metragens", null), [
      "audiovisual",
    ]);
  });
});
