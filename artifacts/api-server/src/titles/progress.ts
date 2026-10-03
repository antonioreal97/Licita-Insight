const clock = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return "--:--:--";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  return [hours, minutes, total % 60].map((part) => String(part).padStart(2, "0")).join(":");
};

export type Progress = { advance(count: number, note?: string): void; readonly done: number };

/** Progress lines with rate and ETA on stderr, so stdout keeps only the final summary. */
export const createProgress = (
  label: string,
  total: number,
  write: (line: string) => void = (line) => process.stderr.write(line),
): Progress => {
  const startedAt = Date.now();
  let done = 0;
  return {
    advance(count, note) {
      done += count;
      const elapsed = (Date.now() - startedAt) / 1_000;
      const rate = elapsed > 0 ? done / elapsed : 0;
      const eta = rate > 0 ? (total - done) / rate : Number.POSITIVE_INFINITY;
      const percent = total > 0 ? ((done / total) * 100).toFixed(1) : "100.0";
      write(`[${label}] ${done}/${total} (${percent}%) ${rate.toFixed(2)}/s ETA ${clock(eta)}${note ? ` ${note}` : ""}\n`);
    },
    get done() {
      return done;
    },
  };
};

export type StopSignal = { readonly stopped: boolean };

/** First Ctrl-C finishes the current batch and stops; a second one exits at once. */
export const installStopSignal = (label: string): StopSignal & { dispose(): void } => {
  let stopped = false;
  const onSignal = () => {
    if (stopped) process.exit(130);
    stopped = true;
    process.stderr.write(`[${label}] parando depois do lote atual (Ctrl-C de novo encerra na hora)\n`);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  return {
    get stopped() {
      return stopped;
    },
    dispose() {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    },
  };
};

export const NEVER_STOP: StopSignal = { stopped: false };
