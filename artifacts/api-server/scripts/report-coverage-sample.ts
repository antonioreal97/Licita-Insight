import { readFileSync } from "node:fs";
import { and, asc, eq, gte, like, lte } from "drizzle-orm";
import { db, ingestDaysTable, pool, tendersTable } from "@workspace/db";
import { addDays, saoPauloToday, summarizeCoverage } from "../src/ingest/ingest-calendar";

const COLUMNS = ["org", "cnpj", "portal", "numero", "processo", "objeto", "publicado_em", "url"] as const;
type SampleRow = Record<(typeof COLUMNS)[number], string>;
type Candidate = {
  id: string;
  tenderNumber: string | null;
  processNumber: string | null;
  title: string;
  publishedAt: Date | null;
};

const csvPath = process.argv.slice(2).find((arg) => arg !== "--");
if (!csvPath) throw new Error("Usage: report:coverage-sample -- <sample.csv>");

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
};

const [header, ...body] = parseCsv(readFileSync(csvPath, "utf8"));
if (header?.join(",") !== COLUMNS.join(",")) {
  throw new Error(`Unexpected CSV header in ${csvPath}: expected "${COLUMNS.join(",")}", got "${header?.join(",")}"`);
}
const sample: SampleRow[] = body.map((cells, index) => {
  if (cells.length !== COLUMNS.length) throw new Error(`CSV line ${index + 2} has ${cells.length} columns, expected ${COLUMNS.length}`);
  const row = Object.fromEntries(COLUMNS.map((column, at) => [column, cells[at].trim()])) as SampleRow;
  if (!/^\d{14}$/.test(row.cnpj)) throw new Error(`CSV line ${index + 2}: cnpj must have 14 digits, got "${row.cnpj}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.publicado_em)) throw new Error(`CSV line ${index + 2}: publicado_em must be YYYY-MM-DD, got "${row.publicado_em}"`);
  if (!row.url) throw new Error(`CSV line ${index + 2}: url is required`);
  return row;
});
if (sample.length === 0) throw new Error(`${csvPath} has no rows`);

const groupList = (value: string | null): string[] =>
  (value ?? "").match(/\d+/g)?.map((group) => group.replace(/^0+(?=\d)/, "")) ?? [];
const numberGroups = (value: string | null): Set<string> => new Set(groupList(value));
const processKey = (value: string | null): string => groupList(value).join("/");
const containsAll = (outer: Set<string>, inner: Set<string>): boolean => [...inner].every((group) => outer.has(group));
const specific = (groups: Set<string>): boolean => groups.size >= 2 || [...groups].some((group) => group.length >= 6);

const sameProcess = (row: SampleRow, candidate: Candidate): boolean => {
  const sampleProcess = processKey(row.processo);
  return sampleProcess.replace(/\//g, "").length >= 6 && sampleProcess === processKey(candidate.processNumber);
};

// Branches under one CNPJ root reuse short numbers ("39/2026" at two EBSERH hospitals), so a number
// match must not contradict a known process and must be close in time.
const sameNumber = (row: SampleRow, candidate: Candidate): boolean => {
  const sampleProcess = processKey(row.processo);
  const candidateProcess = processKey(candidate.processNumber);
  if (sampleProcess && candidateProcess && sampleProcess !== candidateProcess) return false;
  const published = candidate.publishedAt ? saoPauloToday(candidate.publishedAt) : null;
  if (!published || published < addDays(row.publicado_em, -15) || published > addDays(row.publicado_em, 15)) return false;
  const sampleNumber = numberGroups(row.numero);
  return [candidate.tenderNumber, candidate.processNumber].some((field) => {
    const groups = numberGroups(field);
    if (groups.size === 0 || sampleNumber.size === 0) return false;
    const [small, large] = groups.size <= sampleNumber.size ? [groups, sampleNumber] : [sampleNumber, groups];
    return specific(small) && containsAll(large, small);
  });
};

try {
  const dates = sample.map((row) => row.publicado_em).sort();
  // The PNCP publication can land a day before or after the portal/DOU notice.
  const from = addDays(dates[0], -1);
  const to = addDays(dates[dates.length - 1], 1);
  const calendar = await db.select().from(ingestDaysTable).where(eq(ingestDaysTable.source, "pncp"));
  const coverage = summarizeCoverage(calendar, { from, to, modalities: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] });
  const openDays = coverage.days.filter((day) => !day.sealed).map((day) => day.day);
  if (openDays.length > 0) {
    throw new Error(`PNCP coverage is not sealed for ${openDays.join(", ")} (window ${from}..${to}); "not found" would be meaningless. Run collect:pncp for the window first.`);
  }

  const candidatesByRoot = new Map<string, Candidate[]>();
  for (const root of new Set(sample.map((row) => row.cnpj.slice(0, 8)))) {
    candidatesByRoot.set(root, await db
      .select({
        id: tendersTable.id,
        tenderNumber: tendersTable.tenderNumber,
        processNumber: tendersTable.processNumber,
        title: tendersTable.title,
        publishedAt: tendersTable.publishedAt,
      })
      .from(tendersTable)
      .where(like(tendersTable.organizationId, `pncp-${root}%`))
      .orderBy(asc(tendersTable.publishedAt)));
  }
  const windowCount = async (root: string): Promise<number> => (await db
    .select({ id: tendersTable.id })
    .from(tendersTable)
    .where(and(
      like(tendersTable.organizationId, `pncp-${root}%`),
      gte(tendersTable.publishedAt, new Date(`${from}T00:00:00-03:00`)),
      lte(tendersTable.publishedAt, new Date(`${to}T23:59:59.999-03:00`)),
    ))).length;

  const results = sample.map((row) => {
    const candidates = candidatesByRoot.get(row.cnpj.slice(0, 8)) ?? [];
    const byProcess = candidates.find((candidate) => sameProcess(row, candidate));
    if (byProcess) return { row, found: byProcess, rule: "processo", candidates };
    const byNumber = candidates.find((candidate) => sameNumber(row, candidate));
    if (byNumber) return { row, found: byNumber, rule: "numero", candidates };
    return { row, found: null, rule: null, candidates };
  });

  const out: string[] = [];
  const cell = (value: string | null | undefined): string => (value ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  out.push(`# Cobertura da amostra no PNCP`, "");
  out.push(`Amostra: \`${csvPath}\` (${sample.length} editais). Janela selada no PNCP: ${from} a ${to}. Casamento por raiz do CNPJ (8 dígitos) + processo ou número.`, "");
  out.push("## Por órgão", "", "| Órgão | CNPJ | Na amostra | Achados no PNCP | % | Publicações do CNPJ no PNCP na janela |", "| --- | --- | ---: | ---: | ---: | ---: |");
  const orgs = [...new Set(sample.map((row) => row.org))];
  const zero: string[] = [];
  let totalFound = 0;
  for (const org of orgs) {
    const rows = results.filter((result) => result.row.org === org);
    const found = rows.filter((result) => result.found).length;
    totalFound += found;
    const inWindow = await windowCount(rows[0].row.cnpj.slice(0, 8));
    if (inWindow === 0) zero.push(org);
    out.push(`| ${org} | ${rows[0].row.cnpj} | ${rows.length} | ${found} | ${Math.round((found / rows.length) * 100)}% | ${inWindow} |`);
  }
  out.push(`| **Total** | | **${sample.length}** | **${totalFound}** | **${Math.round((totalFound / sample.length) * 100)}%** | |`, "");

  out.push("## Órgãos sem nenhuma publicação no PNCP na janela", "");
  out.push(...(zero.length ? zero.map((org) => `- ${org}`) : ["- nenhum"]), "");

  out.push("## Achados", "", "| Órgão | Número na amostra | Regra | Edital no PNCP | Número no PNCP | Processo no PNCP | Dias do PNCP até a amostra |", "| --- | --- | --- | --- | --- | --- | ---: |");
  for (const result of results.filter((item) => item.found)) {
    const published = result.found!.publishedAt;
    const lag = published
      ? Math.round((Date.parse(`${result.row.publicado_em}T12:00:00-03:00`) - Date.parse(`${saoPauloToday(published)}T12:00:00-03:00`)) / 86_400_000)
      : null;
    out.push(`| ${result.row.org} | ${cell(result.row.numero)} | ${result.rule} | ${result.found!.id} | ${cell(result.found!.tenderNumber)} | ${cell(result.found!.processNumber)} | ${lag ?? "—"} |`);
  }
  out.push("");

  out.push("## Sem casamento (conferir à mão)", "");
  for (const result of results.filter((item) => !item.found)) {
    const day = result.row.publicado_em;
    const near = result.candidates.filter((candidate) => {
      if (!candidate.publishedAt) return false;
      const published = saoPauloToday(candidate.publishedAt);
      return published >= addDays(day, -7) && published <= addDays(day, 7);
    });
    out.push(`- **${result.row.org}** · ${cell(result.row.numero) || "sem número"} · processo ${cell(result.row.processo) || "—"} · ${day} · ${cell(result.row.objeto).slice(0, 110)} · [fonte](${result.row.url})`);
    if (near.length === 0) out.push("  - nenhum edital do mesmo CNPJ no PNCP entre 7 dias antes e 7 depois");
    for (const candidate of near.slice(0, 5)) {
      out.push(`  - candidato ${candidate.id} · ${cell(candidate.tenderNumber)} · processo ${cell(candidate.processNumber) || "—"} · ${saoPauloToday(candidate.publishedAt!)} · ${cell(candidate.title).slice(0, 90)}`);
    }
    if (near.length > 5) out.push(`  - (+${near.length - 5} candidatos)`);
  }
  process.stdout.write(`${out.join("\n")}\n`);
} finally {
  await pool.end();
}
