import { basename } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const descriptions = {
  "collect-pncp": "Coleta editais do PNCP (PNCP_FROM/PNCP_TO opcionais).",
  "collect-transparency": "Coleta contratos e resultados do PNCP (TRANSPARENCY_*).",
  "collect-opportunities": "Coleta oportunidades do Mapas Culturais.",
  "collect-funding": "Coleta fomento; FUNDING_DRY_RUN=true consulta sem gravar.",
  "collect-culture-federal": "Coleta cultura federal; CULTURE_FEDERAL_DRY_RUN=true consulta sem gravar.",
  "collect-international": "Coleta fontes internacionais; INTERNATIONAL_DRY_RUN=true consulta sem banco.",
  "backfill-platform": "Preenche plataformas ausentes (PLATFORM_BACKFILL_BATCH_SIZE).",
  "backfill-display-titles": "Atualiza títulos por regras; aceita --dry-run, --batch, --limit e --cursor.",
  "review-estimated-values": "Revisa valores estimados (ESTIMATED_VALUE_REVIEW_BATCH_SIZE).",
  "refresh-profile-keywords": "Recria o vocabulário de palavras-chave do perfil.",
} as const;

type Command = keyof typeof descriptions;
const command = basename(process.argv[1] ?? "").replace(/\.mjs$/, "");
const args = process.argv.slice(2);

const withLock = async <T>(jobKey: string, action: () => Promise<T>): Promise<T> => {
  const { tryRunSingletonJob } = await import("./jobs/job-lock");
  const result = await tryRunSingletonJob(jobKey, action);
  if (!result.acquired) throw new Error(`${jobKey} is already running`);
  return result.value;
};

const waitForIngest = async (runId: string, maxMs: number): Promise<void> => {
  const { pool } = await import("@workspace/db");
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const { rows } = await pool.query<{ status: string; error: string | null }>(
      "select status, error from ingest_runs where id = $1",
      [runId],
    );
    const run = rows[0];
    if (!run) throw new Error(`Ingest run ${runId} was not found`);
    if (run.status === "failed") throw new Error(run.error ?? `Ingest run ${runId} failed`);
    if (run.status !== "running") return;
    await sleep(2_000);
  }
  throw new Error(`Ingest run ${runId} did not finish within ${maxMs} ms`);
};

const runCommand = async (name: Command): Promise<unknown> => {
  switch (name) {
    case "collect-pncp": {
      const { collectOptionsFromEnv, startPncpIngest } = await import("./ingest/collect-pncp");
      const { runId } = await withLock("pncp_collect", () => startPncpIngest(collectOptionsFromEnv()));
      await waitForIngest(runId, 24 * 60 * 60 * 1_000);
      return { runId, status: "complete" };
    }
    case "collect-transparency": {
      const { collectTransparency, transparencyOptionsFromEnv } = await import("./ingest/collect-transparency");
      const options = await transparencyOptionsFromEnv();
      if (!options) return { status: "nothing_to_collect" };
      return withLock("pncp_transparency_collect", () => collectTransparency(options));
    }
    case "collect-opportunities": {
      const { startCultureIngest } = await import("./ingest/collect-opportunities");
      const { runId } = await withLock("culture_collect", () => startCultureIngest());
      await waitForIngest(runId, 6 * 60 * 60 * 1_000);
      return { runId, status: "complete" };
    }
    case "collect-funding": {
      if (process.env.FUNDING_DRY_RUN === "true") {
        const { collectFundingOnce } = await import("./ingest/funding-client");
        const sources = await collectFundingOnce();
        return {
          dryRun: true,
          sources: sources.map(({ source, outcome, count, message }) => ({ source, outcome, count, message })),
        };
      }
      const { collectFunding } = await import("./ingest/collect-funding");
      const result = await withLock("funding_collect", () => collectFunding());
      if (result.status === "failed") throw new Error(`Funding collection ${result.runId} failed`);
      return result;
    }
    case "collect-culture-federal": {
      if (process.env.CULTURE_FEDERAL_DRY_RUN === "true") {
        const { collectFederalOnce } = await import("./ingest/federal-client");
        const sources = await collectFederalOnce();
        return { dryRun: true, sources: sources.map(({ drafts, ...summary }) => ({ ...summary, count: drafts.length })) };
      }
      const { collectCultureFederal } = await import("./ingest/collect-culture-federal");
      const result = await withLock("culture_federal_collect", () => collectCultureFederal());
      if (result.status === "failed") throw new Error(`Federal culture collection ${result.runId} failed`);
      return result;
    }
    case "collect-international": {
      if (process.env.INTERNATIONAL_DRY_RUN === "true") {
        const { runInternationalDry } = await import("./ingest/collect-international-cli");
        return { dryRun: true, ...(await runInternationalDry()) };
      }
      const { collectInternational } = await import("./ingest/collect-international");
      const result = await withLock("international_collect", () => collectInternational());
      if (result.status === "failed") throw new Error(`International collection ${result.runId} failed`);
      return result;
    }
    case "backfill-platform": {
      const { backfillTenderPlatforms, platformBackfillBatchSize } = await import("./ingest/platform-backfill");
      return withLock("tender_platform_backfill", () =>
        backfillTenderPlatforms({ batch: platformBackfillBatchSize(), pauseMs: 0 }),
      );
    }
    case "backfill-display-titles": {
      const { parseBackfillOptions, runDisplayTitleBackfill } = await import("./ingest/display-title-backfill");
      const options = parseBackfillOptions(args);
      return { dryRun: options.dryRun, ...(await runDisplayTitleBackfill(options)) };
    }
    case "review-estimated-values": {
      const { estimatedValueReviewBatchSize, reviewEstimatedValues } = await import("./ingest/estimated-value-review");
      return withLock("tender_estimated_value_review", () =>
        reviewEstimatedValues({ batch: estimatedValueReviewBatchSize(), pauseMs: 0 }),
      );
    }
    case "refresh-profile-keywords": {
      const { rebuildProfileKeywordVocabulary } = await import("./profile/keyword-vocabulary");
      return withLock("profile_keyword_vocabulary", () => rebuildProfileKeywordVocabulary());
    }
  }
};

const validArgs = (name: Command): boolean => {
  if (name !== "backfill-display-titles") return args.length === 0;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") continue;
    if (arg === "--batch" || arg === "--limit" || arg === "--cursor") {
      if (!args[index + 1] || args[index + 1]?.startsWith("--")) return false;
      index += 1;
      continue;
    }
    return false;
  }
  return true;
};

if (!(command in descriptions)) {
  console.error(`Unknown production command: ${command}`);
  process.exitCode = 2;
} else {
  const name = command as Command;
  const usage = `Uso: node artifacts/api-server/dist/${name}.mjs ${name === "backfill-display-titles" ? "[--dry-run] [--batch N] [--limit N] [--cursor ID]" : ""}\n${descriptions[name]}\n--help mostra esta ajuda.`;
  if (args.includes("--help")) {
    console.log(usage);
  } else if (!validArgs(name)) {
    console.error(`Argumentos inválidos.\n${usage}`);
    process.exitCode = 2;
  } else if (!process.env.DATABASE_URL && !(name === "collect-international" && process.env.INTERNATIONAL_DRY_RUN === "true")) {
    console.error("DATABASE_URL must be set");
    process.exitCode = 1;
  } else {
    try {
      console.log(JSON.stringify(await runCommand(name), null, 2));
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      if (process.env.DATABASE_URL) {
        try {
          const { pool } = await import("@workspace/db");
          await pool.end();
        } catch (error) {
          console.error(error);
          process.exitCode = 1;
        }
      }
    }
  }
}
