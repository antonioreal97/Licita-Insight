import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { QualificationItem, TenderSheetField } from "@workspace/db";
import {
  fitHighlight,
  platformHighlight,
  requirementHighlights,
  tenderHighlightLines,
  type StoredSheet,
} from "./tender-highlights-policy";

const evidence = (text: string) => ({
  documentTitle: "Edital",
  documentUrl: "https://example.test/edital.pdf",
  page: 3,
  text,
});

const found = (
  id: TenderSheetField["id"],
  answer: string | null,
  text = "trecho do edital",
): TenderSheetField => ({ id, status: "found", answer, confidence: 0.9, evidence: evidence(text) });

const notFound = (id: TenderSheetField["id"]): TenderSheetField => ({
  id,
  status: "not_found",
  answer: null,
  confidence: null,
  evidence: null,
});

const item = (type: QualificationItem["type"], text: string): QualificationItem => ({
  type,
  evidence: evidence(text),
  confidence: 0.9,
});

const sheet = (fields: TenderSheetField[], checklist: QualificationItem[] = []): StoredSheet => ({
  fields,
  qualificationChecklist: checklist,
});

describe("requirement highlights", () => {
  it("returns nothing without a ready sheet", () => {
    assert.deepEqual(requirementHighlights(null), []);
    assert.deepEqual(requirementHighlights(undefined), []);
    assert.deepEqual(requirementHighlights(sheet([])), []);
  });

  it("reads the stored classification and keeps the most decisive three", () => {
    const highlights = requirementHighlights(
      sheet(
        [
          found("me_epp", "quota"),
          found("site_visit", "mandatory"),
          found("bid_guarantee", "required"),
          found("samples", "required"),
          found("contract_guarantee", "required"),
        ],
        [item("qualificacao_tecnica", "Atestado de capacidade técnica compatível com o objeto")],
      ),
    );
    assert.deepEqual(highlights, [
      { code: "me_epp_quota", label: "Cota reservada para ME/EPP" },
      { code: "site_visit", label: "Visita técnica obrigatória" },
      { code: "bid_guarantee", label: "Exige garantia de proposta" },
    ]);
  });

  it("never turns an undefined, negative or missing answer into a requirement", () => {
    assert.deepEqual(
      requirementHighlights(
        sheet([
          found("me_epp", null),
          found("me_epp", "benefits_only"),
          found("site_visit", "optional"),
          found("bid_guarantee", "not_required"),
          notFound("samples"),
          { ...notFound("contract_guarantee"), answer: "required" },
        ]),
      ),
      [],
    );
  });

  it("tells a capacity certificate from other technical qualification", () => {
    assert.deepEqual(
      requirementHighlights(sheet([], [item("qualificacao_tecnica", "Registro no CREA da empresa")])),
      [{ code: "technical_qualification", label: "Exige qualificação técnica" }],
    );
    assert.deepEqual(
      requirementHighlights(sheet([found("technical_qualification", null, "Apresentar atestados de execução")])),
      [{ code: "technical_certificate", label: "Exige atestado de capacidade técnica" }],
    );
  });

  it("only highlights a minimum capital, not the usual balance sheet", () => {
    assert.deepEqual(
      requirementHighlights(sheet([], [item("qualificacao_economica", "Balanço patrimonial do último exercício")])),
      [],
    );
    assert.deepEqual(
      requirementHighlights(
        sheet([], [item("qualificacao_economica", "Patrimônio líquido mínimo de 10% do valor estimado")]),
      ),
      [{ code: "minimum_capital", label: "Exige capital ou patrimônio mínimo" }],
    );
  });

  it("marks an exclusive ME/EPP tender", () => {
    assert.deepEqual(requirementHighlights(sheet([found("me_epp", "exclusive")])), [
      { code: "me_epp_exclusive", label: "Exclusivo para ME/EPP" },
    ]);
  });
});

describe("fit highlight", () => {
  it("explains a high or medium fit with its main reason", () => {
    assert.equal(
      fitHighlight({
        level: "high",
        reasons: [{ kind: "value_not_published" }, { kind: "offering_match", terms: ["limpeza", "conservação"] }],
      }),
      "Alta aderência ao seu perfil: combina com “limpeza”, “conservação”",
    );
    assert.equal(
      fitHighlight({ level: "medium", reasons: [{ kind: "service_region", text: "Dentro da sua região de atendimento." }] }),
      "Aderência média ao seu perfil: Dentro da sua região de atendimento",
    );
    assert.equal(fitHighlight({ level: "high", reasons: [] }), "Alta aderência ao seu perfil");
  });

  it("stays silent for a missing or weak fit", () => {
    assert.equal(fitHighlight(null), null);
    assert.equal(fitHighlight({ level: "low", reasons: [{ kind: "offering_match", terms: ["x"] }] }), null);
    assert.equal(fitHighlight({ level: null, reasons: [] }), null);
  });
});

describe("platform highlight", () => {
  const compras = { slug: "comprasgov", label: "Compras.gov.br" };

  it("warns only about a known room the company did not declare", () => {
    assert.deepEqual(platformHighlight(compras, ["bll"]), {
      text: "Disputa em Compras.gov.br: você ainda não é cadastrado nesta plataforma",
      missingRegistration: true,
    });
    assert.deepEqual(platformHighlight(compras, ["comprasgov"]), {
      text: "Disputa em Compras.gov.br",
      missingRegistration: false,
    });
    assert.equal(platformHighlight(compras, [])?.missingRegistration, false);
  });

  it("ignores a publisher that is not a bidding room", () => {
    assert.equal(platformHighlight({ slug: "origem-betha", label: "Sistema de origem: Betha" }, ["bll"]), null);
    assert.equal(platformHighlight({ slug: null, label: null }, ["bll"]), null);
  });
});

describe("tender highlight lines", () => {
  const compras = { slug: "comprasgov", label: "Compras.gov.br" };

  it("joins fit, requirements and platform in at most three lines", () => {
    assert.deepEqual(
      tenderHighlightLines({
        sheet: sheet([found("me_epp", "quota"), found("bid_guarantee", "required")]),
        fit: { level: "high", reasons: [{ kind: "offering_match", terms: ["limpeza"] }] },
        platform: compras,
        registeredPlatforms: ["comprasgov"],
      }),
      [
        "Alta aderência ao seu perfil: combina com “limpeza”",
        "Cota reservada para ME/EPP · Exige garantia de proposta",
        "Disputa em Compras.gov.br",
      ],
    );
  });

  it("has nothing to say without sheet, fit or a registration warning", () => {
    assert.deepEqual(tenderHighlightLines({}), []);
    assert.deepEqual(
      tenderHighlightLines({ platform: compras, registeredPlatforms: ["comprasgov"] }),
      [],
    );
  });

  it("keeps the registration warning alone", () => {
    assert.deepEqual(tenderHighlightLines({ platform: compras, registeredPlatforms: ["bll"] }), [
      "Disputa em Compras.gov.br: você ainda não é cadastrado nesta plataforma",
    ]);
  });
});
