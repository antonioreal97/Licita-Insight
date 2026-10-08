import type { DocumentUnreadReason } from "./document-extractor";

export const ocrEligibleReason = (reason: DocumentUnreadReason | undefined): boolean => reason === "scanned_pdf" || reason === "image";

export const extractionDocumentStatus = (
  hasText: boolean,
  reason: DocumentUnreadReason | undefined,
  ocrEnabled: boolean,
): "ready" | "unsupported" | "ocr_processing" => {
  if (hasText) return "ready";
  return ocrEnabled && ocrEligibleReason(reason) ? "ocr_processing" : "unsupported";
};
