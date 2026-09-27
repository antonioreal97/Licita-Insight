import assert from "node:assert/strict";
import { chunkPages, extractDocuments } from "../dist/document-extractor.mjs";

const fixturePdf = (text, pageCount) => {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const kids = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const pageObject = objects.length + 1;
    const contentObject = pageObject + 1;
    kids.push(`${pageObject} 0 R`);
    const escaped = `${text} Pagina ${page}.`.replace(/([\\()])/g, "\\$1");
    const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
};

const documents = await extractDocuments(
  fixturePdf("Participacao em consorcio permitida.", 29),
  "TEST DATA edital.pdf",
  40,
);
assert.equal(documents.length, 1);
assert.equal(documents[0].pages.length, 29);
assert.match(documents[0].pages[0], /Participacao em consorcio/);
assert.match(documents[0].pages[28], /Pagina 29/);
assert.equal(chunkPages(documents[0].pages).length, 29);
process.stdout.write("dist PDF extraction (29 pages): PASS\n");

const holdMs = Number(process.env.HOLD_AFTER_VERIFY_MS ?? 0);
if (Number.isFinite(holdMs) && holdMs > 0) {
  await new Promise((resolve) => setTimeout(resolve, holdMs));
}
