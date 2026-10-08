import { createHash } from "node:crypto";
import { unzipSync, type Unzipped } from "fflate";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type DocumentUnreadReason = "scanned_pdf" | "image" | "size_limit" | `unsupported_format:${string}`;
export type ExtractedDocument = { idSuffix: string; title: string; internalPath: string | null; pages: string[]; unreadReason?: DocumentUnreadReason };

const LOGICAL_PAGE_CHARACTERS = 12_000;
const MAX_ARCHIVE_FILES = 50;
const decoder = new TextDecoder();

export const normalizeExtractedText = (value: string): string => value.normalize("NFKC")
  .replace(/(\p{Ll})\s*\uFFFD\s*(?=\p{Ll})/gu, "$1ti").replace(/\uFFFD/g, "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "").replace(/[\t ]+/g, " ").trim();

type PositionedTextItem = { str: string; width: number; height: number; transform: number[]; hasEOL: boolean };
export const joinPositionedTextItems = (items: PositionedTextItem[]): string[] => {
  const lines: string[] = [];
  let current = "";
  let previous: PositionedTextItem | null = null;
  for (const item of items) {
    const value = item.str.normalize("NFKC");
    if (!value) {
      if (item.hasEOL && current) { lines.push(current); current = ""; }
      previous = item;
      continue;
    }
    const sameLine = previous !== null && Math.abs((item.transform[5] ?? 0) - (previous.transform[5] ?? 0)) <= Math.max(item.height, previous.height, 1) * 0.45;
    const previousEnd = previous ? (previous.transform[4] ?? 0) + previous.width : 0;
    const gap = previous ? (item.transform[4] ?? 0) - previousEnd : 0;
    const adjacent = previous !== null && sameLine && !previous.hasEOL && gap <= Math.max(item.height, previous.height, 1) * 0.18;
    const separated = /\s$/u.test(current) || /^\s|^[,.;:!?%)]/u.test(value);
    if (current && !adjacent && !separated) current += " ";
    current += value;
    if (item.hasEOL) { lines.push(current); current = ""; }
    previous = item;
  }
  if (current) lines.push(current);
  return lines.map(normalizeExtractedText).filter(Boolean);
};

export const normalizePdfPages = (pages: string[][]): string[] => {
  const counts = new Map<string, number>();
  for (const page of pages) for (const line of new Set(page.map(normalizeExtractedText).filter(Boolean))) counts.set(line, (counts.get(line) ?? 0) + 1);
  const repeated = new Set([...counts.entries()].filter(([line, count]) => pages.length >= 3 && line.length < 180 && count >= Math.ceil(pages.length * 0.6)).map(([line]) => line));
  return pages.map((page) => page.map(normalizeExtractedText).filter((line) => line && !repeated.has(line)).join("\n").replace(/\n{3,}/g, "\n\n").trim());
};

const extractPdfPages = async (bytes: Uint8Array, maxPages: number): Promise<string[]> => {
  const pdf = await getDocument({ data: bytes, useSystemFonts: true, useWorkerFetch: false }).promise;
  if (pdf.numPages > maxPages) throw new Error(`PDF_PAGE_LIMIT:${pdf.numPages}`);
  const rawPages: string[][] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const content = await (await pdf.getPage(pageNumber)).getTextContent();
    rawPages.push(joinPositionedTextItems(content.items.filter((item) => "str" in item)));
  }
  return normalizePdfPages(rawPages);
};

const isPdf = (bytes: Uint8Array) => decoder.decode(bytes.subarray(0, 5)) === "%PDF-";
const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2] ?? -1);
const isImage = (bytes: Uint8Array) => (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
  || (bytes[0] === 0x89 && decoder.decode(bytes.subarray(1, 4)) === "PNG")
  || (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0)
  || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a);
export const ocrKindForBytes = (bytes: Uint8Array): "pdf" | "image" | null => isPdf(bytes) ? "pdf" : isImage(bytes) ? "image" : null;
const suffixFor = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 20);
const leafName = (value: string) => value.split("/").pop() || value;

