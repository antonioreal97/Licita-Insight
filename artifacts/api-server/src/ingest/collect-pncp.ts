import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  db,
  ingestDaysTable,
  ingestRunsTable,
  pool,
  tendersTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { isUniqueViolation } from "../lib/pg-error";
import { InvalidParameterError } from "../lib/api-error";
import { enrichTenderById } from "./enrich-tender";
import {
  fetchCompra,
  fetchPublicationPage,
  isPncpTimeout,
  isRecoverablePncpFailure,
  PNCP_UFS,
  PncpError,
} from "./pncp-client";
import { parseControlNumber } from "./pncp-map";
import { upsertPublications } from "./upsert-tenders";
import {
  addDays,
  eachDay,
  planDay,
  saoPauloToday,
  summarizeCoverage,
  type IngestDay,
} from "./ingest-calendar";
import { classifyPncpRefreshFailure } from "./pncp-refresh-failure";

const SOURCE = "pncp";
const DEFAULT_MODALITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const STALE_AFTER_MS = 10 * 60 * 1000;
const MAX_WINDOW_DAYS = 366;
const PNCP_SOURCE_REMOVED_MARK = { pncpRefresh: { sourceRemoved: true } };

export class IngestInProgressError extends Error {
  constructor() {
    super("A PNCP ingest is already running");
    this.name = "IngestInProgressError";
  }
}

export type CollectOptions = {
  from: string;
  to: string;
  modalities: number[];
  pageSize: number;
  refreshLimit: number;
  uf?: string;
  force?: boolean;
};

type RunCounters = {
  pagesRead: number;
  upserted: number;
  refreshed: number;
  refreshErrors: number;
};

const compactDay = (isoDate: string): string => isoDate.replaceAll("-", "");
const pncpSourceRemovedMarker = () =>
  sql`${tendersTable.rawPayload}->'pncpRefresh'->>'sourceRemoved' is distinct from 'true'`;

const markPncpSourceRemovedPayload = (removedAt: Date) =>
  sql`jsonb_set(
    ${tendersTable.rawPayload},
    '{pncpRefresh}',
    coalesce(${tendersTable.rawPayload}->'pncpRefresh', '{}'::jsonb) ||
      ${JSON.stringify({
        ...PNCP_SOURCE_REMOVED_MARK.pncpRefresh,
        sourceRemovedAt: removedAt.toISOString(),
        sourceRemovedStatus: 410,
      })}::jsonb,
    true
  )`;

const nonNegativeInt = (
  value: string | undefined,
  fallback: number,
): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, received "${value}"`);
  }
  return parsed;
};

const positiveInt = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received "${value}"`);
  }
  return parsed;
};

const parseModalities = (value: string | undefined): number[] => {
  if (!value || value.trim() === "") return DEFAULT_MODALITIES;
  const modalities = value.split(",").map((item) => Number(item.trim()));
  if (
    modalities.some(
      (modality) =>
        !Number.isInteger(modality) || modality < 1 || modality > 13,
    )
  ) {
    throw new Error(
      `PNCP_MODALITIES must be integers from 1 to 13, received "${value}"`,
    );
  }
  return modalities;
};

const assertWindow = (from: string, to: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new InvalidParameterError("from and to must be YYYY-MM-DD dates", [
      { field: "from", issue: "invalid_date" },
    ]);
  }
  for (const value of [from, to]) {
    const parsed = new Date(`${value}T12:00:00Z`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new InvalidParameterError(
        "from and to must be valid calendar dates",
        [{ field: "from", issue: "invalid_date" }],
      );
    }
  }
  if (from > to) {
    throw new InvalidParameterError("from must be on or before to", [
      { field: "from", issue: "invalid_range" },
    ]);
  }
  if (eachDay(from, to).length > MAX_WINDOW_DAYS) {
    throw new InvalidParameterError(
      `The PNCP window cannot exceed ${MAX_WINDOW_DAYS} days`,
      [{ field: "from", issue: "out_of_range" }],
    );
  }
};

export const collectOptionsFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): CollectOptions => {
  const today = saoPauloToday();
  const days = positiveInt(env.PNCP_LOOKBACK_DAYS, 30);
  const to = env.PNCP_TO?.trim() || today;
  const from = env.PNCP_FROM?.trim() || addDays(to, -(days - 1));
  assertWindow(from, to);
  const uf = env.PNCP_UF?.trim().toUpperCase();
  if (uf && !(PNCP_UFS as readonly string[]).includes(uf)) {
    throw new Error(
      `PNCP_UF must be a two-letter state code, received "${env.PNCP_UF}"`,
    );
  }
  return {
    from,
    to,
    force: Boolean(env.PNCP_FROM?.trim() || env.PNCP_TO?.trim()),
    modalities: parseModalities(env.PNCP_MODALITIES),
    pageSize: positiveInt(env.PNCP_PAGE_SIZE, 50),
    refreshLimit: nonNegativeInt(env.PNCP_REFRESH_LIMIT, 200),
    ...(uf ? { uf } : {}),
  };
};

