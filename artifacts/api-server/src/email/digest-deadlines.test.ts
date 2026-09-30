import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deadlinesForSavedTender,
  digestDeadlineWindowEnd,
  isInDigestDeadlineWindow,
  relativeDeadlineDay,
} from "./digest-deadlines";

// 07:00 in Brasília, when the digest runs.
const now = new Date("2026-09-29T10:00:00.000Z");

describe("digest deadline window", () => {
  it("ends at the end of the 3rd following day in Brasília", () => {
    assert.equal(
      digestDeadlineWindowEnd(now).toISOString(),
      "2026-10-03T03:00:00.000Z",
    );
    assert.equal(isInDigestDeadlineWindow(new Date("2026-10-03T02:59:00.000Z"), now), true);
    assert.equal(isInDigestDeadlineWindow(new Date("2026-10-03T03:00:00.000Z"), now), false);
  });

  it("uses the Brasília day even when UTC already turned", () => {
    const lateEvening = new Date("2026-09-30T02:30:00.000Z"); // 29/09 23:30 in Brasília
    assert.equal(
      digestDeadlineWindowEnd(lateEvening).toISOString(),
      "2026-10-03T03:00:00.000Z",
    );
  });

  it("excludes deadlines that already passed", () => {
    assert.equal(isInDigestDeadlineWindow(now, now), false);
    assert.equal(isInDigestDeadlineWindow(new Date("2026-09-29T09:00:00.000Z"), now), false);
  });

  it("labels today, tomorrow and later by Brasília calendar day", () => {
    assert.equal(relativeDeadlineDay(new Date("2026-09-30T02:30:00.000Z"), now), "hoje");
    assert.equal(relativeDeadlineDay(new Date("2026-09-30T03:30:00.000Z"), now), "amanhã");
    assert.equal(relativeDeadlineDay(new Date("2026-10-01T15:00:00.000Z"), now), "em 2 dias");
    assert.equal(relativeDeadlineDay(new Date("2026-10-03T02:00:00.000Z"), now), "em 3 dias");
    assert.equal(
      relativeDeadlineDay(
        new Date("2026-09-30T04:00:00.000Z"),
        new Date("2026-09-30T02:30:00.000Z"),
      ),
      "amanhã",
    );
  });
});

describe("saved tender deadlines", () => {
  const row = {
    tenderId: "tender-1",
    tenderTitle: "TEST DATA edital",
    tenderOrganizationName: "Órgão de teste",
    tenderStatus: "open",
    proposalDeadline: new Date("2026-09-30T15:00:00.000Z"),
    stage: "participating",
    nextAction: "Enviar certidões",
    nextActionDeadline: new Date("2026-10-01T15:00:00.000Z"),
  };

  it("returns both the personal and the proposal deadline inside the window", () => {
    assert.deepEqual(
      deadlinesForSavedTender(row, now).map(({ kind }) => kind),
      ["personal", "proposal"],
    );
  });

  it("ignores other personal stages, inactive tenders and deadlines outside the window", () => {
    for (const stage of ["submitted", "awaiting_result", "completed", "dismissed"]) {
      assert.deepEqual(deadlinesForSavedTender({ ...row, stage }, now), []);
    }
    assert.deepEqual(
      deadlinesForSavedTender({ ...row, tenderStatus: "cancelled" }, now).map(({ kind }) => kind),
      ["personal"],
    );
    assert.deepEqual(
      deadlinesForSavedTender(
        {
          ...row,
          nextActionDeadline: new Date("2026-09-29T09:00:00.000Z"),
          proposalDeadline: new Date("2026-10-05T15:00:00.000Z"),
        },
        now,
      ),
      [],
    );
  });
});
