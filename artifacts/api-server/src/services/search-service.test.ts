import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TenderDetail, TenderSummary } from "@workspace/api-zod";
import type { SearchCriteria, TenderRepository } from "../domain/search";
import {
  createHighlights,
  createValueHistogram,
  modalityLabels,
  normalizePageRelevance,
  nonNegativeValues,
  numberRange,
  statusLabels,
  SearchService,
} from "./search-service";

const firstSeenAt = new Date("2026-09-22T12:00:00Z");

const summaryWithScore = (score: number | null): TenderSummary => ({
  id: `fixture-${String(score)}`,
  title: "TEST DATA",
  displayTitle: "Test data",
  displayTitleSource: "rules",
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
  platform: null,
  categories: [],
  relevance: { score, highlights: [] },
  updatedAt: new Date("2026-09-22T12:00:00Z"),
  firstSeenAt,
  isNew: false,
});

const detail = (id: string, createdAt: Date): TenderDetail => ({
  ...summaryWithScore(null),
  id,
  firstSeenAt: createdAt,
  isNew: false,
  description: null,
  processNumber: null,
  items: [],
  documents: [],
  timeline: [],
  createdAt,
  detailsFetchedAt: null,
});

const criteria = (patch: Partial<SearchCriteria> = {}): SearchCriteria => ({
  query: null,
  mode: "keyword",
  status: [],
  modality: [],
  state: [],
  city: [],
  organizationId: [],
  sourceId: [],
  category: [],
  platform: [],
  newOnly: false,
  sort: "relevance",
  page: 1,
  pageSize: 20,
  facets: true,
  ...patch,
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

  it("offers a title highlight from the standardized display title", () => {
    const summary = summaryWithScore(null);
    const highlights = createHighlights({
      ...summary,
      title: "Objeto oficial sem a expressão consultada",
      displayTitle: "Aquisição de veículos leves",
      description: null,
      processNumber: null,
      items: [],
      documents: [],
      timeline: [],
      createdAt: new Date("2026-09-22T12:00:00Z"),
      detailsFetchedAt: new Date("2026-09-22T12:00:00Z"),
    }, "veículos");

    assert.deepEqual(highlights, [{
      field: "title",
      fragments: ["Aquisição de <mark>veículos</mark> leves"],
    }]);
  });

  it("filters and counts new tenders using the injected server clock", () => {
    const now = new Date("2026-10-08T15:00:00.000Z");
    const tenders = [
      detail("new", new Date(now.getTime() - 23 * 60 * 60 * 1_000)),
      detail("old", new Date(now.getTime() - 25 * 60 * 60 * 1_000)),
    ];
    const repository: TenderRepository = {
      findAll: () => tenders,
      findById: (id) => tenders.find((tender) => tender.id === id),
      getIndexUpdatedAt: () => now,
    };
    const result = new SearchService(repository, () => now).search(
      criteria({ newOnly: true, sort: "first_seen_desc" }),
    );

    assert.deepEqual(result.data.map(({ id }) => id), ["new"]);
    assert.equal(result.data[0]?.isNew, true);
    assert.equal(result.facets?.newCount, 1);
    assert.equal(result.pagination.total, 1);
  });
});