export const collectOptionsFromBody = (body: unknown): CollectOptions => {
  const options = collectOptionsFromEnv();
  if (body === undefined || body === null) return options;
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidParameterError("Ingest body must be a JSON object", [
      { field: "body", issue: "invalid_type" },
    ]);
  }

  const record = body as Record<string, unknown>;
  let { from, to } = options;
  if (typeof record.days === "number") {
    if (
      !Number.isInteger(record.days) ||
      record.days < 1 ||
      record.days > MAX_WINDOW_DAYS
    ) {
      throw new InvalidParameterError("days must be an integer from 1 to 366", [
        { field: "days", issue: "out_of_range" },
      ]);
    }
    to = saoPauloToday();
    from = addDays(to, -(record.days - 1));
  }
  if (typeof record.from === "string") from = record.from;
  if (typeof record.to === "string") to = record.to;
  assertWindow(from, to);

  const modalities = Array.isArray(record.modalities)
    ? record.modalities.map((item) => Number(item))
    : options.modalities;
  if (
    modalities.some(
      (modality) =>
        !Number.isInteger(modality) || modality < 1 || modality > 13,
    )
  ) {
    throw new InvalidParameterError(
      "modalities must be integers from 1 to 13",
      [{ field: "modalities", issue: "invalid_enum" }],
    );
  }

  return {
    ...options,
    from,
    to,
    modalities,
    force:
      options.force ||
      typeof record.from === "string" ||
      typeof record.to === "string",
  };
};

const dayStart = (isoDate: string): Date =>
  new Date(`${isoDate}T00:00:00-03:00`);
const dayEnd = (isoDate: string): Date =>
  new Date(`${isoDate}T23:59:59.999-03:00`);

async function touchRun(runId: string, counters: RunCounters): Promise<void> {
  await db
    .update(ingestRunsTable)
    .set({
      heartbeatAt: new Date(),
      pagesRead: counters.pagesRead,
      upserted: counters.upserted,
      refreshed: counters.refreshed,
      refreshErrors: counters.refreshErrors,
    })
    .where(eq(ingestRunsTable.id, runId));
}

const partitionKey = (day: string, modality: number, uf: string) =>
  and(
    eq(ingestDaysTable.source, SOURCE),
    eq(ingestDaysTable.day, day),
    eq(ingestDaysTable.modality, modality),
    eq(ingestDaysTable.uf, uf),
  );

async function loadCalendar(): Promise<IngestDay[]> {
  return db
    .select()
    .from(ingestDaysTable)
    .where(eq(ingestDaysTable.source, SOURCE))
    .orderBy(
      asc(ingestDaysTable.day),
      asc(ingestDaysTable.modality),
      asc(ingestDaysTable.uf),
    );
}

async function readPages(input: {
  runId: string;
  day: string;
  modality: number;
  pageSize: number;
  uf?: string;
  counters: RunCounters;
}): Promise<void> {
  const uf = input.uf ?? "all";
  const startedAt = new Date();
  const progress = { pagesRead: 0, upserted: 0 };
  await db
    .insert(ingestDaysTable)
    .values({
      source: SOURCE,
      day: input.day,
      modality: input.modality,
      uf,
      status: "pending",
      startedAt,
      completedAt: null,
      ...progress,
    })
    .onConflictDoUpdate({
      target: [
        ingestDaysTable.source,
        ingestDaysTable.day,
        ingestDaysTable.modality,
        ingestDaysTable.uf,
      ],
      set: { status: "pending", startedAt, completedAt: null, ...progress },
    });
  let page = 1;
  let totalPages = 1;
  let pageSize = input.pageSize;

  while (page <= totalPages) {
    await touchRun(input.runId, input.counters);
    let result;
    try {
      result = await fetchPublicationPage({
        day: compactDay(input.day),
        modality: input.modality,
        page,
        pageSize,
        uf: input.uf,
      });
    } catch (error) {
      if (
        error instanceof PncpError &&
        error.status === 400 &&
        pageSize !== 10 &&
        /tamanho/i.test(error.body)
      ) {
        pageSize = 10;
        page = 1;
        totalPages = 1;
        continue;
      }
      throw error;
    }

    totalPages = result.totalPaginas;
    const upserted = await upsertPublications(result.data, new Date());
    input.counters.pagesRead += 1;
    input.counters.upserted += upserted;
    progress.pagesRead += 1;
    progress.upserted += upserted;
    await db
      .update(ingestDaysTable)
      .set(progress)
      .where(partitionKey(input.day, input.modality, uf));
    logger.info(
      {
        runId: input.runId,
        day: input.day,
        modality: input.modality,
        uf: input.uf ?? null,
        page,
        totalPages,
        upserted,
      },
      "PNCP page stored",
    );
    page += 1;
  }

  await db
    .update(ingestDaysTable)
    .set({ status: "complete", completedAt: new Date() })
    .where(partitionKey(input.day, input.modality, uf));
}

