import { documentOcrConfig } from "./config";

export type OcrPage = {
  page: number;
  text: string;
  confidence: number;
  lowConfidence: boolean;
};

export type OcrResult = {
  pages: OcrPage[];
  averageConfidence: number;
};

export class OcrClientError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "OcrClientError";
  }
}

const validPage = (value: unknown): value is OcrPage => {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return Number.isSafeInteger(page.page) && Number(page.page) > 0
    && typeof page.text === "string"
    && typeof page.confidence === "number" && Number.isFinite(page.confidence)
    && page.confidence >= 0 && page.confidence <= 100
    && typeof page.lowConfidence === "boolean";
};

export async function recognizeDocument(
  bytes: Uint8Array,
  kind: "pdf" | "image",
  fetchImpl: typeof fetch = fetch,
): Promise<OcrResult> {
  const config = documentOcrConfig();
  const timeoutMs = config.maxPages * (config.pageTimeoutMs + 5_000);
  let response: Response;
  try {
    response = await fetchImpl(`${config.url}/ocr`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(bytes.byteLength),
        "x-document-kind": kind,
        "x-max-pages": String(config.maxPages),
        "x-page-timeout-ms": String(config.pageTimeoutMs),
      },
      body: bytes,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new OcrClientError(error instanceof Error ? `OCR request failed: ${error.message}` : "OCR request failed");
  }
  if (!response.ok) throw new OcrClientError(`OCR service returned HTTP ${response.status}`, response.status);
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || !Array.isArray(payload.pages) || !payload.pages.every(validPage)) {
    throw new OcrClientError("OCR service returned an invalid response");
  }
  if (payload.pages.length > config.maxPages) throw new OcrClientError("OCR service exceeded the configured page limit");
  const pages = payload.pages as OcrPage[];
  const averageConfidence = typeof payload.averageConfidence === "number" && Number.isFinite(payload.averageConfidence)
    ? Math.min(100, Math.max(0, payload.averageConfidence))
    : pages.reduce((total, page) => total + page.confidence, 0) / Math.max(1, pages.length);
  return { pages, averageConfidence };
}
