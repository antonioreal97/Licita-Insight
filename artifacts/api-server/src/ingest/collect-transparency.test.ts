import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PncpError } from "./pncp-client";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test";

const purchase = (sequence: number) =>
  `${String(sequence).padStart(14, "0")}-1-${sequence}/2026`;

const oneResultItem = [{ temResultado: true, numeroItem: 1 }];

describe("transparency result purchase collection", () => {
  it("skips a recoverable 502 for one purchase and continues without marking it checked", async () => {
    const { collectTransparencyResultPurchases } = await import("./collect-transparency");
    const checked: string[] = [];
    const progress: unknown[] = [];

    const result = await collectTransparencyResultPurchases(
      [
        { purchaseControl: purchase(1) },
        { purchaseControl: purchase(2) },
        { purchaseControl: purchase(3) },
      ],
      {
        fetchCompraItens: async () => oneResultItem,
        fetchItemResults: async (input) => {
          if (input.purchaseSequence === 2) throw new PncpError("bad gateway", 502, "");
          return [{ sequencialResultado: 1 }];
        },
        upsertPncpItemResults: async () => 1,
        markPurchaseChecked: async (purchaseControl) => {
          checked.push(purchaseControl);
        },
        onProgress: async (counters) => {
          progress.push(counters);
        },
        now: () => new Date("2026-10-07T12:00:00.000Z"),
      },
    );

    assert.deepEqual(checked, [purchase(1), purchase(3)]);
    assert.equal(result.results, 2);
    assert.equal(result.purchasesChecked, 2);
    assert.equal(result.purchasesSkipped, 1);
    assert.equal(result.stoppedAfterConsecutiveRecoverableFailures, false);
    assert.deepEqual(progress.at(-1), result);
  });

  it("throws non-recoverable errors so the execution can fail as before", async () => {
    const { collectTransparencyResultPurchases } = await import("./collect-transparency");
    const checked: string[] = [];

    await assert.rejects(
      collectTransparencyResultPurchases(
        [{ purchaseControl: purchase(1) }],
        {
          fetchCompraItens: async () => oneResultItem,
          fetchItemResults: async () => {
            throw new PncpError("bad request", 400, "");
          },
          upsertPncpItemResults: async () => 1,
          markPurchaseChecked: async (purchaseControl) => {
            checked.push(purchaseControl);
          },
        },
      ),
      /bad request/,
    );
    assert.deepEqual(checked, []);
  });

  it("stops the result loop after the consecutive recoverable failure limit without throwing", async () => {
    const { collectTransparencyResultPurchases } = await import("./collect-transparency");
    let attempts = 0;
    const progress: unknown[] = [];

    const result = await collectTransparencyResultPurchases(
      [
        { purchaseControl: purchase(1) },
        { purchaseControl: purchase(2) },
        { purchaseControl: purchase(3) },
      ],
      {
        fetchCompraItens: async () => {
          attempts += 1;
          throw new PncpError("service unavailable", 503, "");
        },
        upsertPncpItemResults: async () => 1,
        markPurchaseChecked: async () => {
          throw new Error("should not mark skipped purchases");
        },
        onProgress: async (counters) => {
          progress.push(counters);
        },
        maxConsecutiveRecoverableFailures: 2,
      },
    );

    assert.equal(attempts, 2);
    assert.equal(result.results, 0);
    assert.equal(result.purchasesChecked, 0);
    assert.equal(result.purchasesSkipped, 2);
    assert.equal(result.stoppedAfterConsecutiveRecoverableFailures, true);
    assert.deepEqual(progress.at(-1), result);
  });
});
