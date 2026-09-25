import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type ExtractedDocument = {
  idSuffix: string;
  title: string;
  internalPath: string | null;
  pages: string[];
};

export const normalizeExtractedText = (value: string): string =>
  value
    .normalize("NFKC")
    .replace(/(\p{Ll})\s*\uFFFD\s*(?=\p{Ll})/gu, "$1ti")
    .replace(/\uFFFD/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/[\t ]+/g, " ")
    .trim();

type PositionedTextItem = {
  str: string;
  width: number;
  height: number;
  transform: number[];
  hasEOL: boolean;
};

export const joinPositionedTextItems = (items: PositionedTextItem[]): string[] => {
  const lines: string[] = [];
  let current = "";
  let previous: PositionedTextItem | null = null;
  for (const item of items) {
    const value = item.str.normalize("NFKC");
    if (!value) {
      if (item.hasEOL && current) {
        lines.push(current);
        current = "";
      }
      previous = item;
      continue;
    }
    const sameLine = previous !== null && Math.abs((item.transform[5] ?? 0) - (previous.transform[5] ?? 0)) <= Math.max(item.height, previous.height, 1) * 0.45;
    const previousEnd = previous ? (previous.transform[4] ?? 0) + previous.width : 0;
    const gap = previous ? (item.transform[4] ?? 0) - previousEnd : 0;
    const adjacent = previous !== null && sameLine && !previous.hasEOL && gap <= Math.max(item.height, previous.height, 1) * 0.18;
    const alreadySeparated = /\s$/u.test(current) || /^\s|^[,.;:!?%)]/u.test(value);
    if (current && !adjacent && !alreadySeparated) current += " ";
    current += value;
    if (item.hasEOL) {
      lines.push(current);
      current = "";
    }
    previous = item;
  }
  if (current) lines.push(current);
  return lines.map(normalizeExtractedText).filter(Boolean);
};

export const normalizePdfPages = (pages: string[][]): string[] => {
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const line of new Set(page.map(normalizeExtractedText).filter(Boolean))) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  const repeated = new Set(
    [...counts.entries()].filter(([line, count]) => pages.length >= 3 && line.length < 180 && count >= Math.ceil(pages.length * 0.6)).map(([line]) => line),
  );
  return pages.map((page) =>
    page
      .map(normalizeExtractedText)
      .filter((line) => line && !repeated.has(line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
};

const extractPdfPages = async (bytes: Uint8Array, maxPages: number): Promise<string[]> => {
  const pdf = await getDocument({
    data: bytes,
    useSystemFonts: true,
    useWorkerFetch: false,
  }).promise;
  if (pdf.numPages > maxPages) throw new Error(`PDF_PAGE_LIMIT:${pdf.numPages}`);
  const rawPages: string[][] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const textItems = content.items.filter((item) => "str" in item);
    rawPages.push(joinPositionedTextItems(textItems));
  }
  return normalizePdfPages(rawPages);
};

const isPdf = (bytes: Uint8Array): boolean => new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";

const isZip = (bytes: Uint8Array): boolean => bytes[0] === 0x50 && bytes[1] === 0x4b;

const suffixFor = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 20);

export async function extractDocuments(
  bytes: Uint8Array,
  title: string,
  maxPages: number,
  maxUncompressedBytes = 50 * 1024 * 1024,
): Promise<ExtractedDocument[]> {
  if (isPdf(bytes)) {
    return [
      {
        idSuffix: "pdf",
        title,
        internalPath: null,
        pages: await extractPdfPages(bytes, maxPages),
      },
    ];
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