const decodeXml = (value: string): string => value
  .replace(/&#x([0-9a-f]+);/giu, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/gu, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
  .replace(/&quot;/gu, '"').replace(/&apos;/gu, "'").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&amp;/gu, "&");
const textFromXml = (xml: string) => normalizeExtractedText(decodeXml(xml.replace(/<[^>]+>/gu, " ")));

const logicalPages = (lines: string[], maxPages: number): string[] => {
  const pages: string[] = [];
  let page = "";
  const flush = () => {
    if (page.trim()) pages.push(page.trim());
    page = "";
    if (pages.length > maxPages) throw new Error(`DOCUMENT_PAGE_LIMIT:${pages.length}`);
  };
  for (const raw of lines) {
    let line = normalizeExtractedText(raw);
    while (line) {
      const room = LOGICAL_PAGE_CHARACTERS - page.length - (page ? 1 : 0);
      if (room < 1) { flush(); continue; }
      const part = line.slice(0, room);
      page += `${page ? "\n" : ""}${part}`;
      line = line.slice(part.length);
      if (line) flush();
    }
  }
  flush();
  return pages;
};

type ArchiveBudget = { bytes: number; files: number; maxBytes: number };
const unzipLimited = (bytes: Uint8Array, budget: ArchiveBudget, countFiles: boolean): Unzipped => {
  let violation: "ARCHIVE_FILE_LIMIT" | "ARCHIVE_SIZE_LIMIT" | null = null;
  const archive = unzipSync(bytes, { filter: (file) => {
    if (file.name.endsWith("/")) return false;
    if (countFiles && ++budget.files > MAX_ARCHIVE_FILES) { violation = "ARCHIVE_FILE_LIMIT"; return false; }
    if (file.originalSize > budget.maxBytes || budget.bytes + file.originalSize > budget.maxBytes) { violation = "ARCHIVE_SIZE_LIMIT"; return false; }
    budget.bytes += file.originalSize;
    return true;
  } });
  if (violation) throw new Error(violation);
  return archive;
};

type ZipFormat = "docx" | "odt" | "xlsx" | "ods" | "zip";
const zipFormat = (archive: Unzipped): ZipFormat => {
  const names = new Set(Object.keys(archive));
  const mime = archive.mimetype ? decoder.decode(archive.mimetype).trim() : "";
  if (names.has("word/document.xml")) return "docx";
  if (names.has("xl/workbook.xml") && [...names].some((name) => name.startsWith("xl/worksheets/"))) return "xlsx";
  if (mime === "application/vnd.oasis.opendocument.text") return "odt";
  if (mime === "application/vnd.oasis.opendocument.spreadsheet") return "ods";
  return "zip";
};

const wordLines = (xml: string): string[] => {
  const paragraphs = (xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/gu, "").match(/<w:p\b[\s\S]*?<\/w:p>/gu) ?? []).map(textFromXml);
  const rows = (xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/gu) ?? []).map((row) =>
    (row.match(/<w:tc\b[\s\S]*?<\/w:tc>/gu) ?? []).map(textFromXml).filter(Boolean).join("\t"),
  );
  return [...paragraphs, ...rows].filter(Boolean);
};
const odtLines = (xml: string): string[] => {
  const paragraphs = (xml.replace(/<table:table\b[\s\S]*?<\/table:table>/gu, "").match(/<text:p\b[\s\S]*?<\/text:p>/gu) ?? []).map(textFromXml);
  const rows = (xml.match(/<table:table-row\b[\s\S]*?<\/table:table-row>/gu) ?? []).map((row) =>
    (row.match(/<table:table-cell\b[\s\S]*?<\/table:table-cell>/gu) ?? []).map(textFromXml).join("\t"),
  );
  return [...paragraphs, ...rows].filter(Boolean);
};

