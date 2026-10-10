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

describe("implausible estimated values", () => {
  const now = new Date("2026-10-08T15:00:00.000Z");
  const valued = (id: string, estimatedValue: number | null, flag: TenderDetail["estimatedValueFlag"] = null) => ({
    ...detail(id, firstSeenAt),
    estimatedValue,
    estimatedValueStatus: estimatedValue === null ? ("not_published" as const) : ("disclosed" as const),
    estimatedValueFlag: flag,
  });
  const tenders = [
    valued("vest", 938_761_000_000, "absolute_ceiling"),
    valued("concession", 24_000_000_000),
    valued("ordinary", 48_500),
    valued("unpublished", null),
    valued("bus-passes", 10_700_000_000, "modality_outlier"),
  ];
  const service = new SearchService(
    { findAll: () => tenders, findById: (id) => tenders.find((tender) => tender.id === id), getIndexUpdatedAt: () => now },
    () => now,
  );
  const ids = (patch: Partial<SearchCriteria>) => service.search(criteria(patch)).data.map(({ id }) => id);

  it("sorts flagged values last in both directions and still returns them with the official value", () => {
    assert.deepEqual(ids({ sort: "value_desc" }), ["concession", "ordinary", "unpublished", "vest", "bus-passes"]);
    assert.deepEqual(ids({ sort: "value_asc" }), ["ordinary", "concession", "unpublished", "bus-passes", "vest"]);
    const vest = service.search(criteria({ sort: "value_desc" })).data.find(({ id }) => id === "vest");
    assert.equal(vest?.estimatedValue, 938_761_000_000);
    assert.equal(vest?.estimatedValueFlag, "absolute_ceiling");
  });

  it("keeps flagged values out of the value facet and of every value range", () => {
    const { facets } = service.search(criteria());
    assert.equal(facets?.valueRange.min, 48_500);
    assert.equal(facets?.valueRange.max, 24_000_000_000);
    assert.equal(facets?.valueRange.histogram?.reduce((total, { count }) => total + count, 0), 2);
    assert.deepEqual(ids({ sort: "value_desc", valueMin: 1_000_000_000 }), ["concession"]);
    assert.deepEqual(ids({ sort: "value_desc", valueMax: 1_000_000_000_000 }), ["concession", "ordinary"]);
  });
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
