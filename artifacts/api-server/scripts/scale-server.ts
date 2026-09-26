import { monitorEventLoopDelay } from "node:perf_hooks";
import app from "../src/app";
import { pool } from "@workspace/db";

const port = Number(process.env.PORT ?? "3107");
const metricsPath = process.env.SCALE_METRICS_PATH;
const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();
let peakRss = process.memoryUsage().rss;
const memoryTimer = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
}, 250);
memoryTimer.unref();

const server = app.listen(port, () => process.stdout.write(`SCALE_READY ${port}\n`));

const stop = async () => {
  lag.disable();
  clearInterval(memoryTimer);
  const metrics = {
    rssPeakBytes: peakRss,
    eventLoopLagMeanMs: Number(lag.mean / 1e6),
    eventLoopLagP95Ms: Number(lag.percentile(95) / 1e6),
    eventLoopLagMaxMs: Number(lag.max / 1e6),
  };
  if (metricsPath) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(metricsPath, JSON.stringify(metrics, null, 2));
  }
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
