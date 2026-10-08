const positiveInteger = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const probability = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
};

const nonNegativeDecimal = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

export const openAiConfig = () => ({
  apiKey: process.env.OPENAI_API_KEY?.trim() || null,
  model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  baseUrl: (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/u, ""),
  timeoutMs: positiveInteger("OPENAI_TIMEOUT_MS", 15_000),
  inputUsdPerMtok: nonNegativeDecimal("OPENAI_INPUT_USD_PER_MTOK", 0.15),
  outputUsdPerMtok: nonNegativeDecimal("OPENAI_OUTPUT_USD_PER_MTOK", 0.6),
});

export const aiConfig = () => ({
  apiKey: process.env.JEV_API_KEY?.trim() || null,
  model: process.env.JEV_MODEL?.trim() || "jev-1.13.0",
  timeoutMs: positiveInteger("JEV_TIMEOUT_MS", 15_000),
  threshold: probability("JEV_RELEVANCE_THRESHOLD", 0.5),
  relativeThresholdDelta: probability("JEV_RELATIVE_RELEVANCE_DELTA", 0.25),
  /** Processes with readable documents a user may consult with AI per São Paulo day (trial and paid). */
  tenderDailyLimit: positiveInteger("AI_DAILY_TENDER_LIMIT", 5),
  /** Safety cap on new (uncached) questions per day, on top of the process cap. */
  trialDailyLimit: positiveInteger("AI_DAILY_ASK_LIMIT_TRIAL", 30),
  paidDailyLimit: positiveInteger("AI_DAILY_ASK_LIMIT_PAID", 30),
  fitDailyLimit: positiveInteger("AI_DAILY_FIT_LIMIT", 1_000),
  sheetDailyLimit: positiveInteger("AI_DAILY_SHEET_LIMIT", 500),
  sheetEvidenceThreshold: probability("AI_SHEET_EVIDENCE_THRESHOLD", 0.5),
  sheetAnswerThreshold: probability("AI_SHEET_ANSWER_THRESHOLD", 0.6),
  sheetCandidateLimit: positiveInteger("AI_SHEET_CANDIDATE_LIMIT", 6),
  qualificationCandidateLimit: positiveInteger(
    "AI_QUALIFICATION_CANDIDATE_LIMIT",
    40,
  ),
  fitExcludedThreshold: probability("AI_FIT_EXCLUDED_THRESHOLD", 0.65),
  maxDocumentBytes: positiveInteger("AI_MAX_DOCUMENT_BYTES", 25 * 1024 * 1024),
  maxArchiveUncompressedBytes: positiveInteger("AI_MAX_ARCHIVE_UNCOMPRESSED_BYTES", 50 * 1024 * 1024),
  maxPdfPages: positiveInteger("AI_MAX_PDF_PAGES", 300),
  documentTimeoutMs: positiveInteger("AI_DOCUMENT_TIMEOUT_MS", 300_000),
  documentRetryMaxAttempts: positiveInteger(
    "AI_DOCUMENT_RETRY_MAX_ATTEMPTS",
    6,
  ),
  shortlistSize: positiveInteger("AI_SHORTLIST_SIZE", 10),
  documentHosts: (process.env.AI_DOCUMENT_HOSTS ?? "pncp.gov.br")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
});
