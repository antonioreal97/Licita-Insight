const DEFAULT_WINDOW_HOURS = 24;
const HOUR_MS = 60 * 60 * 1_000;

export type Clock = () => Date;

export const parseNewTenderWindowHours = (
  value: string | undefined,
): number => {
  if (value === undefined || value.trim() === "") return DEFAULT_WINDOW_HOURS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("NEW_TENDER_WINDOW_HOURS must be a positive number");
  }
  return parsed;
};

export const NEW_TENDER_WINDOW_HOURS = parseNewTenderWindowHours(
  process.env.NEW_TENDER_WINDOW_HOURS,
);

export const newTenderCutoff = (
  now: Date,
  windowHours = NEW_TENDER_WINDOW_HOURS,
): Date => new Date(now.getTime() - windowHours * HOUR_MS);

/**
 * A tender remains new until (but not including) the exact window boundary.
 * Future timestamps are rejected so clock skew cannot create a permanent badge.
 */
export const isNewTender = (
  firstSeenAt: Date,
  now: Date,
  windowHours = NEW_TENDER_WINDOW_HOURS,
): boolean =>
  firstSeenAt.getTime() <= now.getTime() &&
  firstSeenAt.getTime() > newTenderCutoff(now, windowHours).getTime();

export const createNewTenderPolicy = ({
  clock = () => new Date(),
  windowHours = NEW_TENDER_WINDOW_HOURS,
}: {
  clock?: Clock;
  windowHours?: number;
} = {}) => ({
  snapshot(firstSeenAt: Date) {
    const now = clock();
    return {
      firstSeenAt,
      isNew: isNewTender(firstSeenAt, now, windowHours),
    };
  },
  cutoff() {
    return newTenderCutoff(clock(), windowHours);
  },
});
