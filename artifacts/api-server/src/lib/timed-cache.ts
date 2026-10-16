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
  /** Serve the previous value when a refresh fails. Defaults to true. */
  staleOnError?: boolean;
  /** Serve an expired value for this window while one caller refreshes it in the background. Defaults to zero. */
  staleWhileRevalidateMs?: number;
};

export type KeyedTimedCache<K, V> = {
  get(key: K, load: () => Promise<V>): Promise<V>;
  clear(key?: K): void;
  size(): number;
};

export type KeyedTimedCacheOptions = TimedCacheOptions & {
  /** Least-recently-used keys beyond this bound are discarded. */
  maxEntries: number;
};

/**
 * One value kept in memory. Callers that arrive while it loads share that single load, and a failed reload keeps
 * serving the previous value, so a slow or unavailable source is asked at most once per window.
 */
export const createTimedCache = <T>(
  load: () => Promise<T>,
  options: TimedCacheOptions,
): TimedCache<T> => {
  const now = options.now ?? Date.now;
  let entry: { value: T; expiresAt: number } | undefined;
  let pending: Promise<T> | undefined;
  let generation = 0;

  const reload = (): Promise<T> => {
    const reloadGeneration = generation;
    const promise = load()
      .then((value) => {
        if (generation === reloadGeneration) {
          entry = { value, expiresAt: now() + options.ttlMs };
        }
        return value;
      })
      .catch((error: unknown) => {
        if (!entry || options.staleOnError === false) throw error;
        entry.expiresAt = now() + options.retryMs;
        return entry.value;
      })
      .finally(() => {
        if (pending === promise) pending = undefined;
      });
    pending = promise;
    return promise;
  };

  return {
    get() {
      if (entry && now() < entry.expiresAt) return Promise.resolve(entry.value);
      if (
        entry &&
        (options.staleWhileRevalidateMs ?? 0) > 0 &&
        now() < entry.expiresAt + (options.staleWhileRevalidateMs ?? 0)
      ) {
        if (!pending) void reload().catch(() => undefined);
        return Promise.resolve(entry.value);
      }
      pending ??= reload();
      return pending;
    },
    clear() {
      generation += 1;
      entry = undefined;
      pending = undefined;
    },
  };
};

/**
 * A bounded collection of independent timed values. The loader belongs to the first caller for a key until that
 * key is cleared or evicted; concurrent callers for the same key share its pending load.
 */
export const createKeyedTimedCache = <K, V>(
  options: KeyedTimedCacheOptions,
): KeyedTimedCache<K, V> => {
  if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries < 1) {
    throw new Error("maxEntries must be a positive integer");
  }

  const entries = new Map<K, TimedCache<V>>();
  const touch = (key: K, cache: TimedCache<V>): void => {
    entries.delete(key);
    entries.set(key, cache);
  };

  return {
    get(key, load) {
      let cache = entries.get(key);
      if (cache) {
        touch(key, cache);
        return cache.get();
      }

      while (entries.size >= options.maxEntries) {
        const oldest = entries.keys().next().value as K | undefined;
        if (oldest === undefined) break;
        entries.get(oldest)?.clear();
        entries.delete(oldest);
      }
      cache = createTimedCache(load, options);
      entries.set(key, cache);
      return cache.get();
    },
    clear(key) {
      if (key !== undefined) {
        entries.get(key)?.clear();
        entries.delete(key);
        return;
      }
      for (const cache of entries.values()) cache.clear();
      entries.clear();
    },
    size: () => entries.size,
  };
};
