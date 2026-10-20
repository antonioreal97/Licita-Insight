import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const { rebuildRecommendationsAfterPncpCollect } =
  await import("./collect-pncp");

test("rebuild pós-PNCP respeita APP_ROLE e usa o lock diário", async () => {
  const calls: string[] = [];
  const acquire = async (name: string, job: () => Promise<unknown>) => {
    calls.push(name);
    await job();
    return { acquired: true, value: {} };
  };
  let rebuilt = 0;
  assert.equal(
    await rebuildRecommendationsAfterPncpCollect("api", acquire, async () => {
      rebuilt += 1;
    }),
    false,
  );
  assert.equal(rebuilt, 0);
  assert.deepEqual(calls, []);

  assert.equal(
    await rebuildRecommendationsAfterPncpCollect(
      "worker",
      acquire,
      async () => {
        rebuilt += 1;
      },
    ),
    true,
  );
  assert.equal(rebuilt, 1);
  assert.deepEqual(calls, ["daily_recommendations"]);
});
