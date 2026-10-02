import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TenderSummary } from "@workspace/api-zod";
import {
  createValueHistogram,
  modalityLabels,
  normalizePageRelevance,
  nonNegativeValues,
  numberRange,
  statusLabels,
} from "./search-service";

const summaryWithScore = (score: number | null): TenderSummary => ({
  id: `fixture-${String(score)}`,
  title: "TEST DATA",
  objectSummary: null,
  organization: { id: "fixture-org", name: "TEST DATA" },
  purchasingUnit: null,
  modality: "other",
  modalityLabel: "Outra",
  status: "open",
  tenderNumber: null,
  tenderNumberShort: null,
  estimatedValue: null,
  estimatedValueStatus: "not_published",
  publishedAt: null,
  openingAt: null,
  proposalDeadline: null,
  location: { state: null, city: null, cityIbgeCode: null },
  source: { id: "fixture", name: "TEST DATA", url: null },
  categories: [],
  relevance: { score, highlights: [] },
  updatedAt: new Date("2026-09-22T12:00:00Z"),
});

describe("search response semantics", () => {
  it("uses the canonical Portuguese facet labels", () => {
    assert.deepEqual(statusLabels, {
      open: "Aberto",
      under_review: "Em análise",
      closed: "Encerrado",
      suspended: "Suspenso",
      cancelled: "Revogado",
    });
    assert.deepEqual(modalityLabels, {
      pregao_eletronico: "Pregão eletrônico",
      pregao_presencial: "Pregão presencial",
      concorrencia: "Concorrência",
      concorrencia_eletronica: "Concorrência eletrônica",
      dispensa: "Dispensa",
      inexigibilidade: "Inexigibilidade",
      credenciamento: "Credenciamento",
      leilao: "Leilão",
      dialogo_competitivo: "Diálogo competitivo",
      other: "Outra",
    });
  });

  it("returns null relevance when every result has the same score", () => {
    const result = normalizePageRelevance([
      summaryWithScore(1),
      summaryWithScore(1),
    ]);

    assert.deepEqual(
      result.map(({ relevance }) => relevance.score),
      [null, null],
    );
  });

  it("normalizes discriminating relevance scores within the result page", () => {
    const result = normalizePageRelevance([
      summaryWithScore(0.8),
      summaryWithScore(0.6),
      summaryWithScore(0.4),
    ]);

    assert.deepEqual(
      result.map(({ relevance }) => relevance.score),
      [1, 0.5, 0],
    );
  });

  it("calculates value ranges without spreading large result sets", () => {
    const values = Array.from({ length: 200_000 }, (_, index) => index + 1);

    assert.deepEqual(numberRange(values), { min: 1, max: 200_000 });
    assert.equal(
      createValueHistogram(values).reduce((total, bucket) => total + bucket.count, 0),
      values.length,
    );
  });

  it("ignores invalid negative values in value facets", () => {
    const values = [-10, 0, 50, 150];
    const histogram = createValueHistogram(values);

    assert.deepEqual(nonNegativeValues(values), [0, 50, 150]);
    assert.deepEqual(numberRange(nonNegativeValues(values)), { min: 0, max: 150 });
    assert.equal(histogram.reduce((total, bucket) => total + bucket.count, 0), 3);
    assert.equal(histogram[0]?.from, 0);
  });
});
