import type { OpportunityDeadlinePrecision } from "@workspace/db";

export type InternationalDeadline = {
  /** The instant used for ordering and for closing the call. */
  at: Date;
  precision: OpportunityDeadlinePrecision;
  /** IANA zone of the wall clock the source published, when it is known. */
  timeZone: string | null;
  /** The deadline as the source wrote it: `2026-10-27 11:00` or `2026-10-27`. */
  original: string;
};

const parts = (instant: Date, timeZone: string): Record<string, number> => {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  return Object.fromEntries(
    formatted
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
};

/** Offset of the zone at that instant, in milliseconds east of UTC. */
const offsetMs = (instant: Date, timeZone: string): number => {
  const local = parts(instant, timeZone);
  return (
    Date.UTC(
      local.year!,
      local.month! - 1,
      local.day!,
      local.hour!,
      local.minute!,
      local.second!,
    ) - instant.getTime()
  );
};

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export const isTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
};

/**
 * The instant of a wall-clock time in a zone. Two passes settle the offset around a daylight-saving change;
 * an hour skipped by the change resolves to the instant just after it.
 */
export const zonedTimeToUtc = (
  day: string,
  clock: string,
  timeZone: string,
): Date | null => {
  const date = DAY.exec(day);
  const time = CLOCK.exec(clock);
  if (!date || !time || !isTimeZone(timeZone)) return null;
  const hour = Number(time[1]);
  const minute = Number(time[2]);
  const second = Number(time[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  const wall = Date.UTC(
    Number(date[1]),
    Number(date[2]) - 1,
    Number(date[3]),
    hour,
    minute,
    second,
  );
  if (new Date(wall).toISOString().slice(0, 10) !== day) return null;
  const first = wall - offsetMs(new Date(wall), timeZone);
  return new Date(wall - offsetMs(new Date(first), timeZone));
};

/** The day is over everywhere on Earth at 23:59:59 UTC−12, so a call is never closed while it may be open. */
const endOfDayAnywhere = (day: string): Date | null => {
  if (!DAY.test(day)) return null;
  const instant = new Date(`${day}T23:59:59-12:00`);
  return Number.isNaN(instant.getTime()) ? null : instant;
};

/**
 * A deadline published as a local day and, sometimes, a local hour.
 * - Day, hour and a known zone: exact instant (`datetime`).
 * - Hour with no resolvable zone: the day is kept and the hour stays as text; nothing is invented (`date`).
 * - Day only, with a zone: the last second of that day in the zone (`date`).
 */
export const localDeadline = (input: {
  day: string | null;
  clock: string | null;
  timeZone: string | null;
}): InternationalDeadline | null => {
  const day = input.day?.trim() ?? "";
  if (!DAY.test(day)) return null;
  const clock = input.clock?.trim() ?? "";
  const hasClock = CLOCK.test(clock);
  const timeZone =
    input.timeZone && isTimeZone(input.timeZone) ? input.timeZone : null;
  const original = hasClock ? `${day} ${clock}` : day;
  if (hasClock && timeZone) {
    const at = zonedTimeToUtc(day, clock, timeZone);
    if (at) return { at, precision: "datetime", timeZone, original };
  }
  const at = timeZone
    ? zonedTimeToUtc(day, "23:59:59", timeZone)
    : endOfDayAnywhere(day);
  return at ? { at, precision: "date", timeZone, original } : null;
};

/** `2026-10-27T00:00:00Z` or `2026-10-27T00:00:00.000+0000` to `2026-10-27`, read as written (no zone shift). */
export const dayOfTimestamp = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(value.trim());
  return match ? match[1]! : null;
};

/** `HH:MM[:SS]` of a timestamp, read as written. */
export const clockOfTimestamp = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = /[T ](\d{2}:\d{2}(?::\d{2})?)/.exec(value.trim());
  return match ? match[1]! : null;
};
