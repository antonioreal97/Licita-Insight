import { createHash } from "node:crypto";
import { logger } from "../lib/logger";
import { timeoutSignal } from "../lib/http-timeout";
import type { EmailMessage, EmailSendResult } from "./email-client";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

type BrevoEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, "BREVO_API_KEY" | "MAIL_FROM" | "MAIL_REPLY_TO">
>;

export type BrevoAddress = { email: string; name?: string };

export const parseMailFrom = (value: string): BrevoAddress | null => {
  const input = value.trim();
  if (!input) return null;
  const named = input.match(/^(.+?)\s*<([^<>]+)>$/);
  const email = (named?.[2] ?? input).trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  const rawName = named?.[1]?.trim();
  const name = rawName?.replace(/^"(.*)"$/, "$1").trim();
  return name ? { name, email } : { email };
};

const responseMessage = async (response: Response): Promise<string> => {
  const text = await response.text();
  if (!text) return `Brevo returned HTTP ${response.status}`;
  try {
    const body = JSON.parse(text) as { code?: unknown; message?: unknown };
    const code = typeof body.code === "string" ? body.code : null;
    const message = typeof body.message === "string" ? body.message : null;
    return (
      [code, message].filter(Boolean).join(": ") ||
      `Brevo returned HTTP ${response.status}`
    );
  } catch {
    return `Brevo returned HTTP ${response.status}`;
  }
};

const deliveryTag = (idempotencyKey: string): string => {
  if (idempotencyKey.startsWith("email:digest:")) return "digest";
  if (idempotencyKey.startsWith("email:immediate:")) return "immediate";
  return "transactional";
};

const deliveryIdentifier = (idempotencyKey: string): string =>
  `delivery-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16)}`;

export const sendWithBrevo = async (
  message: EmailMessage,
  idempotencyKey: string,
  options: {
    env?: BrevoEnvironment;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<EmailSendResult> => {
  const env = options.env ?? process.env;
  const apiKey = env.BREVO_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim();
  if (!apiKey || !from) {
    logger.warn(
      { hasApiKey: Boolean(apiKey), hasMailFrom: Boolean(from) },
      "Email delivery skipped because Brevo is not configured",
    );
    return {
      status: "skipped",
      reason: "BREVO_API_KEY and MAIL_FROM must be configured",
    };
  }

  const sender = parseMailFrom(from);
  const replyToValue = env.MAIL_REPLY_TO?.trim();
  const replyTo = replyToValue ? parseMailFrom(replyToValue) : null;
  if (!sender || (replyToValue && !replyTo)) {
    return {
      status: "failed",
      reason: !sender
        ? "MAIL_FROM is not a valid email sender"
        : "MAIL_REPLY_TO is not a valid email sender",
      retryable: false,
    };
  }

  try {
    const response = await (options.fetchImpl ?? fetch)(BREVO_API_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        headers: message.headers,
        tags: [
          "notification",
          deliveryTag(idempotencyKey),
          deliveryIdentifier(idempotencyKey),
        ],
        ...(replyTo ? { replyTo } : {}),
      }),
      signal: timeoutSignal("BREVO_HTTP_TIMEOUT_MS", 15_000),
    });
    if (!response.ok) {
      return {
        status: "failed",
        reason: await responseMessage(response),
        retryable:
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
      };
    }
    const body = (await response.json()) as { messageId?: unknown };
    if (typeof body.messageId !== "string" || body.messageId === "") {
      return {
        status: "failed",
        reason: "Brevo response did not contain a message id",
        retryable: true,
      };
    }
    return { status: "sent", providerMessageId: body.messageId };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "Brevo request failed",
      retryable: true,
    };
  }
};