const columnIndex = (reference: string) => [...(reference.match(/^[A-Z]+/u)?.[0] ?? "A")].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
const xlsxCellValue = (cell: string, shared: string[]): string => {
  const inline = cell.match(/<is\b[\s\S]*?<\/is>/u)?.[0];
  if (inline) return textFromXml(inline);
  const value = decodeXml(cell.match(/<v\b[^>]*>([\s\S]*?)<\/v>/u)?.[1] ?? "");
  return cell.match(/\bt="([^"]+)"/u)?.[1] === "s" ? shared[Number(value)] ?? "" : normalizeExtractedText(value);
};
const spreadsheetLines = (archive: Unzipped): string[] => {
  const sharedXml = archive["xl/sharedStrings.xml"] ? decoder.decode(archive["xl/sharedStrings.xml"]) : "";
  const shared = (sharedXml.match(/<si\b[\s\S]*?<\/si>/gu) ?? []).map(textFromXml);
  const workbook = archive["xl/workbook.xml"] ? decoder.decode(archive["xl/workbook.xml"]) : "";
  const names = [...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]+)"/gu)].map((match) => decodeXml(match[1] ?? ""));
  const sheets = Object.entries(archive).filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(name)).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  const lines: string[] = [];
  sheets.forEach(([, bytes], sheetIndex) => {
    lines.push(`Aba: ${names[sheetIndex] || `Planilha ${sheetIndex + 1}`}`);
    for (const row of decoder.decode(bytes).match(/<row\b[\s\S]*?<\/row>/gu) ?? []) {
      const values: string[] = [];
      for (const cell of row.match(/<c\b[\s\S]*?<\/c>/gu) ?? []) {
        const index = columnIndex(cell.match(/\br="([A-Z]+)\d+"/u)?.[1] ?? "A");
        values[index] = xlsxCellValue(cell, shared);
      }
      lines.push(values.map((value) => value ?? "").join("\t"));
    }
  });
  return lines;
};
const odsLines = (xml: string): string[] => {
  const lines: string[] = [];
  [...xml.matchAll(/<table:table\b([^>]*)>([\s\S]*?)<\/table:table>/gu)].forEach((match, index) => {
    lines.push(`Aba: ${decodeXml((match[1] ?? "").match(/table:name="([^"]+)"/u)?.[1] ?? `Planilha ${index + 1}`)}`);
    for (const row of (match[2] ?? "").match(/<table:table-row\b[\s\S]*?<\/table:table-row>/gu) ?? []) {
      lines.push((row.match(/<table:table-cell\b[\s\S]*?<\/table:table-cell>/gu) ?? []).map(textFromXml).join("\t"));
    }
  });
  return lines;
};

const csvRows = (text: string): string[] => {
  const first = text.split(/\r?\n/u)[0] ?? "";
  const delimiter = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0] ?? ",";
  const rows: string[] = [];
  let cells: string[] = [], cell = "", quoted = false;
  for (let index = 0; index <= text.length; index += 1) {
    const character = text[index] ?? "\n";
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted;
    } else if (!quoted && character === delimiter) { cells.push(cell); cell = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      cells.push(cell);
      if (cells.some((value) => value.trim())) rows.push(cells.map(normalizeExtractedText).join("\t"));
      cells = []; cell = "";
    } else cell += character;
  }
  return rows;
};
const textFormat = (bytes: Uint8Array): "csv" | "txt" | null => {
  if (!bytes.length || bytes.subarray(0, Math.min(bytes.length, 4096)).includes(0)) return null;
  const text = decoder.decode(bytes);
  if ([...text].filter((character) => character === "\uFFFD").length > Math.max(2, text.length * 0.01)) return null;
  const lines = text.split(/\r?\n/u).filter(Boolean).slice(0, 5);
  return [",", ";", "\t"].some((delimiter) => lines.length > 0 && lines.every((line) => line.split(delimiter).length > 1)) ? "csv" : "txt";
};
const unsupported = (title: string, internalPath: string | null, unreadReason: DocumentUnreadReason): ExtractedDocument => ({
  idSuffix: internalPath ? suffixFor(internalPath) : "unsupported", title, internalPath, pages: [], unreadReason,
});

