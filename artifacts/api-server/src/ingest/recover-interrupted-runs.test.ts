import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test";

const { recoverInterruptedIngestRuns } =
  await import("./recover-interrupted-runs");
const { INTERRUPTED_RUN_OBSERVATION_MS } = await import("./run-heartbeat");

describe("startup ingest recovery", () => {
  it("fails only a run whose heartbeat stayed unchanged during observation", async () => {
    const firstHeartbeat = new Date("2026-10-12T12:00:00Z");
    const recentHeartbeat = new Date("2026-10-12T12:01:00Z");
    const failed: string[] = [];
    const waits: number[] = [];
    let reads = 0;

    const recovered = await recoverInterruptedIngestRuns({
      loadRunning: async () => {
        reads += 1;
        return reads === 1
          ? [
              {
                id: "orphan",
                source: "pncp-transparency",
                heartbeatAt: firstHeartbeat,
              },
              { id: "manual", source: "pncp", heartbeatAt: firstHeartbeat },
            ]
          : [
              {
                id: "orphan",
                source: "pncp-transparency",
                heartbeatAt: firstHeartbeat,
              },
              { id: "manual", source: "pncp", heartbeatAt: recentHeartbeat },
            ];
      },
      failInterrupted: async (runs) => {
        failed.push(...runs.map(({ id }) => id));
        return runs.length;
      },
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
      now: () => new Date("2026-10-12T12:02:00Z"),
    });

    assert.equal(recovered, 1);
    assert.deepEqual(failed, ["orphan"]);
    assert.deepEqual(waits, [INTERRUPTED_RUN_OBSERVATION_MS]);
  });
});
