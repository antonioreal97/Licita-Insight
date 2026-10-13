import { pool } from "@workspace/db";
import { requireAsaasConfig } from "../src/billing/asaas-client";
import { billingReconcileConfig, reconcileSubscriptions } from "../src/billing/billing-reconciliation";

const dryRun = process.argv.includes("--dry-run");

try {
  requireAsaasConfig();
  const { maxRows, pauseMs } = billingReconcileConfig();
  const { nextUserId, ...summary } = await reconcileSubscriptions({ maxRows, pauseMs, dryRun });
  console.log(JSON.stringify({ dryRun, ...summary, complete: nextUserId === null }, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
} finally {
  await pool.end();
}
