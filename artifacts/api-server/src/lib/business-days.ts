/** Fixed national holidays (MM-DD), Lei 662/1949, 6.802/1980 and 14.759/2023. */
const FIXED_NATIONAL_HOLIDAYS = new Set([
  "01-01",
  "04-21",
  "05-01",
  "09-07",
  "10-12",
  "11-02",
  "11-15",
  "11-20",
  "12-25",
]);

const DAY_MS = 86_400_000;

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

/** Gregorian Easter Sunday (Meeus/Jones/Butcher), as YYYY-MM-DD. */
const easterSunday = (year: number): string => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const goodFriday = (year: number): string =>
  isoDate(new Date(Date.parse(`${easterSunday(year)}T00:00:00Z`) - 2 * DAY_MS));

/**
 * Weekday that is not a national holiday. State and municipal holidays are not known here,
 * so callers must present the result as an estimate.
 */
export const isBusinessDay = (date: string): boolean => {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = day.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  if (FIXED_NATIONAL_HOLIDAYS.has(date.slice(5))) return false;
  return date !== goodFriday(day.getUTCFullYear());
};

/** The `count`-th business day strictly before `date` (YYYY-MM-DD). */
export const businessDaysBefore = (date: string, count: number): string => {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error(`count must be a positive integer, got ${count}`);
  }
  let cursor = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(cursor)) throw new Error(`Invalid date: ${date}`);
  let found = 0;
  while (found < count) {
    cursor -= DAY_MS;
    if (isBusinessDay(isoDate(new Date(cursor)))) found += 1;
  }
  return isoDate(new Date(cursor));
};
