import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { BillingUnavailableError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { AsaasNotFoundError, getSubscription, listSubscriptionPayments } from "./asaas-client";

const respond = (status: number) =>
  mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ errors: [{ code: "not_found", description: "Não encontrado" }] }), { status }),
  );

describe("Asaas client 404 handling", () => {
  let errorLog: ReturnType<typeof mock.method>;

  beforeEach(() => {
    process.env.ASAAS_API_KEY = "test-key";
    process.env.ASAAS_API_BASE_URL = "https://asaas.invalid/v3";
    process.env.ASAAS_WEBHOOK_TOKEN = "test-token";
    process.env.BILLING_MONTHLY_BRL = "49.90";
    errorLog = mock.method(logger, "error", () => undefined);
  });

  afterEach(() => mock.restoreAll());

  it("raises AsaasNotFoundError without an error log when the caller expects 404", async () => {
    respond(404);
    await assert.rejects(getSubscription("sub_1", { notFoundExpected: true }), AsaasNotFoundError);
    await assert.rejects(listSubscriptionPayments("sub_1", { notFoundExpected: true }), AsaasNotFoundError);
    assert.equal(errorLog.mock.callCount(), 0);
  });

  it("keeps the generic error and its log for the other callers", async () => {
    respond(404);
    await assert.rejects(getSubscription("sub_1"), (error) => {
      assert.ok(error instanceof BillingUnavailableError);
      assert.equal(error instanceof AsaasNotFoundError, false);
      return true;
    });
    assert.equal(errorLog.mock.callCount(), 1);
  });

  it("treats 5xx and network failures as unavailability even when 404 is expected", async () => {
    respond(503);
    await assert.rejects(getSubscription("sub_1", { notFoundExpected: true }), (error) => {
      assert.ok(error instanceof BillingUnavailableError);
      assert.equal(error instanceof AsaasNotFoundError, false);
      return true;
    });
    mock.method(globalThis, "fetch", async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    await assert.rejects(listSubscriptionPayments("sub_1", { notFoundExpected: true }), (error) => {
      assert.ok(error instanceof BillingUnavailableError);
      assert.equal(error instanceof AsaasNotFoundError, false);
      return true;
    });
    assert.equal(errorLog.mock.callCount(), 2);
  });
});
