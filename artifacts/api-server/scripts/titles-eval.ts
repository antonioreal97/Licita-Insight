import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "@workspace/db";
import { createOllamaClient } from "../src/ai/ollama-client";
import { evaluateStudent, readGoldFixture } from "../src/titles/evaluate";
import { optionValue } from "./titles-args";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const out = optionValue(args, "--out");
const withTeacher = args.includes("--teacher");
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
try {
  const report = await evaluateStudent({ client: createOllamaClient(), gold: await readGoldFixture(), withTeacher });
  const lines = [
    `aluno: ${report.trainExamples} exemplos train, modelo ${report.embedModel}, k=${report.k}, limiar ${report.minConfidence}`,
    `holdout: acurácia ${percent(report.holdout.accuracy)} (${report.holdout.correct}/${report.holdout.total}), ` +
      `cobertura ${percent(report.holdout.coverage)}, acurácia coberta ${percent(report.holdout.accuracyCovered)}`,
    `gabarito: acerto ${percent(report.gold.accuracy)} (${report.gold.correct}/${report.gold.total}), ` +
      `cobertura ${percent(report.gold.coverage)}, acerto coberto ${percent(report.gold.accuracyCovered)}`,
    "confusões (professor → aluno):",
    ...report.confusions.map(({ teacher, student, count }) => `  ${count}× ${teacher} → ${student}`),
  ];
  if (report.teacher) {
    lines.push(
      `professor ${report.teacher.model}: ${report.teacher.hits}/${report.teacher.items.length} ` +
        `(${(report.teacher.msPerTitle / 1_000).toFixed(1)} s/título)`,
      ...report.teacher.items.map((item) =>
        `  ${String(item.id).padStart(2)} ${item.hit ? "✓" : "✗"} ${item.title ?? `(regras: ${item.rejection})`} [${item.categories.join(", ")}]`),
    );
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  if (out) {
    await mkdir(path.dirname(path.resolve(out)), { recursive: true });
    await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`relatório: ${path.resolve(out)}\n`);
  }
} finally {
  await pool.end();
}
