import assert from "node:assert/strict";
import test from "node:test";
import { poolConfigFromEnv } from "./pool-config";

test("pool configuration reads env and keeps safe defaults", () => {
  assert.deepEqual(poolConfigFromEnv({ DATABASE_URL: "postgres://test" }), {
    connectionString: "postgres://test",
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
    statement_timeout: 15_000,
    application_name: "licitai-api",
  });
  assert.equal(poolConfigFromEnv({ DB_POOL_MAX: "23" }).max, 23);
  assert.equal(poolConfigFromEnv({ DB_STATEMENT_TIMEOUT_MS: "90000" }).statement_timeout, 90_000);
  assert.throws(() => poolConfigFromEnv({ DB_POOL_MAX: "0" }), /DB_POOL_MAX/);
});
