import { logger } from "../lib/logger";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { jevScheduler } from "./jev-scheduler";

export type AiBudgetLevel = "disabled" | "ok" | "warn" | "paused";
export type AiDailySpend = { ask: number; fit: number; sheet: number; total: number };
export type AiBudgetState = AiDailySpend & {
  day: string;
  budgetUsd: number;
  ratio: number;
  level: AiBudgetLevel;
  paused: boolean;
};

const decimalEnv = (name: string, fallback: number, minimum: number, maximum = Infinity): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
};

export const aiBudgetConfig = () => ({
  budgetUsd: decimalEnv("AI_DAILY_BUDGET_USD", 10, 0),
  warnRatio: decimalEnv("AI_DAILY_BUDGET_WARN_RATIO", 0.8, 0, 1),
  cacheMs: 30_000,
});

export class AiBudgetGuard {
  private cached?: { state: AiBudgetState; readAt: number };
  private lastLevel?: AiBudgetLevel;

  constructor(
    private readonly loadSpend: (day: string) => Promise<AiDailySpend>,
    private readonly now: () => Date = () => new Date(),
    private readonly config: () => ReturnType<typeof aiBudgetConfig> = aiBudgetConfig,
  ) {}

  async read(force = false): Promise<AiBudgetState> {
    const now = this.now();
    const day = dateInSaoPaulo(now);
    const config = this.config();
    if (!force && this.cached?.state.day === day && now.getTime() - this.cached.readAt < config.cacheMs) {
      return this.cached.state;
    }
    const spend = await this.loadSpend(day);
    const ratio = config.budgetUsd === 0 ? 0 : spend.total / config.budgetUsd;
    const level: AiBudgetLevel = config.budgetUsd === 0
      ? "disabled"
      : ratio >= 1 ? "paused" : ratio >= config.warnRatio ? "warn" : "ok";
    const state: AiBudgetState = { ...spend, day, budgetUsd: config.budgetUsd, ratio, level, paused: level === "paused" };
    this.cached = { state, readAt: now.getTime() };
    if (level !== this.lastLevel) {
      logger.warn({ day, level, costUsd: spend.total, budgetUsd: config.budgetUsd, ratio }, "AI daily budget state changed");
      this.lastLevel = level;
    }
    return state;
  }
}

export async function loadAiDailySpend(day: string): Promise<AiDailySpend> {
  const { pool } = await import("@workspace/db");
  const result = await pool.query<{ ask: string; fit: string; sheet: string; sheet_summary: string }>(
    `select
       coalesce((select sum(estimated_cost_usd) from ai_daily_usage where quota_day = $1), 0)::text as ask,
       coalesce((select sum(estimated_cost_usd) from ai_fit_daily_usage where quota_day = $1), 0)::text as fit,
       coalesce((select sum(estimated_cost_usd) from ai_sheet_daily_usage where quota_day = $1), 0)::text as sheet,
       coalesce((select sum(summary_estimated_cost_usd) from tender_ai_sheets
                 where (summary_generated_at at time zone 'America/Sao_Paulo')::date = $1::date), 0)::text as sheet_summary`,
    [day],
  );
  const row = result.rows[0]!;
  const ask = Number(row.ask);
  const fit = Number(row.fit);
  const sheet = Number(row.sheet) + Number(row.sheet_summary);
  return { ask, fit, sheet, total: ask + fit + sheet };
}

export const aiBudgetGuard = new AiBudgetGuard(loadAiDailySpend);

export async function refreshAiBudgetState(force = false): Promise<AiBudgetState> {
  const state = await aiBudgetGuard.read(force);
  jevScheduler.setBatchBudgetPaused(state.paused);
  return state;
}

export async function isAiBatchBudgetPaused(): Promise<boolean> {
  return (await refreshAiBudgetState()).paused;
}
