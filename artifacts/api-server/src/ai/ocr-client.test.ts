import assert from "node:assert/strict";
import { test } from "node:test";
import { OcrClientError, recognizeDocument } from "./ocr-client";

test("OCR client posts bounded configuration and parses pages", async () => {
  process.env.DOCUMENT_OCR_URL = "http://ocr.test/";
  process.env.DOCUMENT_OCR_MAX_PAGES = "3";
  process.env.DOCUMENT_OCR_PAGE_TIMEOUT_MS = "1200";
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const mockedFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({ pages: [{ page: 1, text: "Edital digitalizado", confidence: 82.5, lowConfidence: false }], averageConfidence: 82.5 });
  };
  const result = await recognizeDocument(new Uint8Array([1, 2, 3]), "pdf", mockedFetch);
  assert.equal(result.pages[0]?.text, "Edital digitalizado");
  assert.equal(calls[0]?.url, "http://ocr.test/ocr");
  assert.equal(new Headers(calls[0]?.init?.headers).get("x-max-pages"), "3");
  assert.equal(new Headers(calls[0]?.init?.headers).get("x-page-timeout-ms"), "1200");
  assert.equal(new Headers(calls[0]?.init?.headers).get("x-document-kind"), "pdf");
});

test("OCR client rejects HTTP and malformed responses", async () => {
  await assert.rejects(
    recognizeDocument(new Uint8Array([1]), "image", async () => new Response("busy", { status: 503 })),
    (error: unknown) => error instanceof OcrClientError && error.status === 503,
  );
  await assert.rejects(
    recognizeDocument(new Uint8Array([1]), "image", async () => Response.json({ pages: [{ page: 0 }] })),
    /invalid response/u,
  );
});
