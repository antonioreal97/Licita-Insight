import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../lib/api-error";
import type { EmailMessage } from "../email/email-client";
import {
  buildFeedbackEmail,
  notifyTenderFeedback,
  parseTenderFeedbackInput,
  parseTenderId,
  truncateUserAgent,
  type FeedbackNotification,
} from "./tender-feedback-service";

const valid = { kind: "wrong_or_missing_info", message: "O valor estimado não confere com o edital." };

const invalidFields = (body: unknown): string[] => {
  try {
    parseTenderFeedbackInput(body);
  } catch (error) {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.code, "INVALID_PARAMETER");
    return (error.details ?? []).map((detail) => detail.field);
  }
  assert.fail("expected INVALID_PARAMETER");
};

test("parses a minimal report and trims the message before the length check", () => {
  assert.deepEqual(parseTenderFeedbackInput({ ...valid, message: `   ${valid.message}\n ` }), {
    kind: "wrong_or_missing_info",
    section: null,
    message: valid.message,
    pageUrl: null,
  });
  assert.deepEqual(
    parseTenderFeedbackInput({ kind: "broken_link", section: "documents", message: "O anexo 2 retorna erro 404.", pageUrl: "/tenders/abc?x=1" }),
    { kind: "broken_link", section: "documents", message: "O anexo 2 retorna erro 404.", pageUrl: "/tenders/abc?x=1" },
  );
});

test("accepts every kind and section in the contract", () => {
  for (const kind of ["wrong_or_missing_info", "possible_irregularity", "broken_link", "other"]) {
    assert.equal(parseTenderFeedbackInput({ ...valid, kind }).kind, kind);
  }
  for (const section of ["summary", "deadlines", "value", "documents", "sheet", "items", "timeline", "other", null]) {
    assert.equal(parseTenderFeedbackInput({ ...valid, section }).section, section);
  }
});

test("enforces 10 to 2000 characters after trimming", () => {
  assert.equal(parseTenderFeedbackInput({ ...valid, message: "1234567890" }).message, "1234567890");
  assert.equal(parseTenderFeedbackInput({ ...valid, message: "x".repeat(2000) }).message.length, 2000);
  assert.deepEqual(invalidFields({ ...valid, message: "  123456789   " }), ["message"]);
  assert.deepEqual(invalidFields({ ...valid, message: "x".repeat(2001) }), ["message"]);
  assert.deepEqual(invalidFields({ ...valid, message: 42 }), ["message"]);
  assert.deepEqual(invalidFields({ kind: "other" }), ["message"]);
});

test("rejects unknown kinds and sections and non-object bodies", () => {
  assert.deepEqual(invalidFields({ ...valid, kind: "spam" }), ["kind"]);
  assert.deepEqual(invalidFields({ message: valid.message }), ["kind"]);
  assert.deepEqual(invalidFields({ ...valid, section: "header" }), ["section"]);
  assert.deepEqual(invalidFields({ ...valid, pageUrl: "x".repeat(2001) }), ["pageUrl"]);
  assert.deepEqual(invalidFields(null), ["body"]);
  assert.deepEqual(invalidFields(["x"]), ["body"]);
});

test("keeps only app paths and http(s) page URLs", () => {
  const pageUrl = (value: unknown) => parseTenderFeedbackInput({ ...valid, pageUrl: value }).pageUrl;
  assert.equal(pageUrl("https://pardaldigital.com/tenders/a"), "https://pardaldigital.com/tenders/a");
  assert.equal(pageUrl("/tenders/a#documentos"), "/tenders/a#documentos");
  assert.equal(pageUrl("javascript:alert(1)"), null);
  assert.equal(pageUrl("//evil.example/x"), null);
  assert.equal(pageUrl("   "), null);
  assert.equal(pageUrl(null), null);
});

test("validates the tender id and truncates the user agent", () => {
  assert.equal(parseTenderId(" abc-1 "), "abc-1");
  assert.throws(() => parseTenderId(""), ApiError);
  assert.throws(() => parseTenderId("x".repeat(201)), ApiError);
  assert.equal(truncateUserAgent(undefined), null);
  assert.equal(truncateUserAgent("  "), null);
  assert.equal(truncateUserAgent("y".repeat(500))?.length, 300);
});

const feedback: FeedbackNotification = {
  id: "11111111-1111-4111-8111-111111111111",
  tenderId: "00394460000141-1-000123/2026",
  tenderTitle: "Aquisição de <computadores>",
  authenticated: false,
  input: { kind: "possible_irregularity", section: "documents", message: "Exige marca <script>x</script>", pageUrl: null },
};

test("builds a short team e-mail with the tender link and escaped HTML", () => {
  const email = buildFeedbackEmail("equipe@example.test", "https://pardaldigital.com", feedback);
  assert.equal(email.to, "equipe@example.test");
  assert.equal(email.subject, "[Pardal Digital] Feedback: Possível irregularidade no edital");
  assert.match(email.text, /Link: https:\/\/pardaldigital\.com\/tenders\/00394460000141-1-000123%2F2026/);
  assert.match(email.text, /Parte da página: Documentos/);
  assert.match(email.text, /Enviado por: visitante anônimo/);
  assert.match(email.text, /Exige marca <script>x<\/script>/);
  assert.equal(email.html.includes("<script>"), false);
  assert.match(email.html, /&lt;computadores&gt;/);
});

test("sends the notification only when FEEDBACK_NOTIFY_EMAIL and the app origin are set, and never throws", async () => {
  const sent: Array<{ message: EmailMessage; key: string }> = [];
  const sendEmail = async (message: EmailMessage, key: string) => {
    sent.push({ message, key });
    return { status: "sent" as const, providerMessageId: "m1" };
  };
  assert.equal(await notifyTenderFeedback(feedback, { notifyEmail: () => null, appOrigin: () => "https://a.test", sendEmail }), null);
  assert.deepEqual(await notifyTenderFeedback(feedback, { notifyEmail: () => "t@a.test", appOrigin: () => null, sendEmail }), {
    status: "skipped",
    reason: "PUBLIC_APP_ORIGIN must be configured",
  });
  assert.equal(sent.length, 0);

  const result = await notifyTenderFeedback(feedback, { notifyEmail: () => "t@a.test", appOrigin: () => "https://a.test", sendEmail });
  assert.deepEqual(result, { status: "sent", providerMessageId: "m1" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.key, `tender-feedback:${feedback.id}`);

  const failed = await notifyTenderFeedback(feedback, {
    notifyEmail: () => "t@a.test",
    appOrigin: () => "https://a.test",
    sendEmail: async () => {
      throw new Error("provider down");
    },
  });
  assert.equal(failed?.status, "failed");
});
