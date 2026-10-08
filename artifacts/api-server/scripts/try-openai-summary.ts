import { and, desc, eq } from "drizzle-orm";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const valueFor = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1]?.trim() : undefined;
};
const tenderId = valueFor("--tender");
const question = valueFor("--question");
if (!tenderId || !question) {
  throw new Error('Usage: try:openai-summary -- --tender <id> --question "<texto>"');
}
if (!process.env.OPENAI_API_KEY?.trim()) {
  throw new Error("OPENAI_API_KEY is required; no API call was made");
}

const normalizeQuestion = (value: string) => value
  .normalize("NFKC")
  .trim()
  .replace(/\s+/gu, " ")
  .toLocaleLowerCase("pt-BR");

const { aiAskRequestsTable, db, pool } = await import("@workspace/db");
try {
  const [cached] = await db
    .select({ passages: aiAskRequestsTable.passages })
    .from(aiAskRequestsTable)
    .where(and(
      eq(aiAskRequestsTable.tenderId, tenderId),
      eq(aiAskRequestsTable.normalizedQuestion, normalizeQuestion(question)),
      eq(aiAskRequestsTable.status, "answered"),
    ))
    .orderBy(desc(aiAskRequestsTable.updatedAt))
    .limit(1);
  if (!cached?.passages.length) {
    throw new Error("No cached answered passages found; ask this exact question in the Pardal Digital UI first");
  }
  const { generateAskSummary } = await import("../src/ai/openai-summary");
  const result = await generateAskSummary(question, cached.passages, {
    budgetPaused: async () => false,
  });
  process.stdout.write(`${JSON.stringify({ summary: result.summary, usage: {
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  } }, null, 2)}\n`);
} finally {
  await pool.end();
}
