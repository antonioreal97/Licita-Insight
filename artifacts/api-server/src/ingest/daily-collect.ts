import { logger } from "../lib/logger";
import {
  collectOptionsFromEnv,
  IngestInProgressError,
  startPncpIngest,
} from "./collect-pncp";

const TZ = "America/Sao_Paulo";

const dailyHour = (): number => {
  const raw = process.env.PNCP_DAILY_HOUR;
  if (raw === undefined || raw.trim() === "") return 6;
  const hour = Number(raw);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(
      `PNCP_DAILY_HOUR must be an integer from 0 to 23, received "${raw}"`,
    );
  }
  return hour;
};

/** Milliseconds until the next `hour:00` in America/Sao_Paulo. Brazil has no DST, so the offset is UTC−3. */
const msUntilHour = (hour: number, now = new Date()): number => {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const [year, month, day] = date.split("-").map(Number);
  const [currentHour, minute, second] = clock.split(":").map(Number);
  const past =
    currentHour > hour ||
    (currentHour === hour && (minute > 0 || second > 0));
  const target = new Date(
    Date.UTC(year, month - 1, past ? day + 1 : day, hour + 3, 0, 0),
  );
  return Math.max(1_000, target.getTime() - now.getTime());
};

export function startDailyPncpCollect(): void {
  if (process.env.PNCP_DAILY_COLLECT === "false") {
    logger.info("Daily PNCP collect is disabled");
    return;
  }
  if (!process.env.DATABASE_URL) {
    logger.error("DATABASE_URL is not set; daily PNCP collect will not start");
    return;
  }

  const hour = dailyHour();

  const run = async (reason: string) => {
    try {
      const options = collectOptionsFromEnv();
      const started = await startPncpIngest(options);
      logger.info(
        { reason, runId: started.runId, from: options.from, to: options.to },
        "Daily PNCP collect started",
      );
    } catch (error) {
      if (error instanceof IngestInProgressError) {
        logger.info(
          { reason },
          "Daily PNCP collect skipped because one is already running",
        );
        return;
      }
      logger.error({ err: error, reason }, "Daily PNCP collect failed to start");
    }
  };

  const arm = () => {
    const delay = msUntilHour(hour);
    logger.info({ hour, delayMs: delay }, "Next PNCP collect scheduled");
    setTimeout(() => {
      void run("schedule").finally(arm);
    }, delay);
  };

  void run("startup");
  arm();
}

export function startDailyCultureCollect(): void {
  if (process.env.CULTURE_DAILY_COLLECT === "false") {
    logger.info("Daily cultural opportunities collect is disabled");
    return;
  }
  if (!process.env.DATABASE_URL) {
    logger.error("DATABASE_URL is not set; daily cultural opportunities collect will not start");
    return;
  }

  const hour = dailyHour();

  const run = async (reason: string) => {
    try {
      const { startCultureIngest } = await import("./collect-opportunities");
      const started = await startCultureIngest();
      logger.info(
        { reason, runId: started.runId },
        "Daily cultural opportunities collect started",
      );
    } catch (error) {
      const { CultureIngestInProgressError } = await import("./collect-opportunities");
      if (error instanceof CultureIngestInProgressError) {
        logger.info(
          { reason },
          "Daily cultural opportunities collect skipped because one is already running",
        );
        return;
      }
      logger.error(
        { err: error, reason },
        "Daily cultural opportunities collect failed to start",
      );
    }
  };

  const arm = () => {
    const delay = msUntilHour(hour);
    logger.info({ hour, delayMs: delay }, "Next cultural opportunities collect scheduled");
    setTimeout(() => {
      void run("schedule").finally(arm);
    }, delay);
  };

  void run("startup");
  arm();
}
