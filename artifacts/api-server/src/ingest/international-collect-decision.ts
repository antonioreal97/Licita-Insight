const TZ = "America/Sao_Paulo";

export const INTERNATIONAL_RELEVANT_SOURCES = [
  "pncp",
  "pncp-transparency",
  "mapas-culturais",
  "funding-opportunities",
  "culture-federal",
  "international",
] as const;

export type InternationalIngestRun = {
  source: string;
  status: string;
  startedAt: Date;
  heartbeatAt: Date;
  finishedAt: Date | null;
};

export type InternationalCollectDecisionConfig = {
  pncpDailyEnabled: boolean;
  pncpHour: number;
  safetyHour: number;
  retryIntervalMs: number;
  staleAfterMsBySource: Readonly<Record<string, number>>;
};

export type InternationalCollectDecision =
  | {
      action: "run";
      reason: "pncp_finished" | "safety_hour";
    }
  | {
      action: "wait";
      reason:
        | "night_window"
        | "before_pncp_or_safety"
        | "waiting_for_pncp"
        | "other_collect_running";
      retryAt: Date;
    }
  | {
      action: "already_ran";
      reason: "international_started_today";
    };

const saoPauloDateParts = (
  now: Date,
): { year: number; month: number; day: number } => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
};

/** Brazil has no DST, so midnight in America/Sao_Paulo is always 03:00 UTC. */
export const saoPauloDayStart = (now: Date): Date => {
  const { year, month, day } = saoPauloDateParts(now);
  return new Date(Date.UTC(year, month - 1, day, 3));
};

const atLocalTime = (dayStart: Date, hour: number, minute = 0): Date =>
  new Date(dayStart.getTime() + (hour * 60 + minute) * 60_000);

const isBetween = (value: Date, start: Date, end: Date): boolean =>
  value >= start && value < end;

const retrySoon = (
  now: Date,
  config: InternationalCollectDecisionConfig,
): Date => new Date(now.getTime() + config.retryIntervalMs);

/**
 * Decides whether today's international collection may start. The function is intentionally pure so
 * process restarts and scheduler timing do not influence the once-per-day rule.
 */
export const decideInternationalCollect = (
  now: Date,
  runs: readonly InternationalIngestRun[],
  config: InternationalCollectDecisionConfig,
): InternationalCollectDecision => {
  const today = saoPauloDayStart(now);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60_000);
  const quietWindowEnd = atLocalTime(today, 5, 30);
  const pncpTime = atLocalTime(today, config.pncpHour);
  const safetyTime = atLocalTime(today, config.safetyHour);

  if (
    runs.some(
      (run) =>
        run.source === "international" &&
        (run.status === "complete" ||
          run.status === "succeeded" ||
          run.status === "running") &&
        isBetween(run.startedAt, today, tomorrow),
    )
  ) {
    return {
      action: "already_ran",
      reason: "international_started_today",
    };
  }

  if (now < quietWindowEnd) {
    return {
      action: "wait",
      reason: "night_window",
      retryAt: quietWindowEnd,
    };
  }

  const pncpFinishedAfterDailyTime = runs.some(
    (run) =>
      run.source === "pncp" &&
      run.status !== "running" &&
      run.finishedAt !== null &&
      isBetween(run.finishedAt, pncpTime, tomorrow) &&
      run.finishedAt <= now,
  );
  const safetyFallback = now >= safetyTime;

  if (!pncpFinishedAfterDailyTime && !safetyFallback) {
    const firstRelevantTime = config.pncpDailyEnabled
      ? new Date(Math.min(pncpTime.getTime(), safetyTime.getTime()))
      : safetyTime;
    if (now < firstRelevantTime) {
      return {
        action: "wait",
        reason: "before_pncp_or_safety",
        retryAt: firstRelevantTime,
      };
    }
    return {
      action: "wait",
      reason: "waiting_for_pncp",
      retryAt: new Date(
        Math.min(retrySoon(now, config).getTime(), safetyTime.getTime()),
      ),
    };
  }

  const anotherCollectIsRunning = runs.some((run) => {
    if (run.source === "international" || run.status !== "running")
      return false;
    const staleAfterMs = config.staleAfterMsBySource[run.source];
    return (
      staleAfterMs !== undefined &&
      run.heartbeatAt.getTime() >= now.getTime() - staleAfterMs
    );
  });
  if (anotherCollectIsRunning) {
    return {
      action: "wait",
      reason: "other_collect_running",
      retryAt: retrySoon(now, config),
    };
  }

  return {
    action: "run",
    reason: pncpFinishedAfterDailyTime ? "pncp_finished" : "safety_hour",
  };
};

export const nextInternationalCollectDayCheck = (
  now: Date,
  config: InternationalCollectDecisionConfig,
): Date => {
  const tomorrow = new Date(saoPauloDayStart(now).getTime() + 24 * 60 * 60_000);
  const hour = config.pncpDailyEnabled
    ? Math.min(config.pncpHour, config.safetyHour)
    : config.safetyHour;
  return atLocalTime(tomorrow, hour);
};
