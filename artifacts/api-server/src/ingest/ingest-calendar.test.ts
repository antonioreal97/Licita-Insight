import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSealed,
  planDay,
  saoPauloToday,
  summarizeCoverage,
  type IngestDay,
} from "./ingest-calendar";
import { PNCP_UFS } from "./pncp-client";

const day = "2026-09-21";
const today = "2026-09-22";
const row = (overrides: Partial<IngestDay> = {}): IngestDay => ({
  source: "pncp",
  day,
  modality: 6,
  uf: "all",
  status: "complete",
  pagesRead: 2,
  upserted: 19,
  startedAt: new Date("2026-09-22T03:00:00Z"),
  completedAt: new Date("2026-09-22T03:01:00Z"),
  ...overrides,
});

describe("PNCP coverage calendar", () => {
  it("seals only a successful listing started after the publication day ended in Brasilia", () => {
    assert.equal(saoPauloToday(new Date("2026-09-22T02:59:59Z")), day);
    assert.equal(saoPauloToday(new Date("2026-09-22T03:00:00Z")), today);
    assert.equal(isSealed(row(), today), true);
    assert.equal(
      isSealed(row({ startedAt: new Date("2026-09-22T02:59:59Z") }), today),
      false,
    );
    assert.equal(isSealed(row({ day: today }), today), false);
    assert.equal(isSealed(row({ status: "pending" }), today), false);
    assert.equal(isSealed(row({ completedAt: null }), today), false);
  });

  it("skips sealed days, requests gaps and always revisits today", () => {
    assert.deepEqual(planDay([row()], day, 6, today), []);
    assert.deepEqual(planDay([row()], day, 8, today), ["all"]);
    assert.deepEqual(planDay([], day, 6, today), ["all"]);
    assert.deepEqual(planDay([row({ day: today })], today, 6, today), ["all"]);
    assert.deepEqual(planDay([row()], day, 6, today, { force: true }), ["all"]);
    assert.deepEqual(
      planDay([row()], day, 6, today, { force: true, uf: "DF" }),
      ["DF"],
    );
  });

  it("resumes missing UFs without requesting the national listing or successful UFs", () => {
    const rows = [row({ uf: "AC" }), row({ uf: "AL", status: "pending" })];
    assert.deepEqual(
      planDay(rows, day, 6, today),
      PNCP_UFS.filter((uf) => uf !== "AC"),
    );
    assert.deepEqual(planDay(rows, day, 6, today, { uf: "AC" }), []);
    assert.deepEqual(planDay(rows, day, 6, today, { uf: "AL" }), ["AL"]);
    assert.deepEqual(
      planDay(
        PNCP_UFS.map((uf) => row({ uf })),
        day,
        6,
        today,
      ),
      [],
    );
    assert.equal(
      planDay([row({ uf: "AC", status: "pending" })], day, 6, today).length,
      27,
    );
  });

  it("retries pending UF partitions even when national coverage is already sealed", () => {
    const rows = [
      row({ uf: "all" }),
      row({
        uf: "DF",
        status: "pending",
        startedAt: new Date("2026-09-23T10:00:00Z"),
        completedAt: null,
      }),
      row({
        uf: "RJ",
        status: "pending",
        startedAt: new Date("2026-09-23T10:00:00Z"),
        completedAt: null,
      }),
    ];

    assert.deepEqual(planDay(rows, day, 6, today), ["DF", "RJ"]);
    assert.deepEqual(planDay(rows, day, 6, today, { uf: "DF" }), ["DF"]);
    assert.deepEqual(planDay(rows, day, 6, today, { uf: "SP" }), []);
  });

  it("revisits every UF collected before midnight, even if all were complete", () => {
    const rows = PNCP_UFS.map((uf) =>
      row({ uf, startedAt: new Date("2026-09-21T20:00:00Z") }),
    );
    assert.deepEqual(planDay(rows, day, 6, today), [...PNCP_UFS]);
  });

  it("does not widen the configured interval because of an older backfill", () => {
    const coverage = summarizeCoverage(
      [row({ day: "2020-01-01" }), row()],
      { from: day, to: today, modalities: [6] },
      new Date("2026-09-22T12:00:00Z"),
    );
    assert.equal(coverage.from, day);
    assert.equal(coverage.days.length, 2);
    assert.deepEqual(coverage.sealedDays, [day]);
  });

  it("reports national coverage only when all configured modalities and all UFs are sealed", () => {
    const options = { from: day, to: today, modalities: [6, 8] };
    const now = new Date("2026-09-22T12:00:00Z");
    const partial = summarizeCoverage([row()], options, now);
    assert.deepEqual(partial.sealedDays, []);
    assert.equal(partial.nextOpenDay, day);
    const complete = summarizeCoverage(
      [row(), ...PNCP_UFS.map((uf) => row({ uf, modality: 8 }))],
      options,
      now,
    );
    assert.deepEqual(complete.sealedDays, [day]);
    assert.equal(complete.nextOpenDay, today);
    assert.equal(complete.partitions.length, 28);
  });
});
