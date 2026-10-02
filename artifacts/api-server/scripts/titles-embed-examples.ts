import { pool } from "@workspace/db";
import { createOllamaClient } from "../src/ai/ollama-client";
import { embedPendingExamples } from "../src/titles/embed-examples";
import { createProgress, installStopSignal } from "../src/titles/progress";
import { optionValue, positiveIntegerOption } from "./titles-args";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const batch = positiveIntegerOption(optionValue(args, "--batch"), "--batch", 32);
const signal = installStopSignal("embed-examples");
try {
  const client = createOllamaClient();
  const result = await embedPendingExamples({
    client,
    batch,
    signal,
    createProgress: (total) => createProgress("embed-examples", total),
  });
  process.stdout.write(
    `embed-examples${result.stopped ? " (interrompido)" : ""} model=${client.config.embedModel} embedded=${result.embedded}\n`,
  );
} finally {
  signal.dispose();
  await pool.end();
}
