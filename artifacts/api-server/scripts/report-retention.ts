import { pool } from "@workspace/db";
import { reportAiDocumentRetention } from "../src/ai/ai-document-retention";

const args = process.argv.slice(2);
if (!args.includes("--dry-run")) throw new Error("report:retention requires --dry-run");
const daysAt = args.indexOf("--days");
const days = daysAt >= 0 ? Number(args[daysAt + 1]) : 90;
if (!Number.isSafeInteger(days) || days < 1) throw new Error("--days must be a positive integer");
try {
  const result = await reportAiDocumentRetention(new Date(), days);
  process.stdout.write(`${JSON.stringify({ dryRun: true, days, ...result }, null, 2)}\n`);
} finally { await pool.end(); }
