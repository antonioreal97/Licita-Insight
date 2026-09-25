const positiveInteger = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const probability = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
};

export const aiConfig = () => ({
  apiKey: process.env.JEV_API_KEY?.trim() || null,
  model: process.env.JEV_MODEL?.trim() || "jev-1.13.0",
  timeoutMs: positiveInteger("JEV_TIMEOUT_MS", 15_000),
  threshold: probability("JEV_RELEVANCE_THRESHOLD", 0.5),
  trialDailyLimit: positiveInteger("AI_DAILY_ASK_LIMIT_TRIAL", 5),
  paidDailyLimit: positiveInteger("AI_DAILY_ASK_LIMIT_PAID", 30),
  maxDocumentBytes: positiveInteger("AI_MAX_DOCUMENT_BYTES", 25 * 1024 * 1024),
  maxPdfPages: positiveInteger("AI_MAX_PDF_PAGES", 300),
  shortlistSize: positiveInteger("AI_SHORTLIST_SIZE", 10),
  documentHosts: (process.env.AI_DOCUMENT_HOSTS ?? "pncp.gov.br")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
});
