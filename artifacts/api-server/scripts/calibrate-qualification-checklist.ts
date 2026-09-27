import { writeFile } from "node:fs/promises";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  pool,
  tenderAiIndexesTable,
  tenderAiPassagesTable,
  tendersTable,
} from "@workspace/db";
import { aiConfig } from "../src/ai/config";
import { calculateQualificationChecklist } from "../src/ai/tender-sheet-service";
import { SHEET_PROMPT_VERSION } from "../src/ai/tender-sheet-policy";

const tenders = await db
  .select({ id: tendersTable.id, title: tendersTable.title })
  .from(tendersTable)
  .where(sql`jsonb_array_length(${tendersTable.documents}) > 0`)
  .orderBy(asc(tendersTable.id));

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

  const calculated = await calculateQualificationChecklist(
    tender.id,
    index.version,
  );
  const passed = calculated.candidates.filter(
    ({ isRequirement, type }) =>
      isRequirement >= 0.5 && type !== "nao_e_requisito",
  );
  outputTenders.push({
    tenderId: tender.id,
    title: tender.title,
    indexVersion: index.version,
    indexStatus: index.status,
    passageCount: Number(passageCount),
    candidateCount: calculated.candidates.length,
    passedThresholdCount: passed.length,
    combinationQuestionCount: calculated.candidates.filter(
      ({ mentionsLaborInAdditionToFiscal }) =>
        mentionsLaborInAdditionToFiscal !== null,
    ).length,
    inputTokens: calculated.inputTokens,
    estimatedCostUsd: Number(
      (calculated.inputTokens * 0.000000042).toFixed(8),
    ),
    items: calculated.qualificationChecklist,
    diagnostics: calculated.diagnostics,
    candidates: calculated.candidates.map((candidate) => ({
      page: candidate.evidence.page,
      documentTitle: candidate.evidence.documentTitle,
      text: candidate.evidence.text,
      isRequirement: candidate.isRequirement,
      type: candidate.type,
      typeConfidence: candidate.typeConfidence,
      mentionsLaborInAdditionToFiscal:
        candidate.mentionsLaborInAdditionToFiscal,
      passed:
        candidate.isRequirement >= 0.5 &&
        candidate.type !== "nao_e_requisito",
    })),
    humanReview: {
      reviewed: false,
      falsePositives: [],
      falseNegatives: [],
      notes: "Pendente de leitura humana dos textos oficiais.",
    },
  });
  process.stderr.write(
    `calibrated ${tender.id}: ${calculated.candidates.length} candidates, ${calculated.inputTokens} input tokens\n`,
  );
}

const config = aiConfig();
const outputPath =
  process.env.AI_CALIBRATION_OUTPUT ??
  "../../docs/handoffs/CODEX_HANDOFF-020-calibration.json";
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      model: config.model,
      promptVersion: SHEET_PROMPT_VERSION,
      requirementThreshold: 0.5,
      typeCombinationThreshold: 0.7,
      laborCombinationThreshold: 0.5,
      candidateLimit: config.qualificationCandidateLimit,
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