async function readDay(input: {
  runId: string;
  day: string;
  modality: number;
  pageSize: number;
  counters: RunCounters;
  uf?: string;
  force?: boolean;
  calendar: IngestDay[];
}): Promise<void> {
  const scopes = planDay(
    input.calendar,
    input.day,
    input.modality,
    saoPauloToday(),
    input,
  );
  if (input.force) {
    // Invalidate old national/UF coverage before attempting a forced backfill.
    await db
      .update(ingestDaysTable)
      .set({ status: "pending", completedAt: null })
      .where(
        and(
          eq(ingestDaysTable.source, SOURCE),
          eq(ingestDaysTable.day, input.day),
          eq(ingestDaysTable.modality, input.modality),
          ...(input.uf ? [inArray(ingestDaysTable.uf, ["all", input.uf])] : []),
        ),
      );
  }
  for (const scope of scopes) {
    if (scope !== "all") {
      await readPages({ ...input, uf: scope });
      continue;
    }
    try {
      await readPages({ ...input, uf: undefined });
    } catch (error) {
      const multiplePoints =
        error instanceof PncpError &&
        error.status === 400 &&
        /multiple points/i.test(error.body);
      if (!isPncpTimeout(error) && !multiplePoints) throw error;
      logger.warn(
        { err: error, day: input.day, modality: input.modality },
        multiplePoints
          ? "PNCP rejected the national page; splitting the request by UF"
          : "PNCP timed out for the day; splitting the request by UF",
      );
      for (const uf of PNCP_UFS) {
        try {
          await readPages({ ...input, uf });
        } catch (ufError) {
          if (!isRecoverablePncpFailure(ufError)) throw ufError;
          logger.warn(
            { err: ufError, day: input.day, modality: input.modality, uf },
            "PNCP unavailable for this UF; leaving it open and continuing",
          );
        }
      }
    }
  }
}

async function refreshOpenTenders(
  runId: string,
  startedAt: Date,
  limit: number,
  counters: RunCounters,
): Promise<void> {
  const rows = await db
    .select({
      id: tendersTable.id,
      pncpControlNumber: tendersTable.pncpControlNumber,
      rawPayload: tendersTable.rawPayload,
    })
    .from(tendersTable)
    .where(
      and(
        eq(tendersTable.sourceId, SOURCE),
        inArray(tendersTable.status, ["open", "under_review", "suspended"]),
        lt(tendersTable.fetchedAt, startedAt),
        pncpSourceRemovedMarker(),
      ),
    )
    .orderBy(asc(tendersTable.fetchedAt))
    .limit(limit);

  for (const row of rows) {
    const identity = parseControlNumber(row.pncpControlNumber);
    const publication = row.rawPayload as {
      publication?: Record<string, unknown>;
    };
    const record =
      publication.publication ?? (row.rawPayload as Record<string, unknown>);
    if (!identity) {
      counters.refreshErrors += 1;
      logger.error(
        { tenderId: row.id, pncpControlNumber: row.pncpControlNumber },
        "Cannot refresh PNCP tender without a parseable control number",
      );
      continue;
    }

    try {
      await touchRun(runId, counters);
      const compra = await fetchCompra(
        identity.cnpj,
        identity.ano,
        identity.sequencial,
      );
      if (!compra) {
        counters.refreshErrors += 1;
        logger.error(
          { tenderId: row.id },
          "PNCP compra was not found during refresh",
        );
        continue;
      }
      await upsertPublications(
        [{ ...record, ...compra, numeroControlePNCP: row.pncpControlNumber }],
        new Date(),
      );
      await enrichTenderById(row.id);
      counters.refreshed += 1;
    } catch (error) {
      if (classifyPncpRefreshFailure(error) === "source_removed") {
        const now = new Date();
        await db
          .update(tendersTable)
          .set({
            rawPayload: markPncpSourceRemovedPayload(now),
            updatedAt: now,
          })
          .where(eq(tendersTable.id, row.id));
        logger.warn(
          { err: error, tenderId: row.id },
          "PNCP compra was removed during refresh",
        );
        continue;
      }
      counters.refreshErrors += 1;
      logger.error({ err: error, tenderId: row.id }, "PNCP refresh failed");
    }
  }
}

