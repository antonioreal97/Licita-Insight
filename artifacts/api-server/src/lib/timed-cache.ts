export type TimedCache<T> = {
  get(): Promise<T>;
  clear(): void;
};

export type TimedCacheOptions = {
  /** How long a loaded value is served before the next caller reloads it. */
  ttlMs: number;
  /** After a failed reload, how long the previous value keeps being served before trying again. */
  retryMs: number;
  now?: () => number;
};

/**
 * One value kept in memory. Callers that arrive while it loads share that single load, and a failed reload keeps
 * serving the previous value, so a slow or unavailable source is asked at most once per window.
 */
export const createTimedCache = <T>(load: () => Promise<T>, options: TimedCacheOptions): TimedCache<T> => {
  const now = options.now ?? Date.now;
  let entry: { value: T; expiresAt: number } | undefined;
  let pending: Promise<T> | undefined;

  const reload = async (): Promise<T> => {
    try {
      const value = await load();
      entry = { value, expiresAt: now() + options.ttlMs };
      return value;
    } catch (error) {
      if (!entry) throw error;
      entry.expiresAt = now() + options.retryMs;
      return entry.value;
    } finally {
      pending = undefined;
    }
  };

  return {
    get() {
      if (entry && now() < entry.expiresAt) return Promise.resolve(entry.value);
      pending ??= reload();
      return pending;
    },
    clear() {
      entry = undefined;
    },
  };
};
