import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type ExtractedDocument = {
  idSuffix: string;
  title: string;
  internalPath: string | null;
  pages: string[];
};

const normalizeLine = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/\uFFFD/g, "")
    .replace(/[\t ]+/g, " ")
    .trim();

export const normalizePdfPages = (pages: string[][]): string[] => {
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const line of new Set(page.map(normalizeLine).filter(Boolean))) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  const repeated = new Set(
    [...counts.entries()]
      .filter(([line, count]) => pages.length >= 3 && line.length < 180 && count >= Math.ceil(pages.length * 0.6))
      .map(([line]) => line),
  );
  return pages.map((page) =>
    page
      .map(normalizeLine)
      .filter((line) => line && !repeated.has(line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
};

const extractPdfPages = async (bytes: Uint8Array, maxPages: number): Promise<string[]> => {
  const pdf = await getDocument({ data: bytes, useSystemFonts: true, useWorkerFetch: false }).promise;
  if (pdf.numPages > maxPages) throw new Error(`PDF_PAGE_LIMIT:${pdf.numPages}`);
  const rawPages: string[][] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let current = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      current += `${current ? " " : ""}${item.str}`;
      if (item.hasEOL) {
        lines.push(current);
        current = "";
      }
    }
    if (current) lines.push(current);
    rawPages.push(lines);
  }
  return normalizePdfPages(rawPages);
};

const isPdf = (bytes: Uint8Array): boolean =>
  new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";

const isZip = (bytes: Uint8Array): boolean =>
  bytes[0] === 0x50 && bytes[1] === 0x4b;

const suffixFor = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 20);

export async function extractDocuments(
  bytes: Uint8Array,
  title: string,
  maxPages: number,
  maxUncompressedBytes = 50 * 1024 * 1024,
): Promise<ExtractedDocument[]> {
  if (isPdf(bytes)) {
    return [{ idSuffix: "pdf", title, internalPath: null, pages: await extractPdfPages(bytes, maxPages) }];
  }
  if (!isZip(bytes)) return [];
  let extractedBytes = 0;
  let extractedFiles = 0;
  const archive = unzipSync(bytes, {
    filter: (file) => {
      if (!file.name.toLowerCase().endsWith(".pdf") || extractedFiles >= 50) return false;
      if (file.originalSize > maxUncompressedBytes || extractedBytes + file.originalSize > maxUncompressedBytes) return false;
      extractedBytes += file.originalSize;
      extractedFiles += 1;
      return true;
    },
  });
  const pdfEntries = Object.entries(archive).filter(([, content]) => isPdf(content));
  const extracted: ExtractedDocument[] = [];
  for (const [name, content] of pdfEntries) {
    extracted.push({
      idSuffix: suffixFor(name),
      title: name.split("/").pop() || name,
      internalPath: name,
      pages: await extractPdfPages(content, maxPages),
    });
  }
  return extracted;
}

export function chunkPages(pages: string[], maxCharacters = 700): Array<{ page: number; order: number; text: string }> {
  const chunks: Array<{ page: number; order: number; text: string }> = [];
  pages.forEach((pageText, pageIndex) => {
    const words = pageText.split(/\s+/).filter(Boolean);
    let current: string[] = [];
    let order = 0;
    for (const word of words) {
      if (current.length > 0 && `${current.join(" ")} ${word}`.length > maxCharacters) {
        chunks.push({ page: pageIndex + 1, order, text: current.join(" ") });
        current = current.slice(-20);
        order += 1;
      }
      current.push(word);
    }
    if (current.length > 0) chunks.push({ page: pageIndex + 1, order, text: current.join(" ") });
  });
  return chunks;
}
