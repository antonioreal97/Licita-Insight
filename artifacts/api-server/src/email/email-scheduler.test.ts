import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { millisecondsUntilSaoPauloHour } from "../lib/sao-paulo-schedule";
import { resolveNotificationJobSchedule } from "./email-scheduler-plan";

describe("email digest schedule", () => {
  it("schedules 07:00 in America/Sao_Paulo", () => {
    assert.equal(
      millisecondsUntilSaoPauloHour(7, new Date("2026-09-24T09:30:00.000Z")),
      30 * 60 * 1_000,
    );
    assert.equal(
      millisecondsUntilSaoPauloHour(7, new Date("2026-09-24T10:00:01.000Z")),
      24 * 60 * 60 * 1_000 - 1_000,
    );
  });
});

describe("notification job schedule", () => {
  it("keeps in-app notification evaluation enabled when email delivery is disabled", () => {
    assert.deepEqual(
      resolveNotificationJobSchedule({
        DATABASE_URL: "postgres://example",
        EMAIL_JOBS_ENABLED: "false",
      }),
      {
        databaseAvailable: true,
        emailDeliveryEnabled: false,
        savedSearchEvaluation: true,
        profileAlertEvaluation: true,
        immediateEmail: false,
        emailDigest: false,
        emailRetries: false,
      },
    );
  });

  it("enables in-app evaluation and email delivery jobs by default", () => {
    assert.deepEqual(
      resolveNotificationJobSchedule({ DATABASE_URL: "postgres://example" }),
      {
        databaseAvailable: true,
        emailDeliveryEnabled: true,
        savedSearchEvaluation: true,
        profileAlertEvaluation: true,
        immediateEmail: true,
        emailDigest: true,
        emailRetries: true,
      },
    );
  });

  it("does not schedule notification jobs without DATABASE_URL", () => {
    assert.deepEqual(resolveNotificationJobSchedule({}), {
      databaseAvailable: false,
      emailDeliveryEnabled: true,
      savedSearchEvaluation: false,
      profileAlertEvaluation: false,
      immediateEmail: false,
      emailDigest: false,
      emailRetries: false,
    });
  });
});
