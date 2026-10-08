import { logger } from "../lib/logger";
import { sendWithBrevo } from "./brevo-client";
import type { EmailMessage, EmailSendResult, SendEmail } from "./email-client";
import { sendWithResend } from "./resend-client";

export type EmailProvider = "brevo" | "resend";

type EmailProviderEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | "EMAIL_PROVIDER"
    | "BREVO_API_KEY"
    | "RESEND_API_KEY"
    | "MAIL_FROM"
    | "MAIL_REPLY_TO"
  >
>;

export const selectEmailProvider = (
  env: EmailProviderEnvironment = process.env,
): EmailProvider | null => {
  const configured = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (configured === "brevo" || configured === "resend") return configured;
  if (configured) return null;
  if (env.BREVO_API_KEY?.trim()) return "brevo";
  if (env.RESEND_API_KEY?.trim()) return "resend";
  return null;
};

export const sendWithEmailProvider = async (
  message: EmailMessage,
  idempotencyKey: string,
  options: {
    env?: EmailProviderEnvironment;
    senders?: Record<EmailProvider, SendEmail>;
  } = {},
): Promise<EmailSendResult> => {
  const env = options.env ?? process.env;
  const provider = selectEmailProvider(env);
  if (!provider) {
    const configured = env.EMAIL_PROVIDER?.trim();
    const reason = configured
      ? "EMAIL_PROVIDER must be brevo or resend"
      : "BREVO_API_KEY or RESEND_API_KEY and MAIL_FROM must be configured";
    logger.warn(
      { configuredProvider: configured || null },
      "Email delivery skipped because no provider is configured",
    );
    return { status: "skipped", reason };
  }
  const senders = options.senders ?? {
    brevo: (value, key) => sendWithBrevo(value, key, { env }),
    resend: (value, key) => sendWithResend(value, key, { env }),
  };
  return senders[provider](message, idempotencyKey);
};
