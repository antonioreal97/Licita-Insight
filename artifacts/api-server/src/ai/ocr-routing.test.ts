import assert from "node:assert/strict";
import { test } from "node:test";
import { extractionDocumentStatus } from "./ocr-routing";

test("routes scanned PDFs and images to OCR only when enabled", () => {
  assert.equal(extractionDocumentStatus(false, "scanned_pdf", true), "ocr_processing");
  assert.equal(extractionDocumentStatus(false, "image", true), "ocr_processing");
  assert.equal(extractionDocumentStatus(false, "scanned_pdf", false), "unsupported");
  assert.equal(extractionDocumentStatus(false, "image", false), "unsupported");
});

test("does not send unsupported formats to OCR and keeps readable text ready", () => {
  assert.equal(extractionDocumentStatus(false, "unsupported_format:binary", true), "unsupported");
  assert.equal(extractionDocumentStatus(true, undefined, true), "ready");
});
