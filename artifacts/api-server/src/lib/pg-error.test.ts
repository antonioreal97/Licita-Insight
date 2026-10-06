import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUniqueViolation, pgErrorCode } from "./pg-error";

describe("pgErrorCode", () => {
  it("reads the code of a bare driver error", () => {
    assert.equal(pgErrorCode(Object.assign(new Error("dup"), { code: "23505" })), "23505");
  });

  it("follows the cause of a Drizzle query error", () => {
    const driverError = Object.assign(new Error("duplicate key"), { code: "23505" });
    const drizzleError = new Error("Failed query: insert into \"ingest_runs\"", { cause: driverError });
    assert.equal(pgErrorCode(drizzleError), "23505");
    assert.equal(isUniqueViolation(drizzleError), true);
  });

  it("finds a code inside an AggregateError", () => {
    const aggregate = new AggregateError([new Error("x"), Object.assign(new Error("y"), { code: "ECONNREFUSED" })]);
    assert.equal(pgErrorCode(new Error("connect", { cause: aggregate })), "ECONNREFUSED");
  });

  it("returns undefined when no code exists", () => {
    assert.equal(pgErrorCode(new Error("plain")), undefined);
    assert.equal(pgErrorCode(undefined), undefined);
    assert.equal(isUniqueViolation(new Error("plain")), false);
  });
});
