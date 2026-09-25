import { writeFile } from "node:fs/promises";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, tendersTable, type TenderDocumentRecord } from "@workspace/db";
import { aiConfig } from "../src/ai/config";
import { chunkPages, extractDocuments } from "../src/ai/document-extractor";
import { scoreTenderPassage } from "../src/ai/jev-client";
import { enrichTenderById } from "../src/ingest/enrich-tender";

const questions = [
  "Qual é o prazo para envio das propostas?",
  "Existe garantia de proposta ou garantia contratual?",
  "Quais são as exigências de habilitação técnica?",
  "A visita técnica é obrigatória?",
  "Quais são as penalidades e o valor máximo da multa?",
  "É exigida amostra do produto ou serviço?",
  "Há benefício ou tratamento favorecido para ME e EPP?",
  "É permitida a participação de empresas em consórcio?",
  "Qual é a regra de reajuste dos preços?",
  "Qual é o local de entrega ou execução?",
] as const;
const requiredTenderCount = Number(process.env.AI_CALIBRATION_MIN_TENDERS ?? 5);

const normalizedTokens = (value: string): Set<string> =>
  new Set(
    value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? [],
  );

const overlap = (question: string, passage: string): number => {
  const questionTokens = normalizedTokens(question);
  const passageTokens = normalizedTokens(passage);
  return [...questionTokens].filter((token) => passageTokens.has(token)).length;
};

async function enrichUntilFive(): Promise<void> {
  if (process.env.AI_CALIBRATION_ENRICH !== "true") return;
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(tendersTable).where(sql`jsonb_array_length(${tendersTable.documents}) > 0`);
  let available = Number(count);
  if (available >= requiredTenderCount) return;
  const candidates = await db.select({ id: tendersTable.id }).from(tendersTable).where(
    and(eq(tendersTable.sourceId, "pncp"), inArray(tendersTable.status, ["open", "under_review", "suspended"]), sql`jsonb_array_length(${tendersTable.documents}) = 0`),
  ).orderBy(asc(tendersTable.detailsFetchedAt)).limit(40);
  for (const candidate of candidates) {
    try {
      await enrichTenderById(candidate.id);
      const [row] = await db.select({ documents: tendersTable.documents }).from(tendersTable).where(eq(tendersTable.id, candidate.id)).limit(1);
      if ((row?.documents.length ?? 0) > 0) available += 1;
      process.stderr.write(`enriched ${candidate.id}: ${row?.documents.length ?? 0} documents\n`);
      if (available >= requiredTenderCount) return;
    } catch (error) {
      process.stderr.write(`enrichment failed ${candidate.id}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}

async function extractTenderPassages(documents: TenderDocumentRecord[]) {
  const config = aiConfig();
  const passages: Array<{ page: number; text: string; document: string }> = [];
  for (const document of documents) {
    const response = await fetch(document.url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) continue;
    const files = await extractDocuments(new Uint8Array(await response.arrayBuffer()), document.name, config.maxPdfPages, config.maxDocumentBytes);
    for (const file of files) {
      passages.push(...chunkPages(file.pages).map(({ page, text }) => ({ page, text, document: file.title })));
    }
  }
  return passages;
}

await enrichUntilFive();
const tenders = await db.select({ id: tendersTable.id, title: tendersTable.title, documents: tendersTable.documents }).from(tendersTable).where(sql`jsonb_array_length(${tendersTable.documents}) > 0`).orderBy(asc(tendersTable.id)).limit(requiredTenderCount);
if (tenders.length < requiredTenderCount) throw new Error(`Calibration requires ${requiredTenderCount} tenders with documents; database has ${tenders.length}`);

const rows: Array<Record<string, unknown>> = [];
for (const tender of tenders) {
  const passages = await extractTenderPassages(tender.documents);
  for (const question of questions) {
    const shortlist = passages.map((passage) => ({ passage, score: overlap(question, passage.text) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, aiConfig().shortlistSize);
    const scored = await Promise.all(shortlist.map(async ({ passage }) => ({ ...passage, ...(await scoreTenderPassage(question, passage.text)) })));
    scored.sort((a, b) => b.relevance - a.relevance);
    rows.push({
      tenderId: tender.id,
      question,
      candidateCount: scored.length,
      inputTokens: scored.reduce((total, candidate) => total + candidate.inputTokens, 0),
      top: scored.slice(0, 3).map(({ document, page, relevance, inputTokens, text }) => ({ document, page, relevance, inputTokens, excerpt: text.slice(0, 240) })),
      candidates: scored.map(({ document, page, relevance, inputTokens, text }) => ({ document, page, relevance, inputTokens, excerpt: text.slice(0, 240) })),
    });
    process.stderr.write(`calibrated ${tender.id}: ${question}\n`);
  }
}
const output = process.env.AI_CALIBRATION_OUTPUT || "../../docs/handoffs/CODEX_HANDOFF-011-calibration.json";
await writeFile(output, `${JSON.stringify({ model: aiConfig().model, threshold: aiConfig().threshold, generatedAt: new Date().toISOString(), rows }, null, 2)}\n`);
process.stdout.write(`${output}\n`);
process.exit(0);
