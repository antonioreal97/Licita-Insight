import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SendEmail } from "./email-client";
import { selectEmailProvider, sendWithEmailProvider } from "./email-provider";

const message = {
  to: "user@example.test",
  subject: "TEST EMAIL",
  html: "<p>TEST</p>",
  text: "TEST",
  headers: {},
};

describe("email provider selection", () => {
  it("honors an explicit provider", () => {
    assert.equal(
      selectEmailProvider({
        EMAIL_PROVIDER: "brevo",
        RESEND_API_KEY: "re_test",
      }),
      "brevo",
    );
    assert.equal(
      selectEmailProvider({
        EMAIL_PROVIDER: "resend",
        BREVO_API_KEY: "xkeysib-test",
      }),
      "resend",
    );
  });

  it("prefers Brevo, then Resend, when EMAIL_PROVIDER is absent", () => {
    assert.equal(
      selectEmailProvider({
        BREVO_API_KEY: "xkeysib-test",
        RESEND_API_KEY: "re_test",
      }),
      "brevo",
    );
    assert.equal(selectEmailProvider({ RESEND_API_KEY: "re_test" }), "resend");
    assert.equal(selectEmailProvider({}), null);
  });

  it("dispatches only to the selected provider without a network request", async () => {
    const called: string[] = [];
    const sender =
      (provider: string): SendEmail =>
      async () => {
        called.push(provider);
        return { status: "sent", providerMessageId: provider };
      };
    const result = await sendWithEmailProvider(message, "delivery/test", {
      env: { EMAIL_PROVIDER: "resend", BREVO_API_KEY: "xkeysib-test" },
      senders: { brevo: sender("brevo"), resend: sender("resend") },
    });
    assert.deepEqual(result, { status: "sent", providerMessageId: "resend" });
    assert.deepEqual(called, ["resend"]);
  });

  it("keeps the existing skipped behavior without a configured provider", async () => {
    assert.deepEqual(
      await sendWithEmailProvider(message, "delivery/test", { env: {} }),
      {
        status: "skipped",
        reason:
          "BREVO_API_KEY or RESEND_API_KEY and MAIL_FROM must be configured",
      },
    );
  });
});
