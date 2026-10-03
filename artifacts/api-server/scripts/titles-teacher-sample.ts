import { pool } from "@workspace/db";
import { createOllamaClient } from "../src/ai/ollama-client";
import { isTenderCategorySlug } from "../src/catalog/tender-categories";
import { createProgress, installStopSignal } from "../src/titles/progress";
import { runTeacherSample } from "../src/titles/sample";
import { optionValue, positiveIntegerOption, statusesOption } from "./titles-args";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const size = positiveIntegerOption(optionValue(args, "--size"), "--size", 3_000);
const statuses = statusesOption(optionValue(args, "--status"));
const focusOption = optionValue(args, "--focus");
const focus = focusOption ? [...new Set(focusOption.split(",").map((slug) => slug.trim()).filter(Boolean))] : undefined;
if (focus?.some((slug) => !isTenderCategorySlug(slug))) throw new Error("--focus needs category slugs from the taxonomy");
const signal = installStopSignal("teacher-sample");
try {
  const client = createOllamaClient();
  process.stderr.write(
    `[teacher-sample] modelo ${client.config.teacherModel} em ${client.config.baseUrl}, alvo ${size}` +
      `${focus ? `, foco ${focus.join(",")}` : ""}\n`,
  );
  const result = await runTeacherSample({
    size,
    statuses,
    focus,
    client,
    signal,
    createProgress: (total) => createProgress("teacher-sample", total),
  });
  process.stdout.write([
    `teacher-sample${result.stopped ? " (interrompido)" : ""}`,
    `planned=${result.planned}`,
    `alreadyLabeled=${result.alreadyLabeled}`,
    `labeled=${result.labeled}`,
    `acceptedTitles=${result.acceptedTitles}`,
    `withCategories=${result.withCategories}`,
    `failedBatches=${result.failedBatches}`,
  ].join(" ") + "\n");
} finally {
  signal.dispose();
  await pool.end();
}
