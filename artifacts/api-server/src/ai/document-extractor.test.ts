import assert from "node:assert/strict";
import { test } from "node:test";
import { zipSync } from "fflate";
import { chunkPages, extractDocuments, joinPositionedTextItems, normalizeExtractedText, normalizePdfPages } from "./document-extractor";

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
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

const encoded = (value: string) => new TextEncoder().encode(value);

const fixtureDocx = () => zipSync({
  "[Content_Types].xml": encoded('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
  "word/document.xml": encoded('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Prazo de entrega em dez dias</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Quantidade</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'),
});

const fixtureOdt = () => zipSync({
  mimetype: encoded("application/vnd.oasis.opendocument.text"),
  "content.xml": encoded('<office:document-content xmlns:office="urn:o" xmlns:text="urn:t" xmlns:table="urn:tb"><office:body><office:text><text:p>Visita técnica facultativa</text:p><table:table><table:table-row><table:table-cell><text:p>Lote</text:p></table:table-cell><table:table-cell><text:p>Valor</text:p></table:table-cell></table:table-row></table:table></office:text></office:body></office:document-content>'),
});

const fixtureXlsx = () => zipSync({
  "[Content_Types].xml": encoded('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
  "xl/workbook.xml": encoded('<workbook><sheets><sheet name="Itens" sheetId="1"/></sheets></workbook>'),
  "xl/sharedStrings.xml": encoded('<sst><si><t>Descrição</t></si><si><t>Câmera</t></si></sst>'),
  "xl/worksheets/sheet1.xml": encoded('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>12</v></c></row></sheetData></worksheet>'),
});

const fixtureOds = () => zipSync({
  mimetype: encoded("application/vnd.oasis.opendocument.spreadsheet"),
  "content.xml": encoded('<office:document-content xmlns:office="urn:o" xmlns:text="urn:t" xmlns:table="urn:tb"><office:body><office:spreadsheet><table:table table:name="Lotes"><table:table-row><table:table-cell><text:p>Objeto</text:p></table:table-cell><table:table-cell><text:p>Preço</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell><text:p>Projetor</text:p></table:table-cell><table:table-cell><text:p>1500</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>'),
});

test("extracts native PDF text with its page", async () => {
  const documents = await extractDocuments(fixturePdf("Prazo para impugnar: tres dias."), "edital.pdf", 10);
  assert.equal(documents.length, 1);
  assert.equal(documents[0]?.pages.length, 1);
  assert.match(documents[0]?.pages[0] ?? "", /Prazo para impugnar/);
  assert.deepEqual(
    chunkPages(documents[0]!.pages).map(({ page }) => page),
    [1],
  );
});

test("opens PDFs embedded in ZIP and preserves the inner filename", async () => {
  const archive = zipSync({
    "anexos/edital.pdf": fixturePdf("Garantia contratual de cinco por cento."),
  });
  const documents = await extractDocuments(archive, "documentos.zip", 10);
  assert.equal(documents[0]?.title, "edital.pdf");
  assert.equal(documents[0]?.internalPath, "anexos/edital.pdf");
});

test("detects DOCX, ODT and XLSX by their ZIP structure instead of the extension", async () => {
  const docx = await extractDocuments(fixtureDocx(), "arquivo.bin", 10);
  assert.match(docx[0]?.pages.join(" ") ?? "", /Prazo de entrega/);
  assert.match(docx[0]?.pages.join("\n") ?? "", /Item Quantidade/);
  const odt = await extractDocuments(fixtureOdt(), "sem-extensao", 10);
  assert.match(odt[0]?.pages.join(" ") ?? "", /Visita técnica facultativa/);
  assert.match(odt[0]?.pages.join("\n") ?? "", /Lote Valor/);
  const xlsx = await extractDocuments(fixtureXlsx(), "dados.zip", 10);
  assert.match(xlsx[0]?.pages.join("\n") ?? "", /Aba: Itens/);
  assert.match(xlsx[0]?.pages.join("\n") ?? "", /Câmera 12/);
});

test("reads accepted formats and one nested ZIP level", async () => {
  const nested = zipSync({ "inner.zip": zipSync({ "edital.dat": fixturePdf("Garantia de proposta exigida."), "anexo.txt": encoded("Texto complementar do edital") }) });
  const documents = await extractDocuments(nested, "pacote", 10);
  assert.equal(documents.length, 2);
  assert.ok(documents.some(({ internalPath }) => internalPath === "inner.zip!/edital.dat"));
  assert.ok(documents.some(({ title, pages }) => title === "anexo.txt" && pages.join(" ").includes("Texto complementar")));
});

test("extracts ODS, CSV and TXT into bounded logical pages", async () => {
  const ods = await extractDocuments(fixtureOds(), "planilha", 10);
  assert.match(ods[0]?.pages.join("\n") ?? "", /Aba: Lotes/);
  assert.match(ods[0]?.pages.join("\n") ?? "", /Projetor 1500/);
  const csv = await extractDocuments(encoded('item;quantidade\n"Cabo HDMI";25'), "dados.bin", 10);
  assert.match(csv[0]?.pages.join("\n") ?? "", /Aba: CSV/);
  assert.match(csv[0]?.pages.join("\n") ?? "", /Cabo HDMI 25/);
  const txt = await extractDocuments(encoded("Termo de referência com especificações técnicas."), "arquivo.dat", 10);
  assert.match(txt[0]?.pages.join(" ") ?? "", /especificações técnicas/);
});

test("rejects an archive whose uncompressed contents exceed the configured limit", async () => {
  const archive = zipSync({ "muito-grande.txt": encoded("A".repeat(2_000)) });
  const documents = await extractDocuments(archive, "bomba.zip", 10, 100);
  assert.equal(documents[0]?.unreadReason, "size_limit");
  assert.equal(documents[0]?.pages.length, 0);
});

test("normalizes ligatures and removes repeated headers", () => {
  const pages = normalizePdfPages([
    ["SEI/CORREIOS 1 of 3", "A ﬁnalidade da participação"],
    ["SEI/CORREIOS 1 of 3", "Conteúdo dois"],
    ["SEI/CORREIOS 1 of 3", "Conteúdo três"],
  ]);
  assert.doesNotMatch(pages.join(" "), /SEI\/CORREIOS/);
  assert.match(pages[0]!, /finalidade/);
  assert.equal(normalizeExtractedText("par�cipação admi�da"), "participação admitida");
  assert.equal(normalizeExtractedText("Prazo\u0000 de\u0007 entrega\u009F: 10 dias"), "Prazo de entrega: 10 dias");
  assert.deepEqual(
    joinPositionedTextItems([
      {
        str: "de",
        width: 10,
        height: 10,
        transform: [1, 0, 0, 1, 0, 10],
        hasEOL: false,
      },
      {
        str: "fi",
        width: 7,
        height: 10,
        transform: [1, 0, 0, 1, 10.2, 10],
        hasEOL: false,
      },
      {
        str: "nição",
        width: 20,
        height: 10,
        transform: [1, 0, 0, 1, 17.3, 10],
        hasEOL: false,
      },
      {
        str: "h",
        width: 5,
        height: 10,
        transform: [1, 0, 0, 1, 45, 10],
        hasEOL: false,
      },
      {
        str: "ttps://",
        width: 25,
        height: 10,
        transform: [1, 0, 0, 1, 50.1, 10],
        hasEOL: true,
      },
    ]),
    ["definição https://"],
  );
});

test("a PDF without extractable text is represented without passages", async () => {
  const documents = await extractDocuments(fixturePdf(""), "scan.pdf", 10);
  assert.equal(chunkPages(documents[0]!.pages).length, 0);
});
