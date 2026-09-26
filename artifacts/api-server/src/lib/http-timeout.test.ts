import assert from "node:assert/strict";
import test from "node:test";
import { timeoutSignal } from "./http-timeout";

test("outbound timeout aborts a simulated fetch that never responds", async () => {
  process.env.TEST_OUTBOUND_TIMEOUT_MS = "10";
  const signal = timeoutSignal("TEST_OUTBOUND_TIMEOUT_MS", 1_000);
  await assert.rejects(
    new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
    /timeout/i,
  );
  delete process.env.TEST_OUTBOUND_TIMEOUT_MS;
});
