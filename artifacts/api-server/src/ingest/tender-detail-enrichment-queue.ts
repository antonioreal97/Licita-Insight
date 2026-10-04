type EnrichmentQueueOptions = {
  concurrency?: number;
  maxQueued?: number;
  retryAfterMs?: number;
  now?: () => number;
  onError?: (id: string, error: unknown) => void;
};

/** Keeps slow PNCP calls off the request path and bounds work when many new tenders are opened. */
export class TenderDetailEnrichmentQueue {
  private readonly waiting: string[] = [];
  private readonly scheduled = new Set<string>();
  private readonly retryAfter = new Map<string, number>();
  private running = 0;

  constructor(
    private readonly worker: (id: string) => Promise<void>,
    private readonly options: EnrichmentQueueOptions = {},
  ) {}

  schedule(id: string): void {
    const now = (this.options.now ?? Date.now)();
    if (this.scheduled.has(id) || (this.retryAfter.get(id) ?? 0) > now) return;
    if (this.waiting.length >= (this.options.maxQueued ?? 100)) return;
    this.retryAfter.delete(id);
    this.scheduled.add(id);
    this.waiting.push(id);
    this.drain();
  }

  private drain(): void {
    while (this.running < (this.options.concurrency ?? 2) && this.waiting.length > 0) {
      const id = this.waiting.shift()!;
      this.running += 1;
      void Promise.resolve()
        .then(() => this.worker(id))
        .catch((error: unknown) => {
          this.retryAfter.set(id, (this.options.now ?? Date.now)() + (this.options.retryAfterMs ?? 60_000));
          if (this.retryAfter.size > 1_000) this.retryAfter.delete(this.retryAfter.keys().next().value!);
          this.options.onError?.(id, error);
        })
        .finally(() => {
          this.running -= 1;
          this.scheduled.delete(id);
          this.drain();
        });
    }
  }
}
