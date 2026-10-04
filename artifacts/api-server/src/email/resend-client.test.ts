import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sendWithResend } from "./resend-client";

const message = {
  to: "user@example.test",
  subject: "TEST EMAIL",
  html: "<p>TEST</p>",
  text: "TEST",
  headers: {
    "List-Unsubscribe": "<https://example.test/unsubscribe>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
};

describe("Resend client", () => {
  it("marks delivery skipped without credentials", async () => {
    assert.deepEqual(
      await sendWithResend(message, "test-key", { env: {} }),
      {
        status: "skipped",
        reason: "RESEND_API_KEY and MAIL_FROM must be configured",
      },
    );
  });

  it("sends text, HTML, unsubscribe headers, and an idempotency key", async () => {
    let request: Request | undefined;
    const result = await sendWithResend(message, "delivery/test", {
      env: {
        RESEND_API_KEY: "re_test",
        MAIL_FROM: "Abriu lá <alertas@example.test>",
        MAIL_REPLY_TO: "suporte@example.test",
      },
      fetchImpl: async (input, init) => {
        request = new Request(input, init);
        return Response.json({ id: "resend-message-id" });
      },
    });
    assert.deepEqual(result, {
      status: "sent",
      providerMessageId: "resend-message-id",
    });
    assert.equal(request?.headers.get("Idempotency-Key"), "delivery/test");
    const body = (await request?.json()) as Record<string, unknown>;
    assert.equal(body.html, message.html);
    assert.equal(body.text, message.text);
    assert.deepEqual(body.headers, message.headers);
    assert.equal(body.reply_to, "suporte@example.test");
  });

  it("classifies rate limits as retryable and validation errors as terminal", async () => {
    const env = { RESEND_API_KEY: "re_test", MAIL_FROM: "a@example.test" };
    const limited = await sendWithResend(message, "limited", {
      env,
      fetchImpl: async () =>
        Response.json({ message: "rate limited" }, { status: 429 }),
    });
    const invalid = await sendWithResend(message, "invalid", {
      env,
      fetchImpl: async () =>
        Response.json({ message: "invalid sender" }, { status: 422 }),
    });
    assert.equal(limited.status, "failed");
    assert.equal(limited.status === "failed" && limited.retryable, true);
    assert.equal(invalid.status, "failed");
    assert.equal(invalid.status === "failed" && invalid.retryable, false);
  });
});
