import { tryRunSingletonJob, type SingletonJobResult } from "../jobs/job-lock";
import { logger } from "../lib/logger";
import type { NightlyResult } from "./nightly-classification";
import {
  nightlyCategoryConfig,
  nightlyCategoryEnabled,
  nightlyWindowAt,
  type NightlyCategoryConfig,
} from "./nightly-window";
import type { StopSignal } from "./progress";

export const NIGHTLY_CATEGORY_JOB_KEY = "nightly_category_classification";

type NightlyRun = (input: {
  deadline: Date;
  signal: StopSignal;
  config: NightlyCategoryConfig;
}) => Promise<Pick<NightlyResult, "complete" | "skipped">>;

const runNightly: NightlyRun = async (input) =>
  (await import("./nightly-classification")).runNightlyCategoryClassification(input);

type NightlyRunnerOptions = {
  config?: NightlyCategoryConfig;
  now?: () => Date;
  run?: NightlyRun;
  lock?: <T>(jobKey: string, job: () => Promise<T>) => Promise<SingletonJobResult<T>>;
};

/** Decides, on every poll, whether tonight's run starts, resumes or stays put. */
export const createNightlyCategoryRunner = (options: NightlyRunnerOptions = {}) => {
  const config = options.config ?? nightlyCategoryConfig();
  const now = options.now ?? (() => new Date());
  const run = options.run ?? runNightly;
  const lock = options.lock ?? tryRunSingletonJob;
  let running = false;
  let stopped = false;
  let finishedWindow: string | null = null;
  let retryAt = 0;
  const signal: StopSignal = {
    get stopped() {
      return stopped;
    },
  };
  return {
    /** Resolves to what happened, for the tests; the scheduler only fires it. */
    async tick(): Promise<"idle" | "busy" | "finished" | "waiting" | "locked" | "ran" | "failed"> {
      if (stopped) return "idle";
      if (running) return "busy";
      const at = now();
      const window = nightlyWindowAt(at, config);
      if (!window.open) return "idle";
      if (window.key === finishedWindow) return "finished";
      if (at.getTime() < retryAt) return "waiting";
      running = true;
      try {
        const locked = await lock(NIGHTLY_CATEGORY_JOB_KEY, () => run({ deadline: window.closesAt, signal, config }));
        if (!locked.acquired) {
          retryAt = now().getTime() + config.retryMs;
          return "locked";
        }
        // A night stopped by the clock or by a shutdown stays open: the next poll resumes it.
        if (locked.value.complete || locked.value.skipped) finishedWindow = window.key;
        return "ran";
      } catch (error) {
        retryAt = now().getTime() + config.retryMs;
        logger.warn({ err: error, retryMs: config.retryMs }, "Nightly category classification failed");
        return "failed";
      } finally {
        running = false;
      }
    },
    stop(): void {
      stopped = true;
    },
  };
};

/** Polls the window; the run itself holds the `nightly_category_classification` lock. */
export function startNightlyCategoryClassification(): () => void {
  if (!nightlyCategoryEnabled()) return () => undefined;
  if (!process.env.DATABASE_URL) {
    logger.error("DATABASE_URL is not set; nightly category classification will not start");
    return () => undefined;
  }
  const config = nightlyCategoryConfig();
  const runner = createNightlyCategoryRunner({ config });
  logger.info(
    {
      windowStartMinutes: config.windowStartMinutes,
      windowEndMinutes: config.windowEndMinutes,
      jevTeacher: config.jev.enabled,
      jevDailyLimit: config.jev.dailyLimit,
    },
    "Nightly category classification scheduled",
  );
  const fire = () => void runner.tick().catch((error) => {
    logger.error({ err: error }, "Nightly category classification tick failed");
  });
  fire();
  const timer = setInterval(fire, config.pollMs);
  timer.unref();
  return () => {
    runner.stop();
    clearInterval(timer);
  };
}
