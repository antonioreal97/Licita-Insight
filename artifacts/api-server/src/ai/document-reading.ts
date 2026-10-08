import { eq } from "drizzle-orm";
import { db, tenderAiDocumentsTable } from "@workspace/db";

export type DocumentReadingReason = "scanned_pdf" | "image" | "size_limit" | "download_error" | "ocr_failed" | `unsupported_format:${string}`;

export type DocumentReadingSummary = {
  read: number;
  total: number;
  unread: Array<{
    id: string;
    title: string;
    url: string;
    reason: DocumentReadingReason;
  }>;
};

const publicReason = (status: string, error: string | null): DocumentReadingReason => {
  if (error === "scanned_pdf" || error === "DOCUMENT_WITHOUT_READABLE_TEXT") return "scanned_pdf";
  if (error === "image") return "image";
  if (error === "size_limit" || error?.includes("SIZE_LIMIT") || error?.includes("PAGE_LIMIT")) return "size_limit";
  if (error?.startsWith("unsupported_format:")) return error as `unsupported_format:${string}`;
  if (error?.startsWith("ocr_") || error?.startsWith("ocr_failed:")) return "ocr_failed";
  if (status === "failed") return "download_error";
  return "unsupported_format:unknown";
};

export const summarizeDocumentReading = (documents: Array<{
  id: string;
  title: string;
  sourceUrl: string;
  status: string;
  error: string | null;
}>): DocumentReadingSummary => ({
  read: documents.filter(({ status }) => status === "ready").length,
  total: documents.length,
  unread: documents
    .filter(({ status }) => status === "failed" || status === "unsupported")
    .map(({ id, title, sourceUrl, status, error }) => ({ id, title, url: sourceUrl, reason: publicReason(status, error) })),
});

export async function documentReadingForTender(tenderId: string): Promise<DocumentReadingSummary> {
  const documents = await db
    .select({
      id: tenderAiDocumentsTable.id,
      title: tenderAiDocumentsTable.title,
      sourceUrl: tenderAiDocumentsTable.sourceUrl,
      status: tenderAiDocumentsTable.status,
      error: tenderAiDocumentsTable.error,
    })
    .from(tenderAiDocumentsTable)
    .where(eq(tenderAiDocumentsTable.tenderId, tenderId));
  return summarizeDocumentReading(documents);
}
