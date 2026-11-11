import { categoryStudentEnabled } from "../ai/ollama-client";
import { aiConfig } from "../ai/config";
import { SAO_PAULO_TIME_ZONE } from "../lib/sao-paulo-date";

const MINUTES_PER_DAY = 24 * 60;

const clockMinutes = (name: string, fallback: string): number => {
  const raw = process.env[name]?.trim() || fallback;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/u.exec(raw);
  if (!match) throw new Error(`${name} must be a time from 00:00 to 23:59, received "${raw}"`);
  return Number(match[1]) * 60 + Number(match[2]);
};

const positiveInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

const nonNegativeInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
};

/** An instant from the environment; "off" turns the setting off. */
const instantOrOff = (name: string, fallback: string): Date | null => {
  const raw = process.env[name]?.trim() || fallback;
  if (raw.toLowerCase() === "off") return null;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) throw new Error(`${name} must be an ISO date-time or "off", received "${raw}"`);
  return value;
};

/**
 * Examples created before this instant form the holdout scored every night. Fixed, so the score of
 * one night compares with the next: new teacher examples come from the student's doubtful tenders
 * and would otherwise make the test harder night after night. On 2026-11-08 at 00:00 (Sao Paulo)
 * the holdout already had the 500 examples the nightly sample takes.
 */
export const DEFAULT_HOLDOUT_FROZEN_AT = "2026-11-08T03:00:00Z";

const probability = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be a number from 0 to 1`);
  return value;
};

/**
 * The nightly job is how the student runs once it is enabled; `NIGHTLY_CATEGORY_ENABLED=false`
 * goes back to classifying right after each collect.
 */
export const nightlyCategoryEnabled = (): boolean =>
  categoryStudentEnabled() && process.env.NIGHTLY_CATEGORY_ENABLED?.trim().toLowerCase() !== "false";

export type NightlyCategoryConfig = {
  windowStartMinutes: number;
  windowEndMinutes: number;
  pollMs: number;
  retryMs: number;
  /** Tenders read, classified and written per round. */
  batch: number;
  /** Texts per Ollama request: small enough to finish inside the shutdown grace period. */
  embedChunk: number;
  /**
   * Pause before asking Ollama again after a failed embedding, times the attempt number. The first
   * request of the night loads the model; on a machine short of memory that takes minutes, and
   * asking again at once only adds load.
   */
  embedRetryDelayMs: number;
  /** Share of the window the example embeddings may take before tenders start. */
  exampleShare: number;
  /** Below this many usable examples the job keeps embedding instead of classifying. */
  minExamples: number;
  /** Holdout examples checked each night for the agreement in the summary; 0 skips it. */
  holdoutSample: number;
  /**
   * Only holdout examples created before this instant are scored for the agreement; the newer ones
   * are scored apart. Null scores the whole holdout, as before.
   */
  holdoutFrozenAt: Date | null;
  jev: {
    enabled: boolean;
    /** Student confidence below which a tender goes to Jev. */
    threshold: number;
    dailyLimit: number;
    /** Jev answers below this confidence are not written nor kept as examples. */
    minConfidence: number;
    concurrency: number;
  };
};

export const nightlyCategoryConfig = (): NightlyCategoryConfig => ({
  windowStartMinutes: clockMinutes("NIGHTLY_CATEGORY_WINDOW_START", "00:00"),
  windowEndMinutes: clockMinutes("NIGHTLY_CATEGORY_WINDOW_END", "05:30"),
  pollMs: positiveInteger("NIGHTLY_CATEGORY_POLL_MS", 60_000),
  retryMs: positiveInteger("NIGHTLY_CATEGORY_RETRY_MS", 10 * 60_000),
  batch: positiveInteger("NIGHTLY_CATEGORY_BATCH", 64),
  embedChunk: positiveInteger("NIGHTLY_CATEGORY_EMBED_CHUNK", 8),
  embedRetryDelayMs: nonNegativeInteger("NIGHTLY_CATEGORY_EMBED_RETRY_DELAY_MS", 20_000),
  exampleShare: probability("NIGHTLY_CATEGORY_EXAMPLE_SHARE", 0.4),
  minExamples: positiveInteger("NIGHTLY_CATEGORY_MIN_EXAMPLES", 200),
  holdoutSample: nonNegativeInteger("NIGHTLY_CATEGORY_HOLDOUT_SAMPLE", 500),
  holdoutFrozenAt: instantOrOff("NIGHTLY_CATEGORY_HOLDOUT_FROZEN_AT", DEFAULT_HOLDOUT_FROZEN_AT),
  jev: {
    enabled: process.env.JEV_TEACHER_ENABLED?.trim().toLowerCase() !== "false" && aiConfig().apiKey !== null,
    threshold: probability("JEV_TEACHER_CONFIDENCE_THRESHOLD", 0.6),
    dailyLimit: nonNegativeInteger("JEV_TEACHER_DAILY_LIMIT", 1_500),
    minConfidence: probability("JEV_TEACHER_MIN_CONFIDENCE", 0.5),
    concurrency: positiveInteger("JEV_TEACHER_CONCURRENCY", 4),
  },
});

const clockFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: SAO_PAULO_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type NightlyWindow =
  | { open: false }
  | {
    open: true;
    opensAt: Date;
    closesAt: Date;
    /** Identifies one night, so a finished night is not started again. */
    key: string;
  };

/** Where `now` falls in the America/Sao_Paulo window; `start > end` crosses midnight. */
export const nightlyWindowAt = (
  now: Date,
  window: Pick<NightlyCategoryConfig, "windowStartMinutes" | "windowEndMinutes">,
): NightlyWindow => {
  const [hour, minute, second] = clockFormatter.format(now).split(":").map(Number);
  const secondsOfDay = hour * 3_600 + minute * 60 + second;
  const start = window.windowStartMinutes * 60;
  const end = window.windowEndMinutes * 60;
  if (start === end) return { open: false };
  const inside = start < end
    ? secondsOfDay >= start && secondsOfDay < end
    : secondsOfDay >= start || secondsOfDay < end;
  if (!inside) return { open: false };
  const day = MINUTES_PER_DAY * 60;
  const sinceOpen = (secondsOfDay - start + day) % day;
  const untilClose = (end - secondsOfDay + day) % day;
  const wholeSecond = now.getTime() - now.getMilliseconds();
  const closesAt = new Date(wholeSecond + untilClose * 1_000);
  return {
    open: true,
    opensAt: new Date(wholeSecond - sinceOpen * 1_000),
    closesAt,
    key: closesAt.toISOString(),
  };
};
