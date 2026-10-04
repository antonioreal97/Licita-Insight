import { createServer, type Server } from "node:http";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { RequestHandler } from "express";
import { logger } from "./lib/logger";

const counters = new Map<string, number>();
const gauges = new Map<string, number>();
const histograms = new Map<string, number[]>();
const latencyBuckets = [0.01, 0.025, 0.05, 0.1, 0.3, 0.5, 1, 2.5, 5, 10, Infinity];
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();

const labels = (values: Record<string, string>): string =>
  `{${Object.entries(values).map(([key, value]) => `${key}="${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`;
const key = (name: string, values: Record<string, string> = {}): string => `${name}${Object.keys(values).length ? labels(values) : ""}`;

export const incrementMetric = (name: string, values: Record<string, string> = {}, amount = 1): void => {
  const metric = key(name, values); counters.set(metric, (counters.get(metric) ?? 0) + amount);
};
export const setMetric = (name: string, value: number, values: Record<string, string> = {}): void => {
  gauges.set(key(name, values), value);
};
export const observeMetric = (name: string, value: number, values: Record<string, string> = {}): void => {
  const metric = key(name, values); const samples = histograms.get(metric) ?? [];
  samples.push(value); if (samples.length > 10_000) samples.splice(0, samples.length - 10_000); histograms.set(metric, samples);
};

const routePattern = (req: Parameters<RequestHandler>[0]): string => {
  const path = typeof req.route?.path === "string" ? req.route.path : "unmatched";
  return path === "unmatched" ? path : `${req.baseUrl || ""}${path}`.replace(/\/+/g, "/");
};

export const httpMetricsMiddleware: RequestHandler = (req, res, next) => {
  const started = process.hrtime.bigint();
  let finished = false;
  setMetric("licitai_http_requests_in_flight", (gauges.get("licitai_http_requests_in_flight") ?? 0) + 1);
  const finish = () => {
    if (finished) return;
    finished = true;
    const current = gauges.get("licitai_http_requests_in_flight") ?? 1;
    setMetric("licitai_http_requests_in_flight", Math.max(0, current - 1));
    observeMetric("licitai_http_request_duration_seconds", Number(process.hrtime.bigint() - started) / 1e9, {
      method: req.method, route: routePattern(req), status_class: `${Math.floor(res.statusCode / 100)}xx`,
    });
  };
  res.once("finish", finish); res.once("close", finish); next();
};

const dynamicMetrics = async (): Promise<void> => {
  // Keep the counter-only API safe for infrastructure middleware to import before
  // DATABASE_URL exists. Database and AI runtime dependencies are needed only when
  // the private metrics endpoint is actually scraped.
  const [{ pool }, { aiBudgetGuard }, { jevScheduler }] = await Promise.all([
    import("@workspace/db"),
    import("./ai/ai-budget"),
    import("./ai/jev-scheduler"),
  ]);
  setMetric("licitai_postgres_pool_connections", pool.totalCount, { state: "total" });
  setMetric("licitai_postgres_pool_connections", pool.idleCount, { state: "idle" });
  setMetric("licitai_postgres_pool_connections", pool.waitingCount, { state: "waiting" });
  setMetric("licitai_process_resident_memory_bytes", process.memoryUsage().rss);
  setMetric("licitai_nodejs_event_loop_lag_seconds", Number(eventLoop.mean || 0) / 1e9);
  const queue = await pool.query<{ kind: string; status: string; count: string }>(
    "select kind,status,count(*)::text count from ai_jobs group by kind,status",
  ).catch(() => ({ rows: [] }));
  for (const row of queue.rows) setMetric("licitai_ai_jobs", Number(row.count), { kind: row.kind, status: row.status });
  const ages = await pool.query<{ kind: string; lane: string; age: string }>(
    `select kind,lane,extract(epoch from now()-min(created_at))::text age from ai_jobs
     where status='queued' group by kind,lane`,
  ).catch(() => ({ rows: [] }));
  for (const row of ages.rows) setMetric("licitai_ai_job_oldest_age_seconds", Number(row.age), { kind: row.kind, lane: row.lane });
  const audits = await pool.query<{ job_key: string; status: string; count: string }>(
    "select job_key,status,count(*)::text count from job_run_audit where started_at >= now()-interval '24 hours' group by job_key,status",
  ).catch(() => ({ rows: [] }));
  for (const row of audits.rows) setMetric("licitai_scheduled_job_results_24h", Number(row.count), { job: row.job_key, status: row.status });
  const scheduler = jevScheduler.snapshot();
  for (const lane of ["interactive", "batch"] as const) {
    setMetric("licitai_jev_in_flight", scheduler.inFlight[lane], { lane });
    setMetric("licitai_jev_queue_depth", scheduler.queued[lane], { lane });
    setMetric("licitai_jev_wait_p95_milliseconds", scheduler.waitP95Ms[lane], { lane });
    setMetric("licitai_jev_calls_total", scheduler.calls[lane], { lane });
    setMetric("licitai_jev_limited_total", scheduler.limited[lane], { lane });
  }
  const budget = await aiBudgetGuard.read();
  for (const feature of ["ask", "fit", "sheet"] as const) setMetric("licitai_ai_daily_cost_usd", budget[feature], { feature });
  setMetric("licitai_ai_budget_ratio", Math.min(1, budget.ratio));
  setMetric("licitai_ai_budget_paused", budget.paused ? 1 : 0);
};

export async function metricsText(): Promise<string> {
  await dynamicMetrics();
  const lines = ["# HELP licitai_build_info Abriu lá process information", "# TYPE licitai_build_info gauge", `licitai_build_info${labels({ role: process.env.APP_ROLE?.trim() || "all" })} 1`];
  for (const [metric, value] of counters) lines.push(`${metric} ${value}`);
  for (const [metric, value] of gauges) lines.push(`${metric} ${Number.isFinite(value) ? value : 0}`);
  for (const [metric, values] of histograms) {
    const match = metric.match(/^([^\{]+)(\{.*\})?$/)!;
    const name = match[1]!; const baseLabels = match[2]?.slice(1, -1);
    for (const bucket of latencyBuckets) {
      const bucketLabels = [baseLabels, `le="${bucket === Infinity ? "+Inf" : bucket}"`].filter(Boolean).join(",");
      lines.push(`${name}_bucket{${bucketLabels}} ${values.filter((value) => value <= bucket).length}`);
    }
    lines.push(`${name}_sum${match[2] ?? ""} ${values.reduce((sum, value) => sum + value, 0)}`);
    lines.push(`${name}_count${match[2] ?? ""} ${values.length}`);
  }
  return `${lines.join("\n")}\n`;
}

export function startMetricsServer(port: number): Server {
  const server = createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/metrics") { res.writeHead(404).end(); return; }
    void metricsText().then((body) => {
      res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" }); res.end(body);
    }).catch((error) => { logger.error({ err: error }, "Metrics collection failed"); res.writeHead(500).end(); });
  });
  server.listen(port, "0.0.0.0", () => logger.info({ port }, "Internal metrics server listening"));
  return server;
}
