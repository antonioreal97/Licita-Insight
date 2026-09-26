import { logger } from "../lib/logger";

export type JevLane = "interactive" | "batch";

export class JevQueueTimeoutError extends Error {
  constructor() {
    super("Interactive Jev request timed out while queued");
    this.name = "JevQueueTimeoutError";
  }
}

export type JevSchedulerConfig = {
  maxConcurrency: number;
  batchMaxShare: number;
  rpmLimit: number;
  interactiveReserveRpm: number;
  backoffMs: number;
  interactiveQueueTimeoutMs: number;
  metricsIntervalMs: number;
};

const integer = (name: string, fallback: number, minimum = 1): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${name} must be an integer >= ${minimum}`);
  return value;
};

const share = (): number => {
  const raw = process.env.JEV_BATCH_MAX_SHARE?.trim();
  if (!raw) return 0.5;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error("JEV_BATCH_MAX_SHARE must be > 0 and <= 1");
  return value;
};

export const jevSchedulerConfig = (): JevSchedulerConfig => {
  const rpmLimit = integer("JEV_RPM_LIMIT", 900);
  const interactiveReserveRpm = integer("JEV_INTERACTIVE_RESERVE_RPM", 300, 0);
  if (interactiveReserveRpm >= rpmLimit) throw new Error("JEV_INTERACTIVE_RESERVE_RPM must be lower than JEV_RPM_LIMIT");
  return {
    maxConcurrency: integer("JEV_MAX_CONCURRENCY", 16),
    batchMaxShare: share(),
    rpmLimit,
    interactiveReserveRpm,
    backoffMs: integer("JEV_BACKOFF_MS", 30_000),
    interactiveQueueTimeoutMs: integer("JEV_INTERACTIVE_QUEUE_TIMEOUT_MS", 5_000),
    metricsIntervalMs: 60_000,
  };
};

type QueueEntry<T = unknown> = {
  lane: JevLane;
  queuedAt: number;
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  timeout?: NodeJS.Timeout;
};

type LaneStats = { waits: number[]; calls: number; limited: number };

export class JevScheduler {
  private readonly queues: Record<JevLane, QueueEntry[]> = { interactive: [], batch: [] };
  private readonly inFlight: Record<JevLane, number> = { interactive: 0, batch: 0 };
  private readonly stats: Record<JevLane, LaneStats> = {
    interactive: { waits: [], calls: 0, limited: 0 },
    batch: { waits: [], calls: 0, limited: 0 },
  };
  private tokens: number;
  private lastRefill = Date.now();
  private batchPausedUntil = 0;
  private batchBudgetPaused = false;
  private drainTimer?: NodeJS.Timeout;
  private readonly metricsTimer: NodeJS.Timeout;

  constructor(readonly config: JevSchedulerConfig = jevSchedulerConfig()) {
    this.tokens = config.rpmLimit;
    this.metricsTimer = setInterval(() => this.logMetrics(), config.metricsIntervalMs);
    this.metricsTimer.unref();
  }

  schedule<T>(lane: JevLane, operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry<T> = { lane, queuedAt: Date.now(), operation, resolve, reject };
      if (lane === "interactive") {
        entry.timeout = setTimeout(() => {
          const position = this.queues.interactive.indexOf(entry as QueueEntry);
          if (position < 0) return;
          this.queues.interactive.splice(position, 1);
          reject(new JevQueueTimeoutError());
        }, this.config.interactiveQueueTimeoutMs);
        entry.timeout.unref();
      }
      this.queues[lane].push(entry as QueueEntry);
      this.drain();
    });
  }

  pauseBatch(retryAfterMs?: number): void {
    const delay = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : this.config.backoffMs;
    this.batchPausedUntil = Math.max(this.batchPausedUntil, Date.now() + delay);
    this.armDrain(delay);
  }

  recordRateLimit(lane: JevLane, retryAfterMs?: number): void {
    this.stats[lane].limited += 1;
    if (lane === "batch") this.pauseBatch(retryAfterMs);
  }

  setBatchBudgetPaused(paused: boolean): void {
    if (this.batchBudgetPaused === paused) return;
    this.batchBudgetPaused = paused;
    if (!paused) this.drain();
  }

  snapshot() {
    const waitP95 = (lane: JevLane): number => {
      const waits = [...this.stats[lane].waits].sort((a, b) => a - b);
      return waits[Math.max(0, Math.ceil(waits.length * 0.95) - 1)] ?? 0;
    };
    return {
      inFlight: { ...this.inFlight },
      queued: { interactive: this.queues.interactive.length, batch: this.queues.batch.length },
      calls: { interactive: this.stats.interactive.calls, batch: this.stats.batch.calls },
      limited: { interactive: this.stats.interactive.limited, batch: this.stats.batch.limited },
      waitP95Ms: { interactive: waitP95("interactive"), batch: waitP95("batch") },
      batchPausedUntil: this.batchPausedUntil,
      batchBudgetPaused: this.batchBudgetPaused,
    };
  }

  dispose(): void {
    clearInterval(this.metricsTimer);
    if (this.drainTimer) clearTimeout(this.drainTimer);
  }

  private refill(): void {
    const now = Date.now();
    const gained = (now - this.lastRefill) * this.config.rpmLimit / 60_000;
    this.tokens = Math.min(this.config.rpmLimit, this.tokens + gained);
    this.lastRefill = now;
  }

  private canStart(lane: JevLane): boolean {
    this.refill();
    if (this.inFlight.interactive + this.inFlight.batch >= this.config.maxConcurrency) return false;
    if (this.tokens < 1) return false;
    if (lane === "batch") {
      const batchLimit = Math.max(1, Math.floor(this.config.maxConcurrency * this.config.batchMaxShare));
      if (this.batchBudgetPaused || this.inFlight.batch >= batchLimit || Date.now() < this.batchPausedUntil) return false;
      if (this.tokens - 1 < this.config.interactiveReserveRpm) return false;
    }
    return true;
  }

  private drain = (): void => {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = undefined;
    }
    let started = false;
    while (this.queues.interactive.length > 0 && this.canStart("interactive")) {
      this.start(this.queues.interactive.shift()!);
      started = true;
    }
    while (this.queues.batch.length > 0 && this.canStart("batch")) {
      this.start(this.queues.batch.shift()!);
      started = true;
      while (this.queues.interactive.length > 0 && this.canStart("interactive")) {
        this.start(this.queues.interactive.shift()!);
      }
    }
    if (!started && (this.queues.interactive.length > 0 || this.queues.batch.length > 0)) {
      const tokenDelay = this.tokens < 1 ? Math.ceil(60_000 / this.config.rpmLimit) : 10;
      const pauseDelay = this.queues.interactive.length === 0 && Date.now() < this.batchPausedUntil
        ? this.batchPausedUntil - Date.now() : tokenDelay;
      if (!this.batchBudgetPaused || this.queues.interactive.length > 0) this.armDrain(Math.max(1, pauseDelay));
    }
  };

  private start(entry: QueueEntry): void {
    if (entry.timeout) clearTimeout(entry.timeout);
    this.tokens -= 1;
    this.inFlight[entry.lane] += 1;
    this.stats[entry.lane].calls += 1;
    const waits = this.stats[entry.lane].waits;
    waits.push(Date.now() - entry.queuedAt);
    if (waits.length > 5_000) waits.splice(0, waits.length - 5_000);
    void entry.operation().then(entry.resolve, entry.reject).finally(() => {
      this.inFlight[entry.lane] -= 1;
      this.drain();
    });
  }

  private armDrain(delay: number): void {
    if (this.drainTimer) return;
    this.drainTimer = setTimeout(this.drain, delay);
    this.drainTimer.unref();
  }

  private logMetrics(): void {
    const lane = (name: JevLane) => {
      const waits = [...this.stats[name].waits].sort((a, b) => a - b);
      return {
        inFlight: this.inFlight[name], queued: this.queues[name].length,
        waitP95Ms: waits[Math.max(0, Math.ceil(waits.length * 0.95) - 1)] ?? 0,
        calls: this.stats[name].calls, rateLimited: this.stats[name].limited,
      };
    };
    logger.info({ interactive: lane("interactive"), batch: lane("batch") }, "Jev scheduler metrics");
  }
}

export const jevScheduler = new JevScheduler();

export const retryAfterMs = (response: Response): number | undefined => {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
};
