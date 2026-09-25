import assert from "node:assert/strict";
import { test } from "node:test";
import { zipSync } from "fflate";
import { chunkPages, extractDocuments, normalizePdfPages } from "./document-extractor";

function fixturePdf(text: string): Uint8Array {
  const escaped = text.replace(/([\\()])/g, "\\$1");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

test("extracts native PDF text with its page", async () => {
  const documents = await extractDocuments(fixturePdf("Prazo para impugnar: tres dias."), "edital.pdf", 10);
  assert.equal(documents.length, 1);
  assert.equal(documents[0]?.pages.length, 1);
  assert.match(documents[0]?.pages[0] ?? "", /Prazo para impugnar/);
  assert.deepEqual(chunkPages(documents[0]!.pages).map(({ page }) => page), [1]);
});

test("opens PDFs embedded in ZIP and preserves the inner filename", async () => {
  const archive = zipSync({ "anexos/edital.pdf": fixturePdf("Garantia contratual de cinco por cento.") });
  const documents = await extractDocuments(archive, "documentos.zip", 10);
  assert.equal(documents[0]?.title, "edital.pdf");
  assert.equal(documents[0]?.internalPath, "anexos/edital.pdf");
});

test("normalizes ligatures and removes repeated headers", () => {
  const pages = normalizePdfPages([
    ["SEI/CORREIOS 1 of 3", "A ﬁnalidade da participação"],
    ["SEI/CORREIOS 1 of 3", "Conteúdo dois"],
    ["SEI/CORREIOS 1 of 3", "Conteúdo três"],
  ]);
  assert.doesNotMatch(pages.join(" "), /SEI\/CORREIOS/);
  assert.match(pages[0]!, /finalidade/);
});

test("a PDF without extractable text is represented without passages", async () => {
  const documents = await extractDocuments(fixturePdf(""), "scan.pdf", 10);
  assert.equal(chunkPages(documents[0]!.pages).length, 0);
});
