import { and, desc, eq, lt } from "drizzle-orm";
import { db, ingestRunsTable, pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { isUniqueViolation } from "../lib/pg-error";
import {
  CULTURAL_INSTALLATIONS,
  mapasInstallations,
  type CulturalInstallation,
} from "./cultural-installations";
import { fetchAudiovisualOpportunities } from "./mapas-client";
import { publicInstallationFailure } from "./mapas-errors";
import {
  refreshOpportunityStatuses,
  upsertOpportunities,
} from "./upsert-opportunities";

const SOURCE = "mapas-culturais";
export const STALE_AFTER_MS = 30 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 30;

export class CultureIngestInProgressError extends Error {
  constructor() {
    super("A cultural opportunities ingest is already running");
    this.name = "CultureIngestInProgressError";
  }
}

export type InstallationCoverage = {
  id: string;
  uf: string;
  name: string;
  kind: "mapas" | "gap";
  url: string | null;
  outcome:
    | "ok"
    | "gap"
    | "failed"
    | "degraded"
    | "blocked"
    | "vocabulary_fallback"
    | "pending";
  upserted: number;
  message: string | null;
};

const positiveInt = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `CULTURE_LOOKBACK_DAYS must be a positive integer, received "${value}"`,
    );
  }
  return parsed;
};

export const cultureLookbackDays = (): number =>
  positiveInt(process.env.CULTURE_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS);

const windowFor = (now: Date, days: number): { from: Date; to: Date } => {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start, to: now };
};

const gapCoverage = (
  installation: CulturalInstallation,
): InstallationCoverage => ({
  id: installation.id,
  uf: installation.uf,
  name: installation.name,
  kind: "gap",
  url: null,
  outcome: "gap",
  upserted: 0,
  message: installation.kind === "gap" ? installation.reason : null,
});

export const pendingCoverage = (): InstallationCoverage[] =>
  CULTURAL_INSTALLATIONS.map((installation) =>
    installation.kind === "gap"
      ? gapCoverage(installation)
      : {
          id: installation.id,
          uf: installation.uf,
          name: installation.name,
          kind: "mapas",
          url: installation.baseUrl,
          outcome: "pending",
          upserted: 0,
          message: null,
        },
  );

const isCoverage = (value: unknown): value is InstallationCoverage => {
  if (!value || typeof value !== "object") return false;
  const row = value as InstallationCoverage;
  return typeof row.id === "string" && typeof row.outcome === "string";
};

export const coverageFromDetails = (
  details: unknown,
): InstallationCoverage[] | null => {
  if (!details || typeof details !== "object" || !("installations" in details))
    return null;
  const installations = (details as { installations: unknown }).installations;
  if (!Array.isArray(installations) || !installations.every(isCoverage))
    return null;
  return installations;
};

async function execute(runId: string, now: Date): Promise<void> {
  const days = cultureLookbackDays();
  const coverage: InstallationCoverage[] = [];
  let pagesRead = 0;
  let upserted = 0;
  let refreshErrors = 0;
  const failures: string[] = [];

  try {
    const refreshed = await refreshOpportunityStatuses(now);
    await db
      .update(ingestRunsTable)
      .set({ refreshed, heartbeatAt: new Date() })
      .where(eq(ingestRunsTable.id, runId));

    for (const installation of CULTURAL_INSTALLATIONS) {
      if (installation.kind === "gap") {
        coverage.push(gapCoverage(installation));
        continue;
      }

      try {
        const result = await fetchAudiovisualOpportunities(
          installation,
          now,
          days,
        );
        const stored = await upsertOpportunities(result.drafts, now);
        pagesRead += result.pagesRead;
        upserted += stored;
        const vocabularyMessage = result.vocabularyFallback
          ? "A instalação não publica o termo Audiovisual. A coleta usou palavras do título e do resumo."
          : null;
        coverage.push({
          id: installation.id,
          uf: installation.uf,
          name: installation.name,
          kind: "mapas",
          url: installation.baseUrl,
          outcome: result.vocabularyFallback ? "vocabulary_fallback" : "ok",
          upserted: stored,
          message:
            [vocabularyMessage, result.warning].filter(Boolean).join(" ") ||
            null,
        });
      } catch (error) {
        refreshErrors += 1;
        const publicFailure = publicInstallationFailure(error, installation);
        failures.push(`${installation.name}: ${publicFailure.message}`);
        logger.error(
          { err: error, installationId: installation.id },
          "Mapas Culturais installation failed; continuing",
        );
        coverage.push({
          id: installation.id,
          uf: installation.uf,
          name: installation.name,
          kind: "mapas",
          url: installation.baseUrl,
          outcome: publicFailure.outcome,
          upserted: 0,
          message: publicFailure.message,
        });
      }

      await db
        .update(ingestRunsTable)
        .set({
          pagesRead,
          upserted,
          refreshErrors,
          heartbeatAt: new Date(),
          details: { installations: coverage },
        })
        .where(eq(ingestRunsTable.id, runId));
    }

    const mapasCount = mapasInstallations().length;
    const allFailed = refreshErrors === mapasCount;
    await db
      .update(ingestRunsTable)
      .set({
        status: allFailed ? "failed" : "complete",
        pagesRead,
        upserted,
        refreshErrors,
        error: failures.length > 0 ? failures.join("\n") : null,
        details: { installations: coverage },
        finishedAt: new Date(),
        heartbeatAt: new Date(),
      })
      .where(eq(ingestRunsTable.id, runId));
    logger.info(
      { runId, pagesRead, upserted, refreshErrors },
      "Cultural opportunities ingest finished",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, runId }, "Cultural opportunities ingest failed");
    await db
      .update(ingestRunsTable)
      .set({
        status: "failed",
        error: message,
        details: { installations: coverage },
        finishedAt: new Date(),
        heartbeatAt: new Date(),
      })
      .where(eq(ingestRunsTable.id, runId));
  }
}

