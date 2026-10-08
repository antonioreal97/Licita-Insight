export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};

export type EmailSendResult =
  | { status: "sent"; providerMessageId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string; retryable: boolean };

export type SendEmail = (
  message: EmailMessage,
  idempotencyKey: string,
) => Promise<EmailSendResult>;
