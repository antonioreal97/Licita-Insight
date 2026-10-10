import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createOpenTendersByStateCache,
  OPEN_TENDERS_BY_STATE_TTL_MS,
  toOpenTendersByState,
  type OpenTendersStateRow,
} from "./open-tenders-by-state";

const generatedAt = new Date("2026-10-09T12:00:00.000Z");
const older = new Date("2026-10-08T09:00:00.000Z");
const newer = new Date("2026-10-09T09:00:00.000Z");

describe("toOpenTendersByState", () => {
  it("always returns the 27 states in code order, with zeros for the ones without open tenders", () => {
    const { data, meta } = toOpenTendersByState(
      [{ state: "SP", openTenders: 3, estimatedValueTotal: 1500.5, updatedAt: newer }],
      generatedAt,
    );

    assert.equal(data.length, 27);
    assert.deepEqual(
      data.map(({ state }) => state),
      data.map(({ state }) => state).sort(),
    );
    assert.deepEqual(data.find(({ state }) => state === "SP"), {
      state: "SP",
      openTenders: 3,
      estimatedValueTotal: 1500.5,
      updatedAt: newer,
    });
    assert.deepEqual(data.find(({ state }) => state === "AC"), {
      state: "AC",
      openTenders: 0,
      estimatedValueTotal: null,
      updatedAt: null,
    });
    assert.deepEqual(meta, { totalOpenTenders: 3, generatedAt, indexUpdatedAt: newer, cacheTtlSeconds: 900 });
  });

  it("adds rows that differ only by case or spaces and ignores values that are not a state", () => {
    const rows: OpenTendersStateRow[] = [
      { state: "mg", openTenders: 2, estimatedValueTotal: null, updatedAt: older },
      { state: " MG ", openTenders: 5, estimatedValueTotal: 100, updatedAt: newer },
      { state: "MG", openTenders: 1, estimatedValueTotal: 50, updatedAt: null },
      { state: "XX", openTenders: 9, estimatedValueTotal: 9000, updatedAt: newer },
      { state: "", openTenders: 4, estimatedValueTotal: null, updatedAt: null },
    ];
    const { data, meta } = toOpenTendersByState(rows, generatedAt);

    assert.deepEqual(data.find(({ state }) => state === "MG"), {
      state: "MG",
      openTenders: 8,
      estimatedValueTotal: 150,
      updatedAt: newer,
    });
    assert.equal(meta.totalOpenTenders, 8);
  });

  it("keeps the value sum null when no open tender of the state published a value", () => {
    const { data, meta } = toOpenTendersByState(
      [{ state: "RR", openTenders: 4, estimatedValueTotal: null, updatedAt: older }],
      generatedAt,
    );

    assert.equal(data.find(({ state }) => state === "RR")?.estimatedValueTotal, null);
    assert.equal(meta.indexUpdatedAt, older);
  });
});

describe("createOpenTendersByStateCache", () => {
  it("asks the database once per 15 minutes, however many requests arrive", async () => {
    let clock = generatedAt.getTime();
    let queries = 0;
    const cache = createOpenTendersByStateCache(
      async () => {
        queries += 1;
        return [{ state: "BA", openTenders: queries, estimatedValueTotal: null, updatedAt: null }];
      },
      () => clock,
    );
    const bahia = async () => (await cache.get()).data.find(({ state }) => state === "BA")?.openTenders;

    assert.deepEqual(await Promise.all([bahia(), bahia(), bahia()]), [1, 1, 1]);
    clock += OPEN_TENDERS_BY_STATE_TTL_MS - 1;
    assert.equal(await bahia(), 1);
    assert.equal(queries, 1);

    clock += 1;
    const refreshed = await cache.get();
    assert.equal(queries, 2);
    assert.equal(refreshed.data.find(({ state }) => state === "BA")?.openTenders, 2);
    assert.equal(refreshed.meta.generatedAt.getTime(), clock);
  });

  it("keeps answering with the last aggregate while the database is unavailable", async () => {
    let clock = generatedAt.getTime();
    let down = false;
    const cache = createOpenTendersByStateCache(
      async () => {
        if (down) throw new Error("connection refused");
        return [{ state: "PE", openTenders: 7, estimatedValueTotal: 10, updatedAt: newer }];
      },
      () => clock,
    );

    const first = await cache.get();
    down = true;
    clock += OPEN_TENDERS_BY_STATE_TTL_MS;
    assert.equal(await cache.get(), first);
  });
});
