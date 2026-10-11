import { logger } from "../lib/logger";
import {
  CULTURAL_INSTALLATIONS,
  type CulturalInstallation,
  type InstallationScope,
  type MapasInstallation,
} from "./cultural-installations";
import {
  fetchOpenOpportunities,
  type FetchOpportunitiesResult,
} from "./mapas-client";
import { MapasClientError, publicInstallationFailure } from "./mapas-errors";

/** The daily run asks for calls that close today or later. A larger value re-reads recently closed calls. */
const DEFAULT_LOOKBACK_DAYS = 1;
/** A municipal install that fails this many runs in a row is switched off. */
export const DISABLE_AFTER_FAILURES = 3;
/** A switched-off install is tried again after this long, and comes back by itself if it answers. */
export const RETRY_DISABLED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

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
    | "disabled"
    | "vocabulary_fallback"
    | "pending";
  upserted: number;
  message: string | null;
  /** Fields below are absent from runs recorded before the collection covered municipal installs. */
  scope?: InstallationScope;
  city?: string | null;
  /** Calls with registration open at collection time, out of `upserted`. */
  open?: number;
  consecutiveFailures?: number;
  disabledAt?: string | null;
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
  scope: installation.scope,
  city: null,
});

const mapasCoverage = (
  installation: MapasInstallation,
  row: Pick<InstallationCoverage, "outcome" | "message"> &
    Partial<InstallationCoverage>,
): InstallationCoverage => ({
  id: installation.id,
  uf: installation.uf,
  name: installation.name,
  kind: "mapas",
  url: installation.baseUrl,
  upserted: 0,
  scope: installation.scope,
  city: installation.city ?? null,
  open: 0,
  consecutiveFailures: 0,
  disabledAt: null,
  ...row,
});

export const pendingCoverage = (): InstallationCoverage[] =>
  CULTURAL_INSTALLATIONS.map((installation) =>
    installation.kind === "gap"
      ? gapCoverage(installation)
      : mapasCoverage(installation, { outcome: "pending", message: null }),
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

const formatDay = (date: Date): string =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
    date,
  );

/** When a switched-off municipal install is still inside its rest period, the date it will be tried again. */
export const disabledUntil = (
  installation: MapasInstallation,
  previous: InstallationCoverage | undefined,
  now: Date,
): Date | null => {
  if (installation.scope !== "municipal") return null;
  if (previous?.outcome !== "disabled" || !previous.disabledAt) return null;
  const disabledAt = Date.parse(previous.disabledAt);
  if (Number.isNaN(disabledAt)) return null;
  const retryAt = new Date(disabledAt + RETRY_DISABLED_AFTER_MS);
  return retryAt.getTime() > now.getTime() ? retryAt : null;
};

export type StoredInstallation = { upserted: number; closed: number };

export type CollectDependencies = {
  installations?: CulturalInstallation[];
  /** Latest coverage row of each install, from earlier runs. Carries the failure streak. */
  previous?: Map<string, InstallationCoverage>;
  fetchOpportunities?: (
    installation: MapasInstallation,
    now: Date,
  ) => Promise<FetchOpportunitiesResult>;
  store: (
    installation: MapasInstallation,
    result: FetchOpportunitiesResult,
  ) => Promise<StoredInstallation>;
  onProgress?: (summary: CollectSummary) => Promise<void>;
};

export type CollectSummary = {
  coverage: InstallationCoverage[];
  pagesRead: number;
  upserted: number;
  closed: number;
  attempted: number;
  failed: number;
  failures: string[];
};

/**
 * Runs every install in turn. One install failing, being blocked or being switched off never stops the
 * others. No database access here: storage and progress reporting are injected.
 */
export async function collectInstallations(
  now: Date,
  dependencies: CollectDependencies,
): Promise<CollectSummary> {
  const installations = dependencies.installations ?? CULTURAL_INSTALLATIONS;
  const previous = dependencies.previous ?? new Map();
  const fetchOpportunities =
    dependencies.fetchOpportunities ??
    ((installation, at) =>
      fetchOpenOpportunities(installation, at, {
        lookbackDays: cultureLookbackDays(),
      }));
  const summary: CollectSummary = {
    coverage: [],
    pagesRead: 0,
    upserted: 0,
    closed: 0,
    attempted: 0,
    failed: 0,
    failures: [],
  };

  for (const installation of installations) {
    if (installation.kind === "gap") {
      summary.coverage.push(gapCoverage(installation));
      continue;
    }
    const before = previous.get(installation.id);
    const retryAt = disabledUntil(installation, before, now);
    if (retryAt) {
      summary.coverage.push(
        mapasCoverage(installation, {
          outcome: "disabled",
          message: `Fonte desativada automaticamente por não responder; nova tentativa em ${formatDay(retryAt)}.`,
          consecutiveFailures: before?.consecutiveFailures ?? 0,
          disabledAt: before?.disabledAt ?? null,
        }),
      );
      continue;
    }

    summary.attempted += 1;
    try {
      const result = await fetchOpportunities(installation, now);
      const stored = await dependencies.store(installation, result);
      summary.pagesRead += result.pagesRead;
      summary.upserted += stored.upserted;
      summary.closed += stored.closed;
      summary.coverage.push(
        mapasCoverage(installation, {
          outcome: "ok",
          upserted: stored.upserted,
          open: result.drafts.filter((draft) => draft.status === "open").length,
          message: result.warning,
        }),
      );
    } catch (error) {
      summary.failed += 1;
      const publicFailure = publicInstallationFailure(error, installation);
      summary.failures.push(`${installation.name}: ${publicFailure.message}`);
      logger.error(
        { err: error, installationId: installation.id },
        "Mapas Culturais installation failed; continuing",
      );
      // A rate limit says the install is alive, so it does not count towards switching it off.
      const rateLimited =
        error instanceof MapasClientError && error.kind === "rate_limited";
      const streak = (before?.consecutiveFailures ?? 0) + (rateLimited ? 0 : 1);
      const disable =
        installation.scope === "municipal" && streak >= DISABLE_AFTER_FAILURES;
      summary.coverage.push(
        mapasCoverage(installation, {
          outcome: disable ? "disabled" : publicFailure.outcome,
          message: disable
            ? `${publicFailure.message} Fonte desativada automaticamente após ${streak} falhas seguidas; nova tentativa em ${formatDay(new Date(now.getTime() + RETRY_DISABLED_AFTER_MS))}.`
            : publicFailure.message,
          consecutiveFailures: streak,
          disabledAt: disable ? now.toISOString() : null,
        }),
      );
    }

    await dependencies.onProgress?.(summary);
  }

  return summary;
}
