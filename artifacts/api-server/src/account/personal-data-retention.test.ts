import assert from "node:assert/strict";
import test from "node:test";
import { msUntilRetentionHour, personalDataRetentionConfig } from "./personal-data-retention";

test("personal data retention defaults run at 03:00, away from the 06:00 ingest", () => {
  const saved = { ...process.env };
  delete process.env.SESSION_RETENTION_DAYS;
  delete process.env.READ_NOTIFICATION_RETENTION_DAYS;
  delete process.env.EMAIL_CONTENT_RETENTION_DAYS;
  delete process.env.PERSONAL_DATA_RETENTION_HOUR;
  try {
    assert.deepEqual(personalDataRetentionConfig(), {
      sessionDays: 30,
      readNotificationDays: 180,
      emailContentDays: 180,
      hour: 3,
    });
    assert.equal(msUntilRetentionHour(3, new Date("2026-10-08T05:00:00.000Z")), 3_600_000);
    assert.equal(msUntilRetentionHour(3, new Date("2026-10-08T07:00:00.000Z")), 23 * 3_600_000);
  } finally {
    process.env = saved;
  }
});

test("personal data retention periods and hour are configurable", () => {
  const saved = { ...process.env };
  process.env.SESSION_RETENTION_DAYS = "45";
  process.env.READ_NOTIFICATION_RETENTION_DAYS = "200";
  process.env.EMAIL_CONTENT_RETENTION_DAYS = "210";
  process.env.PERSONAL_DATA_RETENTION_HOUR = "2";
  try {
    assert.deepEqual(personalDataRetentionConfig(), {
      sessionDays: 45,
      readNotificationDays: 200,
      emailContentDays: 210,
      hour: 2,
    });
  } finally {
    process.env = saved;
  }
});
