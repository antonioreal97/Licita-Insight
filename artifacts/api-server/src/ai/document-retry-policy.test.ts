import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyDocumentFailure,
  DocumentFetchError,
  documentRetryDelayMs,
  documentRetrySchedule,
} from "./document-retry-policy";

test("document retry backoff is 5 min, 30 min, 2 h, then daily", () => {
  assert.equal(documentRetryDelayMs(1), 5 * 60_000);
  assert.equal(documentRetryDelayMs(2), 30 * 60_000);
  assert.equal(documentRetryDelayMs(3), 2 * 60 * 60_000);
  assert.equal(documentRetryDelayMs(4), 24 * 60 * 60_000);
  assert.equal(documentRetryDelayMs(9), 24 * 60 * 60_000);
});

test("retry schedule respects nextRetryAt and configured attempt ceiling", () => {
  const now = new Date("2026-09-25T12:00:00.000Z");
  assert.deepEqual(documentRetrySchedule("transient", 1, 6, now), {
    retryable: true,
    nextRetryAt: new Date("2026-09-25T12:05:00.000Z"),
  });
  assert.deepEqual(documentRetrySchedule("transient", 6, 6, now), {
    retryable: false,
    nextRetryAt: null,
  });
  assert.deepEqual(documentRetrySchedule("permanent", 1, 6, now), {
    retryable: false,
    nextRetryAt: null,
  });
});

test("HTTP timeout/429/5xx are transient while 404 and invalid files are permanent", () => {
  assert.equal(
    classifyDocumentFailure(
      new DocumentFetchError("DOCUMENT_HTTP_429", "transient"),
    ),
    "transient",
  );
  assert.equal(
    classifyDocumentFailure(
      new DocumentFetchError("DOCUMENT_HTTP_503", "transient"),
    ),
    "transient",
  );
  assert.equal(
    classifyDocumentFailure(
      new DocumentFetchError("DOCUMENT_HTTP_404", "permanent"),
    ),
    "permanent",
  );
  assert.equal(classifyDocumentFailure(new Error("Invalid PDF")), "permanent");
  assert.equal(
    classifyDocumentFailure(new DOMException("timed out", "TimeoutError")),
    "transient",
  );
});
