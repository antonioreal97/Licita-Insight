import assert from "node:assert/strict";
import test from "node:test";
import { LOG_REDACT_PATHS } from "./logger";

test("application log redaction covers authentication, email and network identifiers", () => {
  for (const path of ["req.headers.authorization", "req.headers.cookie", "email", "*.email", "recipientEmail", "ip", "*.ip", "remoteAddress"]) {
    assert.ok(LOG_REDACT_PATHS.includes(path as (typeof LOG_REDACT_PATHS)[number]), `${path} must be redacted`);
  }
});
