import assert from "node:assert/strict";
import test from "node:test";
import { tryRunSingletonJob } from "./job-lock";

test("two concurrent workers execute the protected job only once", async () => {
  let held = false;
  let workCount = 0;
  const audit: string[] = [];
  const fakePool = {
    async connect() {
      return {
        async query<Row>(text: string): Promise<{ rows: Row[] }> {
          if (text.includes("pg_try_advisory_lock")) {
            const acquired = !held;
            if (acquired) held = true;
            return { rows: [{ acquired }] as Row[] };
          }
          if (text.includes("returning id")) return { rows: [{ id: 1 }] as Row[] };
          if (text.includes("skipped_locked")) audit.push("skipped_locked");
          if (text.includes("status = 'succeeded'")) audit.push("succeeded");
          if (text.includes("pg_advisory_unlock")) held = false;
          return { rows: [] };
        },
        release() {},
      };
    },
  };
  let releaseWork!: () => void;
  const workBlocked = new Promise<void>((resolve) => { releaseWork = resolve; });
  const first = tryRunSingletonJob("test", async () => {
    workCount += 1;
    await workBlocked;
  }, { lockPool: fakePool, workerId: "worker-1" });
  await new Promise((resolve) => setImmediate(resolve));
  const second = await tryRunSingletonJob("test", async () => {
    workCount += 1;
  }, { lockPool: fakePool, workerId: "worker-2" });
  releaseWork();
  const firstResult = await first;
  assert.equal(firstResult.acquired, true);
  assert.equal(second.acquired, false);
  assert.equal(workCount, 1);
  assert.deepEqual(audit.sort(), ["skipped_locked", "succeeded"]);
});
