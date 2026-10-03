import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  aiAskRequestsTable,
  db,
  pool,
  tenderAiAnswersTable,
  type AiGeneratedSummary,
  type AiPassageRecord,
} from "@workspace/db";
import { ASK_SUMMARY_PROMPT_VERSION } from "./openai-summary";

// Bump when retrieval, scoring, or answer-selection semantics change.
const ANSWER_POLICY_VERSION = 2;
const LEASE_MS = 5 * 60_000;

export type SharedAnswer = {
  status: "answered" | "not_found";
  passages: AiPassageRecord[];
  summary: AiGeneratedSummary | null;
  model: string;
};

export type SharedAnswerIdentity = {
  cacheKey: string;
  evidenceKey: string;
  tenderId: string;
  indexVersion: number;
  questionHash: string;
  requestedModel: string;
  summaryRequestedModel: string;
};

export function sharedAnswerIdentity(input: {
  tenderId: string;
  indexVersion: number;
  normalizedQuestion: string;
  requestedModel: string;
  summaryRequestedModel: string;
  threshold: number;
  relativeThresholdDelta: number;
  shortlistSize: number;
}): SharedAnswerIdentity {
  const questionHash = createHash("sha256").update(input.normalizedQuestion).digest("hex");
  const evidenceKey = createHash("sha256").update(JSON.stringify({
    tenderId: input.tenderId,
    indexVersion: input.indexVersion,
    questionHash,
    requestedModel: input.requestedModel,
    answerPolicyVersion: ANSWER_POLICY_VERSION,
    threshold: input.threshold,
    relativeThresholdDelta: input.relativeThresholdDelta,
    shortlistSize: input.shortlistSize,
  })).digest("hex");
  const cacheKey = createHash("sha256").update(JSON.stringify({
    evidenceKey,
    summaryRequestedModel: input.summaryRequestedModel,
    summaryPromptVersion: ASK_SUMMARY_PROMPT_VERSION,
  })).digest("hex");
  return { cacheKey, evidenceKey, tenderId: input.tenderId, indexVersion: input.indexVersion, questionHash,
    requestedModel: input.requestedModel, summaryRequestedModel: input.summaryRequestedModel };
}

function ready(row: typeof tenderAiAnswersTable.$inferSelect | undefined): SharedAnswer | null {
  if (!row || (row.status !== "answered" && row.status !== "not_found")) return null;
  return {
    status: row.status,
    passages: row.passages,
    summary: row.summary,
    model: row.responseModel ?? row.requestedModel,
  };
}

export async function readSharedAnswer(identity: SharedAnswerIdentity): Promise<SharedAnswer | null> {
  const [row] = await db.select().from(tenderAiAnswersTable)
    .where(eq(tenderAiAnswersTable.cacheKey, identity.cacheKey)).limit(1);
  return ready(row);
}

/** A summary-model change can reuse Jev's selected official passages. */
export async function readSharedEvidence(identity: SharedAnswerIdentity): Promise<SharedAnswer | null> {
  const [row] = await db.select().from(tenderAiAnswersTable).where(and(
    eq(tenderAiAnswersTable.evidenceKey, identity.evidenceKey),
    inArray(tenderAiAnswersTable.status, ["answered", "not_found"]),
  )).orderBy(desc(tenderAiAnswersTable.updatedAt)).limit(1);
  return ready(row);
}

/** Reuse completed pre-migration per-user answers lazily, without copying the user or raw question. */
export async function seedSharedAnswer(
  identity: SharedAnswerIdentity,
  normalizedQuestion: string,
): Promise<SharedAnswer | null> {
  const [legacy] = await db.select().from(aiAskRequestsTable).where(and(
    eq(aiAskRequestsTable.tenderId, identity.tenderId),
    eq(aiAskRequestsTable.normalizedQuestion, normalizedQuestion),
    eq(aiAskRequestsTable.indexVersion, identity.indexVersion),
    eq(aiAskRequestsTable.requestedModel, identity.requestedModel),
    eq(aiAskRequestsTable.summaryRequestedModel, identity.summaryRequestedModel),
    eq(aiAskRequestsTable.summaryPromptVersion, ASK_SUMMARY_PROMPT_VERSION),
    inArray(aiAskRequestsTable.status, ["answered", "not_found"]),
  )).orderBy(desc(aiAskRequestsTable.updatedAt)).limit(1);
  if (!legacy) return null;
  await db.insert(tenderAiAnswersTable).values({
    ...identity,
    summaryPromptVersion: ASK_SUMMARY_PROMPT_VERSION,
    status: legacy.status === "answered" ? "answered" : "not_found",
    passages: legacy.passages,
    summary: legacy.summary,
    responseModel: legacy.responseModel,
  }).onConflictDoNothing();
  return readSharedAnswer(identity);
}

export async function claimSharedAnswer(identity: SharedAnswerIdentity): Promise<string | null> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + LEASE_MS);
  const result = await pool.query<{ claim_token: string }>(`
    insert into tender_ai_answers
      (cache_key, evidence_key, tender_id, index_version, question_hash, requested_model,
       summary_requested_model, summary_prompt_version, status, claim_token, claim_expires_at)
    values ($1, $2, $3, $4, $5, $6, $7, $8, 'processing', $9, $10)
    on conflict (cache_key) do update set
      claim_token = excluded.claim_token,
      claim_expires_at = excluded.claim_expires_at,
      updated_at = now()
    where tender_ai_answers.status = 'processing'
      and tender_ai_answers.claim_expires_at < now()
    returning claim_token
  `, [identity.cacheKey, identity.evidenceKey, identity.tenderId, identity.indexVersion, identity.questionHash,
    identity.requestedModel, identity.summaryRequestedModel, ASK_SUMMARY_PROMPT_VERSION, token, expiresAt]);
  return result.rows[0]?.claim_token === token ? token : null;
}

export async function finishSharedAnswer(
  identity: SharedAnswerIdentity,
  token: string,
  answer: SharedAnswer,
): Promise<void> {
  await db.update(tenderAiAnswersTable).set({
    status: answer.status,
    passages: answer.passages,
    summary: answer.summary,
    responseModel: answer.model,
    claimToken: null,
    claimExpiresAt: null,
    updatedAt: new Date(),
  }).where(and(eq(tenderAiAnswersTable.cacheKey, identity.cacheKey), eq(tenderAiAnswersTable.claimToken, token)));
}

export async function releaseSharedAnswer(identity: SharedAnswerIdentity, token: string): Promise<void> {
  await db.delete(tenderAiAnswersTable).where(and(
    eq(tenderAiAnswersTable.cacheKey, identity.cacheKey),
    eq(tenderAiAnswersTable.claimToken, token),
    eq(tenderAiAnswersTable.status, "processing"),
  ));
}

export async function waitForSharedAnswer(identity: SharedAnswerIdentity): Promise<SharedAnswer | null> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const answer = await readSharedAnswer(identity);
    if (answer) return answer;
  }
  return null;
}
