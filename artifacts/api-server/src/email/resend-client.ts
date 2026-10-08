import { logger } from "../lib/logger";
import { timeoutSignal } from "../lib/http-timeout";
import type { EmailMessage, EmailSendResult } from "./email-client";

export type { EmailMessage, EmailSendResult } from "./email-client";

const RESEND_API_URL = "https://api.resend.com/emails";

type ResendEnvironment = Partial<Pick<
  NodeJS.ProcessEnv,
  "RESEND_API_KEY" | "MAIL_FROM" | "MAIL_REPLY_TO"
>>;

const responseMessage = async (response: Response): Promise<string> => {
  const text = await response.text();
  if (!text) return `Resend returned HTTP ${response.status}`;
  try {
    const body = JSON.parse(text) as { message?: unknown; name?: unknown };
    const message = typeof body.message === "string" ? body.message : null;
    const name = typeof body.name === "string" ? body.name : null;
    return [name, message].filter(Boolean).join(": ") || `Resend returned HTTP ${response.status}`;
  } catch {
    return `Resend returned HTTP ${response.status}`;
  }
};

export const sendWithResend = async (
  message: EmailMessage,
  idempotencyKey: string,
  options: {
    env?: ResendEnvironment;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<EmailSendResult> => {
  const env = options.env ?? process.env;
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim();
  if (!apiKey || !from) {
    logger.warn(
      { hasApiKey: Boolean(apiKey), hasMailFrom: Boolean(from) },
      "Email delivery skipped because Resend is not configured",
    );
    return {
      status: "skipped",
      reason: "RESEND_API_KEY and MAIL_FROM must be configured",
    };
  }

  try {
    const response = await (options.fetchImpl ?? fetch)(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
        ...(env.MAIL_REPLY_TO?.trim()
          ? { reply_to: env.MAIL_REPLY_TO.trim() }
          : {}),
      }),
      signal: timeoutSignal("RESEND_HTTP_TIMEOUT_MS", 15_000),
    });
    if (!response.ok) {
      return {
        status: "failed",
        reason: await responseMessage(response),
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      };
    }
    const body = (await response.json()) as { id?: unknown };
    if (typeof body.id !== "string" || body.id === "") {
      return {
        status: "failed",
        reason: "Resend response did not contain a message id",
        retryable: true,
      };
    }
    return { status: "sent", providerMessageId: body.id };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "Resend request failed",
      retryable: true,
    };
  }
};
