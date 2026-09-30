import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deadlineForSavedTender,
  digestDeadlineWindowEnd,
  isInDigestDeadlineWindow,
  nearestDeadline,
  relativeDeadlineDay,
  sortDeadlines,
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

  it("returns one entry per tender with both deadlines inside the window", () => {
    const deadline = deadlineForSavedTender(row, now)!;
    assert.equal(deadline.personalDeadline, row.nextActionDeadline);
    assert.equal(deadline.proposalDeadline, row.proposalDeadline);
    assert.equal(nearestDeadline(deadline), row.proposalDeadline);
  });

  it("ignores other personal stages, inactive tenders and deadlines outside the window", () => {
    for (const stage of ["submitted", "awaiting_result", "completed", "dismissed"]) {
      assert.equal(deadlineForSavedTender({ ...row, stage }, now), null);
    }
    const cancelled = deadlineForSavedTender({ ...row, tenderStatus: "cancelled" }, now)!;
    assert.equal(cancelled.proposalDeadline, null);
    assert.equal(nearestDeadline(cancelled), row.nextActionDeadline);
    assert.equal(
      deadlineForSavedTender(
        {
          ...row,
          nextActionDeadline: new Date("2026-09-29T09:00:00.000Z"),
          proposalDeadline: new Date("2026-10-05T15:00:00.000Z"),
        },
        now,
      ),
      null,
    );
  });

  it("sorts tenders by their closest deadline", () => {
    const personalFirst = deadlineForSavedTender(
      { ...row, tenderId: "tender-a", nextActionDeadline: new Date("2026-09-30T12:00:00.000Z") },
      now,
    )!;
    const proposalOnly = deadlineForSavedTender(
      { ...row, tenderId: "tender-b", nextActionDeadline: null, proposalDeadline: new Date("2026-09-30T13:00:00.000Z") },
      now,
    )!;
    const later = deadlineForSavedTender(
      { ...row, tenderId: "tender-c", proposalDeadline: new Date("2026-10-02T15:00:00.000Z") },
      now,
    )!;
    assert.deepEqual(
      sortDeadlines([later, proposalOnly, personalFirst]).map(({ tenderId }) => tenderId),
      ["tender-a", "tender-b", "tender-c"],
    );
  });
});
