import { pool } from "@workspace/db";
import { createOllamaClient } from "../src/ai/ollama-client";
import { classifyPendingTenders } from "../src/titles/classify";
import { createProgress, installStopSignal } from "../src/titles/progress";
import { optionValue, positiveIntegerOption, statusesOption } from "./titles-args";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const statuses = statusesOption(optionValue(args, "--status"));
const batch = positiveIntegerOption(optionValue(args, "--batch"), "--batch", 256);
const limit = positiveIntegerOption(optionValue(args, "--limit"), "--limit", Number.MAX_SAFE_INTEGER);
const signal = installStopSignal("classify");
try {
  const result = await classifyPendingTenders({
    statuses,
    batch,
    limit,
    client: createOllamaClient(),
    signal,
    createProgress: (total) => createProgress("classify", total),
  });
  if (result.skipped) {
    process.stdout.write("classify skipped: nenhum exemplo train embutido com o modelo atual\n");
  } else {
    process.stdout.write([
      `classify${result.stopped ? " (interrompido)" : ""}`,
      `processed=${result.processed}`,
      `categorized=${result.categorized}`,
      `belowThreshold=${result.belowThreshold}`,
    ].join(" ") + "\n");
  }
} finally {
  signal.dispose();
  await pool.end();
}
