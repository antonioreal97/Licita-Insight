import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import autocannon, { type Result } from "autocannon";
import pg from "pg";
import { scaleDatabaseUrl } from "./scale-db";

const { Client } = pg;
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const label =
  arg("--label") ?? `run-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
if (!/^[a-zA-Z0-9_-]+$/.test(label))
  throw new Error("--label contains unsupported characters");
const duration = Number(
  arg("--duration") ?? process.env.SCALE_DURATION_SECONDS ?? "5",
);
const concurrencies = (arg("--concurrency") ?? "10,50,100")
  .split(",")
  .map(Number);
const selectedScenarios = new Set(
  (arg("--scenarios") ?? "").split(",").filter(Boolean),
);
const onlyBurst = process.argv.includes("--only-burst");
const skipBurst = process.argv.includes("--skip-burst");
if (!Number.isFinite(duration) || duration <= 0)
  throw new Error("--duration must be positive");
if (concurrencies.some((value) => !Number.isSafeInteger(value) || value < 1)) {
  throw new Error("--concurrency must contain positive integers");
}
if (onlyBurst && skipBurst)
  throw new Error("--only-burst and --skip-burst cannot be combined");
const port = Number(process.env.SCALE_API_PORT ?? "3107");
const baseUrl = `http://127.0.0.1:${port}`;
const outputDir = path.join(repoRoot, "docs/reviews");
const metricsPath = path.join(outputDir, `.scale-metrics-${process.pid}.json`);

type Scenario = {
  name: string;
  path: string;
  explain?: { sql: string; values: unknown[] };
};
const rankedSql = (where: string, order: string, offset = 0): string => `
  select id from tenders where ${where} order by ${order} limit 20 offset ${offset}`;
const allScenarios: Scenario[] = [
  {
    name: "busca-comum",
    path: "/api/v1/tenders/search?q=contratacao&facets=false",
    explain: {
      sql: rankedSql(
        "search_text like $1",
        "case when title_norm like $1 then 5 when object_norm like $1 then 4 when items_norm like $1 then 3 when organization_norm like $1 then 2 when other_norm like $1 then 1 else 0 end desc, published_at desc nulls last, id",
      ),
      values: ["%contratacao%"],
    },
  },
  {
    name: "busca-media",
    path: "/api/v1/tenders/search?q=tecnologia&facets=false",
    explain: {
      sql: rankedSql("search_text like $1", "published_at desc nulls last, id"),
      values: ["%tecnologia%"],
    },
  },
  {
    name: "busca-rara",
    path: "/api/v1/tenders/search?q=ultrassom&facets=false",
    explain: {
      sql: rankedSql("search_text like $1", "published_at desc nulls last, id"),
      values: ["%ultrassom%"],
    },
  },
  {
    name: "busca-multitermo",
    path: "/api/v1/tenders/search?q=tecnologia%20integracao%20especializada&facets=false",
    explain: {
      sql: rankedSql(
        "search_text like $1 and search_text like $2 and search_text like $3",
        "published_at desc nulls last, id",
      ),
      values: ["%tecnologia%", "%integracao%", "%especializada%"],
    },
  },
  {
    name: "filtros",
    path: "/api/v1/tenders/search?q=tecnologia&state=SP&status=open&modality=pregao_eletronico&publishedFrom=2025-01-01&facets=false",
    explain: {
      sql: rankedSql(
        "search_text like $1 and state = 'SP' and status = 'open' and modality = 'pregao_eletronico' and published_at >= timestamptz '2025-01-01 03:00:00+00'",
        "published_at desc nulls last, id",
      ),
      values: ["%tecnologia%"],
    },
  },
  {
    name: "pagina-profunda",
    path: "/api/v1/tenders/search?q=contratacao&page=250&pageSize=20&facets=false",
    explain: {
      sql: rankedSql(
        "search_text like $1",
        "published_at desc nulls last, id",
        4980,
      ),
      values: ["%contratacao%"],
    },
  },
  { name: "sugestoes", path: "/api/v1/search/suggestions?q=orga&limit=8" },
  { name: "detalhe", path: "/api/v1/tenders/SYN-000000001" },
];
const scenarios = onlyBurst
  ? []
  : selectedScenarios.size === 0
    ? allScenarios
    : allScenarios.filter((scenario) => selectedScenarios.has(scenario.name));