async function execute(
  runId: string,
  options: CollectOptions,
  startedAt: Date,
): Promise<void> {
  const counters: RunCounters = {
    pagesRead: 0,
    upserted: 0,
    refreshed: 0,
    refreshErrors: 0,
  };

  try {
    const calendar = await loadCalendar();
    for (const day of eachDay(options.from, options.to)) {
      await touchRun(runId, counters);
      for (const modality of options.modalities) {
        try {
          await readDay({
            runId,
            day,
            modality,
            pageSize: options.pageSize,
            counters,
            uf: options.uf,
            force: options.force,
            calendar,
          });
        } catch (error) {
          const status = error instanceof PncpError ? error.status : undefined;
          if (!isRecoverablePncpFailure(error)) throw error;
          logger.warn(
            { err: error, day, modality, status },
            "PNCP unavailable for this partition; leaving it open and continuing",
          );
        }
      }
    }
    if (options.refreshLimit > 0) {
      await refreshOpenTenders(
        runId,
        startedAt,
        options.refreshLimit,
        counters,
      );
    }
    await db
      .update(ingestRunsTable)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        heartbeatAt: new Date(),
        ...counters,
      })
      .where(eq(ingestRunsTable.id, runId));
    logger.info({ runId, ...counters }, "PNCP ingest finished");
    const { classifyAfterCollect } = await import("../titles/classify");
    await classifyAfterCollect("pncp_collect");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, runId }, "PNCP ingest failed");
    await db
      .update(ingestRunsTable)
      .set({
        status: "failed",
        error: message,
        finishedAt: new Date(),
        heartbeatAt: new Date(),
        ...counters,
      })
      .where(eq(ingestRunsTable.id, runId));
  }
}

export async function startPncpIngest(
  options: CollectOptions,
): Promise<{ runId: string; status: "running" }> {
  await abandonStalePncpRuns();

  const runId = crypto.randomUUID();
  const startedAt = new Date();
  try {
    await db.insert(ingestRunsTable).values({
      id: runId,
      source: SOURCE,
      status: "running",
      windowFrom: dayStart(options.from),
      windowTo: dayEnd(options.to),
      startedAt,
      heartbeatAt: startedAt,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new IngestInProgressError();
    throw error;
  }

  void execute(runId, options, startedAt).catch((error) => {
    logger.error(
      { err: error, runId },
      "PNCP ingest crashed before recording the failure",
    );
  });
  return { runId, status: "running" };
}

export async function abandonStalePncpRuns(now = new Date()): Promise<number> {
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
      "Stale PNCP ingest runs marked as failed",
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
});

export async function getLatestIngest() {
  await abandonStalePncpRuns();
  const [run] = await db
    .select()
    .from(ingestRunsTable)
    .where(eq(ingestRunsTable.source, SOURCE))
    .orderBy(desc(ingestRunsTable.startedAt))
    .limit(1);
  const [updated] = await db
    .select({ indexUpdatedAt: tendersTable.fetchedAt })
    .from(tendersTable)
    .orderBy(desc(tendersTable.fetchedAt))
    .limit(1);

  return {
    run: run ? serializeRun(run) : null,
    indexUpdatedAt: updated?.indexUpdatedAt ?? null,
    coverage: summarizeCoverage(await loadCalendar(), collectOptionsFromEnv()),
  };
}

const isCli = process.argv[1]?.includes("collect-pncp");

if (isCli) {
  const options = collectOptionsFromEnv();
  logger.info(options, "Starting PNCP ingest");
  startPncpIngest(options)
    .then(async ({ runId }) => {
      const started = Date.now();
      while (Date.now() - started < 24 * 60 * 60 * 1000) {
        const latest = await getLatestIngest();
        if (latest.run?.id === runId && latest.run.status !== "running") {
          if (latest.run.status === "failed") {
            logger.error({ run: latest.run }, "PNCP ingest failed");
            process.exitCode = 1;
          } else {
            logger.info(
              { run: latest.run, indexUpdatedAt: latest.indexUpdatedAt },
              "PNCP ingest stored",
            );
          }
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      throw new Error(`PNCP ingest ${runId} did not finish within 24 hours`);
    })
    .catch((error) => {
      logger.error({ err: error }, "PNCP ingest failed");
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
      process.exit(process.exitCode ?? 0);
    });
}
