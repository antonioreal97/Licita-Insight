import assert from "node:assert/strict";
import test from "node:test";
import {
  appRoleFromEnv,
  roleRunsJobs,
  roleServesApi,
} from "./app-role";

test("APP_ROLE defaults to the backwards-compatible all role", () => {
  assert.equal(appRoleFromEnv(undefined), "all");
  assert.equal(appRoleFromEnv("  "), "all");
  assert.equal(roleServesApi("all"), true);
  assert.equal(roleRunsJobs("all"), true);
});

test("api and worker roles have disjoint responsibilities", () => {
  assert.equal(roleServesApi(appRoleFromEnv("api")), true);
  assert.equal(roleRunsJobs(appRoleFromEnv("api")), false);
  assert.equal(roleServesApi(appRoleFromEnv("worker")), false);
  assert.equal(roleRunsJobs(appRoleFromEnv("worker")), true);
});

test("invalid APP_ROLE values fail fast", () => {
  assert.throws(() => appRoleFromEnv("scheduler"), /APP_ROLE must be one of/);
});
