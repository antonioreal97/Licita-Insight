import { writeFile } from "node:fs/promises";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  pool,
  tenderAiIndexesTable,
  tenderAiPassagesTable,
  tendersTable,
} from "@workspace/db";
import { ensureTenderIndex } from "../src/ai/ask-tender-service";
import { aiConfig } from "../src/ai/config";
import { calculateTenderSheet } from "../src/ai/tender-sheet-service";
import { SHEET_PROMPT_VERSION } from "../src/ai/tender-sheet-policy";

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const tenders = await db
  .select({ id: tendersTable.id, title: tendersTable.title })
  .from(tendersTable)
  .where(sql`jsonb_array_length(${tendersTable.documents}) > 0`)
  .orderBy(asc(tendersTable.id));

for (const tender of tenders) {
  const [existing] = await db
    .select({ status: tenderAiIndexesTable.status })
    .from(tenderAiIndexesTable)
    .where(eq(tenderAiIndexesTable.tenderId, tender.id))
    .limit(1);
  const [{ passageCount }] = await db
    .select({ passageCount: sql<number>`count(*)` })
    .from(tenderAiPassagesTable)
    .where(eq(tenderAiPassagesTable.tenderId, tender.id));
  if (existing?.status === "ready" || Number(passageCount) > 0) {
    process.stderr.write(
      `index ${tender.id}: ${existing?.status} (${passageCount} passages)\n`,
    );
    continue;
  }
  let status = await ensureTenderIndex(tender.id, true);
  const deadline = Date.now() + 180_000;
  while (status === "processing" && Date.now() < deadline) {
    await sleep(1_000);
    const [index] = await db
      .select({ status: tenderAiIndexesTable.status })
      .from(tenderAiIndexesTable)
      .where(eq(tenderAiIndexesTable.tenderId, tender.id))
      .limit(1);
    status = (index?.status as typeof status) ?? "not_started";
  }
  process.stderr.write(`index ${tender.id}: ${status}\n`);
}

const outputTenders = [];
const skipped = [];
for (const tender of tenders) {
  const [index] = await db
    .select({
      version: tenderAiIndexesTable.version,
      status: tenderAiIndexesTable.status,
    })
    .from(tenderAiIndexesTable)
    .where(eq(tenderAiIndexesTable.tenderId, tender.id))
    .limit(1);
  const [{ passageCount }] = await db
    .select({ passageCount: sql<number>`count(*)` })
    .from(tenderAiPassagesTable)
    .where(
      and(
        eq(tenderAiPassagesTable.tenderId, tender.id),
        eq(tenderAiPassagesTable.indexVersion, index?.version ?? -1),
      ),
    );
  if (!index || Number(passageCount) === 0) {
    skipped.push({
      tenderId: tender.id,
      title: tender.title,
      indexStatus: index?.status ?? "not_started",
    });
    continue;
  }
  const calculated = await calculateTenderSheet(tender.id, index.version);
  outputTenders.push({
    tenderId: tender.id,
    title: tender.title,
    indexVersion: index.version,
    indexStatus: index.status,
    passageCount: Number(passageCount),
    inputTokens: calculated.inputTokens,
    fields: calculated.fields.map((field) => {
      const diagnostic = calculated.diagnostics.find(
        ({ id }) => id === field.id,
      )!;
      return {
        id: field.id,
        status: field.status,
        page: diagnostic.bestEvidence?.page ?? null,
        excerpt: diagnostic.bestEvidence?.text.slice(0, 300) ?? null,
        noul: diagnostic.bestNoul,
        secondPage: diagnostic.secondEvidence?.page ?? null,
        secondExcerpt: diagnostic.secondEvidence?.text.slice(0, 300) ?? null,
        secondNoul: diagnostic.secondNoul,
        answer: field.answer,
        confidence: field.confidence,
      };
    }),
  });
  process.stderr.write(
    `calibrated ${tender.id}: ${calculated.inputTokens} input tokens\n`,
  );
}

const config = aiConfig();
const outputPath =
  process.env.AI_CALIBRATION_OUTPUT ??
  "../../docs/handoffs/CODEX_HANDOFF-015-calibration.json";
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      model: config.model,
      promptVersion: SHEET_PROMPT_VERSION,
      evidenceThreshold: config.sheetEvidenceThreshold,
      answerThreshold: config.sheetAnswerThreshold,
      generatedAt: new Date().toISOString(),
      database: "licita_cycle4",
      indexedTenderCount: outputTenders.length,
      skipped,
      tenders: outputTenders,
    },
    null,
    2,
  )}\n`,
);
await pool.end();
process.stdout.write(`${outputPath}\n`);
