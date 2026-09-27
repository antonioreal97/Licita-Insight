import assert from "node:assert/strict";
import { test } from "node:test";

test("Prometheus text is internal and contains no high-cardinality labels", {
  skip: !process.env.PNCP_TEST_DATABASE_URL,
}, async () => {
  process.env.DATABASE_URL = process.env.PNCP_TEST_DATABASE_URL;
  process.env.LOG_LEVEL = "silent";
  const { incrementMetric, metricsText, startMetricsServer } = await import("./metrics");
  incrementMetric("licitai_http_rate_limited_total", { type: "window" });
  const text = await metricsText();
  assert.match(text, /^# HELP/m);
  assert.match(text, /licitai_postgres_pool_connections\{state="total"\}/);
  assert.doesNotMatch(text, /user_id=|tender_id=|job_id=/);
  const server = startMetricsServer(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/metrics`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const { pool } = await import("@workspace/db");
    await pool.end();
  }
});
