import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectRegistrationRequirement } from "./registration-requirement-policy";

const page = (text: string, pageNumber = 4) => ({
  documentTitle: "Edital",
  documentUrl: "https://pncp.gov.br/edital.pdf",
  page: pageNumber,
  text,
});

describe("registration requirement detection", () => {
  it("finds SICAF and Licitanet with the third business day before the session", () => {
    const requirement = detectRegistrationRequirement([
      page(
        "5.1. Poderão participar deste Pregão os interessados que estiverem previamente credenciados no SICAF e no LICITANET, " +
          "até o terceiro dia útil anterior à data prevista para recebimento das propostas.",
      ),
    ], "2026-10-15");
    assert.deepEqual(requirement?.systems, [
      { slug: "sicaf", label: "SICAF" },
      { slug: "licitanet", label: "Licitanet" },
    ]);
    assert.equal(requirement?.businessDaysBefore, 3);
    assert.equal(requirement?.referenceDate, "2026-10-15");
    assert.equal(requirement?.deadline, "2026-10-09");
    assert.match(requirement?.evidence.text ?? "", /credenciados no SICAF e no LICITANET/);
    assert.equal(requirement?.evidence.page, 4);
  });

  it("reads numbers written as digits with the spelled-out form", () => {
    const requirement = detectRegistrationRequirement([
      page(
        "O cadastramento no Portal de Compras Públicas deverá ser feito com antecedência mínima de 02 (dois) dias úteis da data da sessão.",
      ),
    ], "2026-10-15");
    assert.deepEqual(requirement?.systems, [
      { slug: "portal-compras-publicas", label: "Portal de Compras Públicas" },
    ]);
    assert.equal(requirement?.businessDaysBefore, 2);
    assert.equal(requirement?.deadline, "2026-10-13");
  });

  it("keeps the requirement without a date when the edital gives no deadline", () => {
    const requirement = detectRegistrationRequirement([
      page("Os licitantes deverão estar cadastrados no SICAF para participar do certame."),
    ], "2026-10-15");
    assert.deepEqual(requirement?.systems.map(({ slug }) => slug), ["sicaf"]);
    assert.equal(requirement?.businessDaysBefore, null);
    assert.equal(requirement?.deadline, null);
  });

  it("prefers a clause with a deadline over an earlier one without it", () => {
    const requirement = detectRegistrationRequirement([
      page("A empresa cadastrada no SICAF terá a documentação consultada on-line.", 2),
      page("O credenciamento na plataforma BLL deverá ocorrer até o 3º (terceiro) dia útil anterior à abertura.", 7),
    ], "2026-10-15");
    assert.equal(requirement?.evidence.page, 7);
    assert.deepEqual(requirement?.systems.map(({ slug }) => slug), ["bll"]);
    assert.equal(requirement?.deadline, "2026-10-09");
  });

  it("does not borrow the challenge deadline that follows the clause", () => {
    const requirement = detectRegistrationRequirement([
      page(
        "Os interessados deverão estar credenciados no Licitanet. " +
          "Qualquer pessoa poderá impugnar este edital até 3 (três) dias úteis antes da data da abertura.",
      ),
    ], "2026-10-15");
    assert.equal(requirement?.businessDaysBefore, null);
    assert.equal(requirement?.deadline, null);
  });

  it("ignores registration words that do not point to a system, and generic ones without a deadline", () => {
    assert.equal(
      detectRegistrationRequirement([
        page("Prova de inscrição no cadastro de contribuintes; empresa cadastrada na Junta Comercial."),
        page("A proposta cadastrada na plataforma poderá ser alterada até a abertura."),
      ], "2026-10-15"),
      null,
    );
  });

  it("leaves the deadline empty without a reference date", () => {
    const requirement = detectRegistrationRequirement([
      page("Credenciamento no SICAF até o terceiro dia útil anterior à data de abertura."),
    ], null);
    assert.equal(requirement?.businessDaysBefore, 3);
    assert.equal(requirement?.deadline, null);
  });
});