if (
  !onlyBurst &&
  selectedScenarios.size > 0 &&
  scenarios.length !== selectedScenarios.size
) {
  const known = new Set(allScenarios.map((scenario) => scenario.name));
  const unknown = [...selectedScenarios].filter((name) => !known.has(name));
  throw new Error(`Unknown scenarios: ${unknown.join(", ")}`);
}

type MeasuredResult = Result & { measuredP95: number | null };
const percentile = (values: number[], ratio: number): number | null => {
  if (values.length === 0) return null;
  values.sort((left, right) => left - right);
  return (
    values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)] ??
    0
  );
};
const runCannon = (
  url: string,
  concurrency: number,
  headers?: Record<string, string>,
): Promise<MeasuredResult> =>
  new Promise((resolve, reject) => {
    const samples: number[] = [];
    const instance = autocannon(
      { url, connections: concurrency, duration, timeout: 30, headers },
      (error, result) => {
        if (error) reject(error);
        else
          resolve(
            Object.assign(result, { measuredP95: percentile(samples, 0.95) }),
          );
      },
    );
    instance.on("response", (_client, _statusCode, _bytes, responseTime) =>
      samples.push(responseTime),
    );
  });

const serverCwd =
  process.env.SCALE_SERVER_CWD ?? path.join(repoRoot, "artifacts/api-server");
const serverScript =
  process.env.SCALE_SERVER_SCRIPT ?? "scripts/scale-server.ts";
const child = spawn(process.execPath, ["--import", "tsx", serverScript], {
  cwd: serverCwd,
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: scaleDatabaseUrl(),
    AUTH_DEV_LOGIN: "false",
    PNCP_DAILY_COLLECT: "false",
    CULTURE_DAILY_COLLECT: "false",
    EMAIL_JOBS_ENABLED: "false",
    SCALE_METRICS_PATH: metricsPath,
    TRUST_PROXY: "true",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
let stdout = "";
const appendTail = (current: string, chunk: unknown): string =>
  `${current}${String(chunk)}`.slice(-20_000);
child.stderr?.on("data", (chunk) => {
  stderr = appendTail(stderr, chunk);
});
await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error(`Scale API did not start\n${stderr}`)),
    30_000,
  );
  child.stdout?.on("data", (chunk) => {
    const text = String(chunk);
    stdout = appendTail(stdout, text);
    if (text.includes("SCALE_READY")) {
      clearTimeout(timer);
      resolve();
    }
  });
  child.once("exit", (code) =>
    reject(new Error(`Scale API exited with ${code}\n${stderr}`)),
  );
});

