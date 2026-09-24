import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  tenderChanges,
  type TenderNotificationState,
} from "./notification-change";

const baseline: TenderNotificationState = {
  id: "TEST-TENDER",
  title: "TEST DATA",
  tenderNumberShort: "001/2026",
  organizationName: "TEST ORGANIZATION",
  status: "open",
  proposalDeadline: new Date("2026-10-01T18:00:00.000Z"),
  estimatedValue: "100.00",
  estimatedValueStatus: "published",
};

describe("tender notification diff", () => {
  it("does not create changes for an unchanged revision", () => {
    assert.deepEqual(tenderChanges(baseline, { ...baseline }), []);
  });

  it("reports deadline, status and value changes with public field names", () => {
    const changes = tenderChanges(baseline, {
      ...baseline,
      status: "suspended",
      proposalDeadline: new Date("2026-10-02T18:00:00.000Z"),
      estimatedValue: "120.50",
      estimatedValueStatus: "estimated",
    });

    assert.deepEqual(
      changes.map(({ type, change }) => [type, change.field]),
      [
        ["tender_deadline_changed", "proposalDeadline"],
        ["tender_status_changed", "status"],
        ["tender_value_changed", "estimatedValue"],
        ["tender_value_changed", "estimatedValueStatus"],
      ],
    );
  });
});
