import { performance } from "node:perf_hooks";
import { pool } from "@workspace/db";
import {
  listRecommendations,
  rebuildRecommendationsForUser,
} from "../src/recommendations/recommendation-service";

const users = Number(process.env.RECOMMENDATION_BENCHMARK_USERS ?? 50);
if (!Number.isInteger(users) || users < 1)
  throw new Error("RECOMMENDATION_BENCHMARK_USERS must be a positive integer");

try {
  const [{ count: tenderCount }] = (
    await pool.query<{ count: string }>(
      "select count(*)::text as count from tenders",
    )
  ).rows;
  const started = performance.now();
  let recommendations = 0;
  for (let index = 1; index <= users; index += 1) {
    recommendations += await rebuildRecommendationsForUser(
      `bench-user-${index}`,
    );
  }
  const jobMs = performance.now() - started;
  const samples: Array<{ ms: number; count: number }> = [];
  for (let index = 1; index <= users; index += 1) {
    const before = performance.now();
    const page = await listRecommendations(`bench-user-${index}`, 1, 10);
    samples.push({ ms: performance.now() - before, count: page.data.length });
  }
  const times = samples.map(({ ms }) => ms).sort((left, right) => left - right);
  const percentile = (p: number) =>
    times[Math.min(times.length - 1, Math.ceil(times.length * p) - 1)]!;
  process.stdout.write(
    `${JSON.stringify(
      {
        dataset: { users, tenders: Number(tenderCount) },
        job: {
          users,
          recommendations,
          ms: Number(jobMs.toFixed(2)),
          perUserMs: Number((jobMs / users).toFixed(2)),
        },
        read: {
          samples: times.length,
          minMs: Number(times[0]!.toFixed(2)),
          medianMs: Number(percentile(0.5).toFixed(2)),
          p95Ms: Number(percentile(0.95).toFixed(2)),
          maxMs: Number(times.at(-1)!.toFixed(2)),
          returnedEach: [...new Set(samples.map(({ count }) => count))],
        },
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await pool.end();
}
