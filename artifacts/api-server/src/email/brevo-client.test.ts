import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMailFrom, sendWithBrevo } from "./brevo-client";

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

describe("Brevo client", () => {
  it("parses a named MAIL_FROM and a bare address", () => {
    assert.deepEqual(parseMailFrom("Pardal Digital <alertas@example.test>"), {
      name: "Pardal Digital",
      email: "alertas@example.test",
    });
    assert.deepEqual(parseMailFrom("alertas@example.test"), {
      email: "alertas@example.test",
    });
    assert.equal(parseMailFrom("Pardal Digital"), null);
  });

  it("maps the transactional body, sender, reply-to, headers, tags and identification", async () => {
    let request: Request | undefined;
    const result = await sendWithBrevo(
      message,
      "email:digest:user:2026-10-07",
      {
        env: {
          BREVO_API_KEY: "xkeysib-test",
          MAIL_FROM: "Pardal Digital <alertas@example.test>",
          MAIL_REPLY_TO: "Suporte <suporte@example.test>",
        },
        fetchImpl: async (input, init) => {
          request = new Request(input, init);
          return Response.json(
            { messageId: "brevo-message-id" },
            { status: 201 },
          );
        },
      },
    );
    assert.deepEqual(result, {
      status: "sent",
      providerMessageId: "brevo-message-id",
    });
    assert.equal(request?.url, "https://api.brevo.com/v3/smtp/email");
    assert.equal(request?.headers.get("api-key"), "xkeysib-test");
    const body = (await request?.json()) as Record<string, unknown>;
    assert.deepEqual(body.sender, {
      name: "Pardal Digital",
      email: "alertas@example.test",
    });
    assert.deepEqual(body.to, [{ email: message.to }]);
    assert.equal(body.subject, message.subject);
    assert.equal(body.htmlContent, message.html);
    assert.equal(body.textContent, message.text);
    assert.deepEqual(body.replyTo, {
      name: "Suporte",
      email: "suporte@example.test",
    });
    assert.deepEqual(body.headers, message.headers);
    assert.deepEqual(body.tags, [
      "notification",
      "digest",
      "delivery-e4ec84c6c0f65f73",
    ]);
  });

  it("classifies HTTP errors and exposes Brevo's useful message", async () => {
    const env = {
      BREVO_API_KEY: "xkeysib-test",
      MAIL_FROM: "alertas@example.test",
    };
    const limited = await sendWithBrevo(message, "limited", {
      env,
      fetchImpl: async () =>
        Response.json(
          { code: "too_many_requests", message: "rate limited" },
          { status: 429 },
        ),
    });
    const invalid = await sendWithBrevo(message, "invalid", {
      env,
      fetchImpl: async () =>
        Response.json(
          { code: "invalid_parameter", message: "invalid sender" },
          { status: 400 },
        ),
    });
    assert.deepEqual(limited, {
      status: "failed",
      reason: "too_many_requests: rate limited",
      retryable: true,
    });
    assert.deepEqual(invalid, {
      status: "failed",
      reason: "invalid_parameter: invalid sender",
      retryable: false,
    });
  });
});