async function extractOne(bytes: Uint8Array, title: string, internalPath: string | null, maxPages: number, budget: ArchiveBudget, zipDepth: number): Promise<ExtractedDocument[]> {
  const idSuffix = internalPath ? suffixFor(internalPath) : "document";
  if (isPdf(bytes)) {
    const pages = await extractPdfPages(bytes, maxPages);
    const readable = pages.some((page) => normalizeExtractedText(page).length >= 20);
    return [{ idSuffix: internalPath ? idSuffix : "pdf", title, internalPath, pages, ...(!readable ? { unreadReason: "scanned_pdf" as const } : {}) }];
  }
  if (isImage(bytes)) return [unsupported(title, internalPath, "image")];
  if (isZip(bytes)) {
    const archive = unzipLimited(bytes, budget, false);
    const format = zipFormat(archive);
    if (format === "docx") return archive["word/document.xml"] ? [{ idSuffix, title, internalPath, pages: logicalPages(wordLines(decoder.decode(archive["word/document.xml"])), maxPages) }] : [unsupported(title, internalPath, "unsupported_format:docx")];
    if (format === "odt") return archive["content.xml"] ? [{ idSuffix, title, internalPath, pages: logicalPages(odtLines(decoder.decode(archive["content.xml"])), maxPages) }] : [unsupported(title, internalPath, "unsupported_format:odt")];
    if (format === "xlsx") return [{ idSuffix, title, internalPath, pages: logicalPages(spreadsheetLines(archive), maxPages) }];
    if (format === "ods") return archive["content.xml"] ? [{ idSuffix, title, internalPath, pages: logicalPages(odsLines(decoder.decode(archive["content.xml"])), maxPages) }] : [unsupported(title, internalPath, "unsupported_format:ods")];
    if (zipDepth >= 2) return [unsupported(title, internalPath, "unsupported_format:nested_zip")];
    const entries = archive;
    budget.files += Object.keys(entries).length;
    if (budget.files > MAX_ARCHIVE_FILES) throw new Error("ARCHIVE_FILE_LIMIT");
    const extracted: ExtractedDocument[] = [];
    for (const [name, content] of Object.entries(entries)) {
      const path = internalPath ? `${internalPath}!/${name}` : name;
      extracted.push(...await extractOne(content, leafName(name), path, maxPages, budget, isZip(content) ? zipDepth + 1 : zipDepth));
    }
    return extracted.length > 0 ? extracted : [unsupported(title, internalPath, "unsupported_format:zip")];
  }
  const format = textFormat(bytes);
  if (format) {
    const text = decoder.decode(bytes).replace(/^\uFEFF/u, "");
    return [{ idSuffix, title, internalPath, pages: logicalPages(format === "csv" ? ["Aba: CSV", ...csvRows(text)] : text.split(/\r?\n/u), maxPages) }];
  }
  return [unsupported(title, internalPath, "unsupported_format:binary")];
}

export async function extractDocuments(bytes: Uint8Array, title: string, maxPages: number, maxUncompressedBytes = 50 * 1024 * 1024): Promise<ExtractedDocument[]> {
  const budget: ArchiveBudget = { bytes: 0, files: 0, maxBytes: maxUncompressedBytes };
  try { return await extractOne(bytes, title, null, maxPages, budget, 0); }
  catch (error) {
    if (error instanceof Error && ["ARCHIVE_SIZE_LIMIT", "ARCHIVE_FILE_LIMIT"].includes(error.message)) return [unsupported(title, null, "size_limit")];
    throw error;
  }
}

export function documentBytesAtPath(bytes: Uint8Array, internalPath: string | null, maxUncompressedBytes = 50 * 1024 * 1024): Uint8Array {
  if (!internalPath) return bytes;
  const parts = internalPath.split("!/");
  if (parts.length > 2) throw new Error("ARCHIVE_NESTING_LIMIT");
  const budget: ArchiveBudget = { bytes: 0, files: 0, maxBytes: maxUncompressedBytes };
  let current = bytes;
  for (const part of parts) {
    if (!isZip(current)) throw new Error("ARCHIVE_ENTRY_PARENT_INVALID");
    const entry = unzipLimited(current, budget, false)[part];
    if (!entry) throw new Error("ARCHIVE_ENTRY_NOT_FOUND");
    current = entry;
  }
  return current;
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
        current = current.slice(-20); order += 1;
      }
      current.push(word);
    }
    if (current.length > 0) chunks.push({ page: pageIndex + 1, order, text: current.join(" ") });
  });
  return chunks;
}
