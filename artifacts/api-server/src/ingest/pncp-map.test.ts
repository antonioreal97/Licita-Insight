import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapEstimatedValue,
  mapPublication,
  mapPncpStatus,
  mergeTimeline,
  pncpTenderNumberShort,
} from "./pncp-map";

const now = new Date("2026-09-22T15:00:00-03:00");

const publication = {
  numeroControlePNCP: "00394460000141-1-000123/2026",
  objetoCompra: "Aquisição de equipamentos de informática",
  informacaoComplementar: "Entrega parcelada.",
  processo: "23079.000123/2026-11",
  numeroCompra: "00012",
  anoCompra: 2026,
  modalidadeId: 6,
  modalidadeNome: "Pregão - Eletrônico",
  situacaoCompraNome: "Divulgada no PNCP",
  dataPublicacaoPncp: "2026-09-20T09:00:00",
  dataAberturaProposta: "2026-09-21T09:00:00",
  dataEncerramentoProposta: "2026-09-30T17:00:00",
  valorTotalEstimado: 1847000.5,
  orcamentoSigilosoCodigo: 1,
  orcamentoSigilosoDescricao: "Não sigiloso",
  orgaoEntidade: {
    cnpj: "00394460000141",
    razaoSocial: "Universidade Federal do Rio de Janeiro",
  },
  unidadeOrgao: {
    nomeUnidade: "Pró-reitoria de Administração",
    ufSigla: "rj",
    municipioNome: "Rio de Janeiro",
    codigoIbge: "3304557",
  },
};

describe("PNCP publication mapping", () => {
  it("maps a publication into the tender shape the API already serves", () => {
    const draft = mapPublication(publication, now);

    assert.equal(draft.id, "00394460000141-1-000123-2026");
    assert.equal(draft.displayTitle, "Aquisição de equipamentos de informática");
    assert.equal(draft.displayTitleSource, "rules");
    assert.equal(draft.displayTitleVersion, 1);
    assert.equal(draft.displayTitleNeedsModel, false);
    assert.equal(draft.pncpControlNumber, "00394460000141-1-000123/2026");
    assert.equal(draft.modality, "pregao_eletronico");
    assert.equal(draft.status, "open");
    assert.equal(draft.estimatedValue, "1847000.50");
    assert.equal(draft.estimatedValueStatus, "disclosed");
    assert.equal(draft.organizationId, "pncp-00394460000141");
    assert.equal(draft.state, "RJ");
    assert.equal(draft.cityIbgeCode, "3304557");
    assert.equal(
      draft.sourceUrl,
      "https://pncp.gov.br/app/editais/00394460000141/2026/123",
    );
    assert.equal(draft.tenderNumber, "Pregão - Eletrônico 00012/2026");
    assert.equal(pncpTenderNumberShort(publication), "00012/2026");
    assert.equal(draft.publishedAt?.toISOString(), "2026-09-20T12:00:00.000Z");
    assert.equal(draft.openingAt?.toISOString(), "2026-09-21T12:00:00.000Z");
    assert.equal(
      draft.proposalDeadline?.toISOString(),
      "2026-09-30T20:00:00.000Z",
    );
    assert.match(draft.searchText, /equipamentos de informatica/);
    assert.match(draft.searchText, /rio de janeiro/);
  });

  it("keeps the official object as title and publishes a bounded summary", () => {
    const officialObject = `${"Contratação de serviços especializados com requisitos técnicos. ".repeat(8)}IMPORTANTE: observar todos os anexos.`;
    const draft = mapPublication(
      { ...publication, objetoCompra: officialObject },
      now,
    );

    assert.equal(draft.title, officialObject);
    assert.ok(draft.objectSummary);
    assert.ok(draft.objectSummary.length <= 300);
    assert.match(draft.objectSummary, /…$/);
    assert.doesNotMatch(draft.objectSummary, /\s…$/);
    assert.equal(
      officialObject.at(draft.objectSummary.length - 1),
      " ",
    );
  });

  it("derives the short tender number from the PNCP control year when needed", () => {
    assert.equal(
      pncpTenderNumberShort({
        numeroControlePNCP: publication.numeroControlePNCP,
        numeroCompra: publication.numeroCompra,
      }),
      "00012/2026",
    );
  });

  it("hides a confidential estimate and derives status from the deadline", () => {
    assert.deepEqual(
      mapEstimatedValue(10, 2, "COMPRA_PARCIALMENTE_SIGILOSA"),
      { estimatedValue: null, estimatedValueStatus: "confidential" },
    );
    assert.deepEqual(
      mapEstimatedValue(0, 3, "COMPRA_TOTALMENTE_SIGILOSA"),
      { estimatedValue: null, estimatedValueStatus: "confidential" },
    );
    assert.deepEqual(
      mapEstimatedValue(10, 1, "COMPRA_SEM_SIGILO"),
      { estimatedValue: "10.00", estimatedValueStatus: "disclosed" },
    );
    assert.equal(
      mapPncpStatus(
        "Divulgada no PNCP",
        new Date("2026-09-01T17:00:00-03:00"),
        now,
      ),
      "under_review",
    );
    assert.equal(mapPncpStatus("Suspensa", null, now), "suspended");
    assert.equal(mapPncpStatus("Revogada", null, now), "cancelled");
    assert.deepEqual(
      mapEstimatedValue(0, null, null),
      { estimatedValue: null, estimatedValueStatus: "not_published" },
    );
    assert.deepEqual(
      mapEstimatedValue(-10, null, null),
      { estimatedValue: null, estimatedValueStatus: "not_published" },
    );
  });

  it("appends timeline entries only when status or deadline changed", () => {
    const next = mapPublication(
      { ...publication, situacaoCompraNome: "Suspensa" },
      now,
    );
    const timeline = mergeTimeline(
      {
        status: "open",
        proposalDeadline: next.proposalDeadline,
        timeline: next.timeline,
      },
      next,
      now,
    );

    assert.equal(timeline.at(-1)?.type, "status_changed");
    assert.equal(
      mergeTimeline(
        {
          status: next.status,
          proposalDeadline: next.proposalDeadline,
          timeline: next.timeline,
        },
        next,
        now,
      ).length,
      1,
    );
  });

  it("rejects a record without a PNCP control number", () => {
    assert.throws(
      () => mapPublication({ objetoCompra: "sem identificação" }, now),
      /numeroControlePNCP/,
    );
  });
});