const db = new Client({ connectionString: scaleDatabaseUrl() });
await db.connect();
const rows = Number(
  (await db.query("select count(*)::int rows from tenders")).rows[0]?.rows ?? 0,
);
const postgresSettings = Object.fromEntries(
  (
    await db.query<{ name: string; setting: string; unit: string | null }>(`
  select name, setting, unit from pg_settings
  where name in ('shared_buffers', 'effective_cache_size', 'work_mem', 'max_connections', 'random_page_cost')
  order by name
`)
  ).rows.map((row) => [row.name, `${row.setting}${row.unit ?? ""}`]),
);
const postgresVersion = String(
  (await db.query("show server_version")).rows[0]?.server_version ?? "unknown",
);
const results: Array<Record<string, unknown>> = [];
const explains: Record<string, string> = {};
const waitForDatabaseIdle = async (): Promise<void> => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const active = Number(
      (
        await db.query(`
      select count(*)::int active
      from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
        and state <> 'idle'
    `)
      ).rows[0]?.active ?? 0,
    );
    if (active === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Database did not become idle between load scenarios");
};
try {
  for (const scenario of scenarios) {
    if (scenario.explain) {
      const plan = await db.query(
        `explain (analyze, buffers, format text) ${scenario.explain.sql}`,
        scenario.explain.values,
      );
      const countPlan = await db.query(
        `explain (analyze, buffers, format text) select count(*) from tenders where ${scenario.explain.sql.split("where ")[1]!.split(" order by ")[0]}`,
        scenario.explain.values,
      );
      explains[scenario.name] = [...plan.rows, ...countPlan.rows]
        .map((row) => row["QUERY PLAN"])
        .join("\n");
    }
    for (const concurrency of concurrencies) {
      const result = await runCannon(`${baseUrl}${scenario.path}`, concurrency);
      results.push({
        scenario: scenario.name,
        concurrency,
        rps: result.requests.average,
        p50Ms: result.requests.total > 0 ? result.latency.p50 : null,
        p95Ms: result.measuredP95,
        p99Ms: result.requests.total > 0 ? result.latency.p99 : null,
        censored: result.requests.total === 0,
        errors: result.errors,
        timeouts: result.timeouts,
        non2xx: result.non2xx,
        requests: result.requests.total,
        statusCodeStats: result.statusCodeStats,
      });
      await waitForDatabaseIdle();
    }
  }

  if (!skipBurst) {
    const [burst, normal] = await Promise.all([
      runCannon(
        `${baseUrl}/api/v1/tenders/search?q=tecnologia&facets=false`,
        500,
        { "x-forwarded-for": "198.51.100.10" },
      ),
      runCannon(
        `${baseUrl}/api/v1/tenders/search?q=ultrassom&facets=false`,
        10,
        { "x-forwarded-for": "198.51.100.20" },
      ),
    ]);
    results.push({
      scenario: "rajada-cliente-a",
      concurrency: 500,
      rps: burst.requests.average,
      p50Ms: burst.requests.total > 0 ? burst.latency.p50 : null,
      p95Ms: burst.measuredP95,
      p99Ms: burst.requests.total > 0 ? burst.latency.p99 : null,
      censored: burst.requests.total === 0,
      errors: burst.errors,
      timeouts: burst.timeouts,
      non2xx: burst.non2xx,
      requests: burst.requests.total,
      statusCodeStats: burst.statusCodeStats,
    });
    results.push({
      scenario: "cliente-b-durante-rajada",
      concurrency: 10,
      rps: normal.requests.average,
      p50Ms: normal.requests.total > 0 ? normal.latency.p50 : null,
      p95Ms: normal.measuredP95,
      p99Ms: normal.requests.total > 0 ? normal.latency.p99 : null,
      censored: normal.requests.total === 0,
      errors: normal.errors,
      timeouts: normal.timeouts,
      non2xx: normal.non2xx,
      requests: normal.requests.total,
      statusCodeStats: normal.statusCodeStats,
    });
    await waitForDatabaseIdle();
  }
} finally {
  await db.end();
  child.kill("SIGTERM");
  await once(child, "exit");
}

await mkdir(outputDir, { recursive: true });
const metrics = JSON.parse(await readFile(metricsPath, "utf8")) as Record<
  string,
  unknown
>;
await rm(metricsPath, { force: true });
const report = {
  label,
  rows,
  durationSeconds: duration,
  generatedAt: new Date().toISOString(),
  machine: {
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
  postgres: { version: postgresVersion, settings: postgresSettings },
  server: { cwd: serverCwd, script: serverScript, stderr, stdout },
  metrics,
  results,
  explains,
};
const jsonPath = path.join(outputDir, `scale-${label}.json`);
const mdPath = path.join(outputDir, `scale-${label}.md`);
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
const latency = (value: unknown): unknown =>
  value === null ? `>${duration * 1_000}` : value;
const table = results
  .map(
    (row) =>
      `| ${row.scenario} | ${row.concurrency} | ${row.rps} | ${latency(row.p50Ms)} | ${latency(row.p95Ms)} | ${latency(row.p99Ms)} | ${row.errors} | ${row.non2xx} |`,
  )
  .join("\n");
const plans = Object.entries(explains)
  .map(([name, plan]) => `### ${name}\n\n\`\`\`text\n${plan}\n\`\`\``)
  .join("\n\n");
await writeFile(
  mdPath,
  `# Carga ${label}\n\n- Linhas: ${rows.toLocaleString("pt-BR")}\n- Duração por amostra: ${duration}s\n- Máquina: ${report.machine.platform}, ${report.machine.cpus} CPUs, ${report.machine.totalMemoryBytes} bytes de RAM\n- PostgreSQL: ${postgresVersion}; ${Object.entries(
    postgresSettings,
  )
    .map(([name, value]) => `${name}=${value}`)
    .join(
      ", ",
    )}\n- Pico RSS: ${metrics.rssPeakBytes} bytes\n- Event loop lag p95/máx.: ${metrics.eventLoopLagP95Ms}/${metrics.eventLoopLagMaxMs} ms\n\n| Cenário | Conc. | RPS | p50 ms | p95 ms | p99 ms | erros | não-2xx |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\n## EXPLAIN (ANALYZE, BUFFERS)\n\n${plans || "Nenhum plano coletado nesta rodada."}\n`,
);
process.stdout.write(
  `${JSON.stringify({ jsonPath, mdPath, rows, metrics }, null, 2)}\n`,
);