export async function startCultureIngest(
  now = new Date(),
): Promise<{ runId: string; status: "running" }> {
  await abandonStaleCultureRuns(now);
  const days = cultureLookbackDays();
  const window = windowFor(now, days);
  const runId = crypto.randomUUID();
  try {
    await db.insert(ingestRunsTable).values({
      id: runId,
      source: SOURCE,
      status: "running",
      windowFrom: window.from,
      windowTo: window.to,
      startedAt: now,
      heartbeatAt: now,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new CultureIngestInProgressError();
    throw error;
  }

  void execute(runId, now).catch((error) => {
    logger.error(
      { err: error, runId },
      "Cultural opportunities ingest crashed before recording the failure",
    );
  });
  return { runId, status: "running" };
}

export async function abandonStaleCultureRuns(
  now = new Date(),
): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const abandoned = await db
    .update(ingestRunsTable)
    .set({
      status: "failed",
      error: "Abandonada: heartbeat da coleta expirou",
      finishedAt: now,
      heartbeatAt: now,
    })
    .where(
      and(
        eq(ingestRunsTable.source, SOURCE),
        eq(ingestRunsTable.status, "running"),
        lt(ingestRunsTable.heartbeatAt, staleBefore),
      ),
    )
    .returning({ id: ingestRunsTable.id });

  if (abandoned.length > 0) {
    logger.warn(
      { runIds: abandoned.map(({ id }) => id), staleBefore },
      "Stale cultural opportunities ingest runs marked as failed",
    );
  }
  return abandoned.length;
}

const serializeRun = (run: typeof ingestRunsTable.$inferSelect) => ({
  id: run.id,
  status: run.status,
  windowFrom: run.windowFrom,
  windowTo: run.windowTo,
  pagesRead: run.pagesRead,
  upserted: run.upserted,
  refreshed: run.refreshed,
  refreshErrors: run.refreshErrors,
  error: run.error,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  coverage: coverageFromDetails(run.details) ?? pendingCoverage(),
});

export async function getLatestCultureIngest() {
  await abandonStaleCultureRuns();
  const [run] = await db
    .select()
    .from(ingestRunsTable)
    .where(eq(ingestRunsTable.source, SOURCE))
    .orderBy(desc(ingestRunsTable.startedAt))
    .limit(1);

  return {
    run: run ? serializeRun(run) : null,
    coverage: run
      ? (coverageFromDetails(run.details) ?? pendingCoverage())
      : pendingCoverage(),
  };
}

const isCli = process.argv[1]?.includes("collect-opportunities");

if (isCli) {
  logger.info(
    { lookbackDays: cultureLookbackDays() },
    "Starting cultural opportunities ingest",
  );
  startCultureIngest()
    .then(async ({ runId }) => {
      const started = Date.now();
      while (Date.now() - started < 6 * 60 * 60 * 1000) {
        const latest = await getLatestCultureIngest();
        if (latest.run?.id === runId && latest.run.status !== "running") {
          if (latest.run.status === "failed") {
            logger.error(
              { run: latest.run },
              "Cultural opportunities ingest failed",
            );
            process.exitCode = 1;
          } else {
            logger.info({ run: latest.run }, "Cultural opportunities stored");
          }
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      throw new Error(
        `Cultural opportunities ingest ${runId} did not finish within 6 hours`,
      );
    })
    .catch((error) => {
      logger.error({ err: error }, "Cultural opportunities ingest failed");
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
      process.exit(process.exitCode ?? 0);
    });
}
