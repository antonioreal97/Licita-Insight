const IN_PROGRESS_MAX_RETRIES = 6;
const IN_PROGRESS_RETRY_MARGIN_MS = 60_000;

/**
 * A start that finds another run still marked `running` is retried once that run's heartbeat can expire. The
 * collector abandons expired runs before starting, so a run orphaned by a restart stops blocking collection after
 * the stale window instead of until the next daily slot.
 */
export const inProgressRetry = (
  staleAfterMs: number,
  run: (reason: string) => Promise<unknown>,
) => {
  let timer: NodeJS.Timeout | undefined;
  let attempts = 0;
  return {
    schedule(): boolean {
      if (timer || attempts >= IN_PROGRESS_MAX_RETRIES) return false;
      attempts += 1;
      timer = setTimeout(() => {
        timer = undefined;
        void run("in_progress_retry");
      }, staleAfterMs + IN_PROGRESS_RETRY_MARGIN_MS);
      timer.unref();
      return true;
    },
    reset(): void {
      attempts = 0;
    },
    stop(): void {
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
};
