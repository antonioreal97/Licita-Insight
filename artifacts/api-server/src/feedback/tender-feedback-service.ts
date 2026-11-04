import { eq } from "drizzle-orm";
import { SubmitTenderFeedbackBody } from "@workspace/api-zod";
import type { TenderFeedbackKind, TenderFeedbackSection } from "@workspace/db";
import type { EmailMessage, EmailSendResult } from "../email/email-client";
import { InvalidParameterError, NotFoundError } from "../lib/api-error";
import { logger } from "../lib/logger";

export const TENDER_ID_MAX = 200;
export const USER_AGENT_MAX = 300;
const NOTIFY_MESSAGE_MAX = 2000;

export type TenderFeedbackInput = {
  kind: TenderFeedbackKind;
  section: TenderFeedbackSection | null;
  message: string;
  pageUrl: string | null;
};

export const KIND_LABELS: Record<TenderFeedbackKind, string> = {
  wrong_or_missing_info: "Informação errada ou faltando",
  possible_irregularity: "Possível irregularidade no edital",
  broken_link: "Documento ou link quebrado",
  other: "Outro",
};

export const SECTION_LABELS: Record<TenderFeedbackSection, string> = {
  summary: "Resumo e objeto",
  deadlines: "Prazos e datas",
  value: "Valor estimado",
  documents: "Documentos",
  sheet: "Ficha do edital",
  items: "Itens",
  timeline: "Cronologia",
  other: "Outra parte",
};

const invalid = (field: string, issue: string): never => {
  throw new InvalidParameterError(`${field} is invalid`, [{ field, issue }]);
};

/** A path on the app (`/tenders/x?y`) or an absolute http(s) URL. Anything else is dropped, not rejected. */
const normalizePageUrl = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

/** Validates the body with the generated contract schema after trimming the message (tender-feedback-v1). */
export function parseTenderFeedbackInput(body: unknown): TenderFeedbackInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) invalid("body", "invalid_type");
  const raw = body as Record<string, unknown>;
  const parsed = SubmitTenderFeedbackBody.safeParse({
    ...raw,
    message: typeof raw.message === "string" ? raw.message.trim() : raw.message,
  });
  if (!parsed.success) {
    throw new InvalidParameterError(
      "Feedback is invalid",
      parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || "body", issue: issue.code })),
    );
  }
  return {
    kind: parsed.data.kind,
    section: parsed.data.section ?? null,
    message: parsed.data.message,
    pageUrl: normalizePageUrl(parsed.data.pageUrl),
  };
}

export function parseTenderId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id || id.length > TENDER_ID_MAX) invalid("id", "invalid_value");
  return id;
}

export const truncateUserAgent = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, USER_AGENT_MAX) : null;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export type FeedbackNotification = {
  id: string;
  tenderId: string;
  tenderTitle: string;
  authenticated: boolean;
  input: TenderFeedbackInput;
};

/** Short plain e-mail to the team: kind, section, message and the tender link. */
export function buildFeedbackEmail(to: string, origin: string, feedback: FeedbackNotification): EmailMessage {
  const link = `${origin}/tenders/${encodeURIComponent(feedback.tenderId)}`;
  const kind = KIND_LABELS[feedback.input.kind];
  const section = feedback.input.section ? SECTION_LABELS[feedback.input.section] : "Não informada";
  const sender = feedback.authenticated ? "usuário com sessão" : "visitante anônimo";
  const message = feedback.input.message.slice(0, NOTIFY_MESSAGE_MAX);
  const title = feedback.tenderTitle.length > 120 ? `${feedback.tenderTitle.slice(0, 117)}…` : feedback.tenderTitle;
  const lines = [
    `Novo feedback no edital (${kind}).`,
    "",
    `Edital: ${title}`,
    `Link: ${link}`,
    `Parte da página: ${section}`,
    `Enviado por: ${sender}`,
    `Registro: ${feedback.id}`,
    "",
    message,
  ];
  const html = [
    `<p>Novo feedback no edital (<strong>${escapeHtml(kind)}</strong>).</p>`,
    "<ul>",
    `<li>Edital: <a href="${escapeHtml(link)}">${escapeHtml(title)}</a></li>`,
    `<li>Parte da página: ${escapeHtml(section)}</li>`,
    `<li>Enviado por: ${escapeHtml(sender)}</li>`,
    `<li>Registro: ${escapeHtml(feedback.id)}</li>`,
    "</ul>",
    `<blockquote style="white-space:pre-wrap">${escapeHtml(message)}</blockquote>`,
  ].join("");
  return {
    to,
    subject: `[Pardal Digital] Feedback: ${kind}`,
    text: lines.join("\n"),
    html,
    headers: {},
  };
}

export type TenderFeedbackDependencies = {
  notifyEmail: () => string | null;
  appOrigin: () => string | null;
  sendEmail: (message: EmailMessage, idempotencyKey: string) => Promise<EmailSendResult>;
};

const simpleEmail = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed && /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(trimmed) ? trimmed : null;
};

const defaultDependencies: TenderFeedbackDependencies = {
  notifyEmail: () => simpleEmail(process.env.FEEDBACK_NOTIFY_EMAIL),
  appOrigin: () => {
    const raw = process.env.PUBLIC_APP_ORIGIN?.trim();
    if (!raw) return null;
    try {
      return new URL(raw).origin;
    } catch {
      return null;
    }
  },
  sendEmail: async (message, key) => {
    const { sendWithEmailProvider } = await import("../email/email-provider");
    return sendWithEmailProvider(message, key);
  },
};

/** Sends the team e-mail when FEEDBACK_NOTIFY_EMAIL is set. Never throws: the feedback is already stored. */
export async function notifyTenderFeedback(
  feedback: FeedbackNotification,
  dependencies: Partial<TenderFeedbackDependencies> = {},
): Promise<EmailSendResult | null> {
  const deps = { ...defaultDependencies, ...dependencies };
  const to = deps.notifyEmail();
  if (!to) return null;
  const origin = deps.appOrigin();
  if (!origin) {
    logger.warn({ feedbackId: feedback.id }, "Tender feedback e-mail skipped because PUBLIC_APP_ORIGIN is not set");
    return { status: "skipped", reason: "PUBLIC_APP_ORIGIN must be configured" };
  }
  try {
    const result = await deps.sendEmail(buildFeedbackEmail(to, origin, feedback), `tender-feedback:${feedback.id}`);
    if (result.status === "failed") logger.warn({ feedbackId: feedback.id, reason: result.reason }, "Tender feedback e-mail failed");
    return result;
  } catch (error) {
    logger.warn({ err: error, feedbackId: feedback.id }, "Tender feedback e-mail failed");
    return { status: "failed", reason: "unexpected error", retryable: false };
  }
}

export type CreateTenderFeedbackParams = {
  tenderId: string;
  userId: string | null;
  input: TenderFeedbackInput;
  userAgent: string | null;
};

export type CreatedTenderFeedback = { id: string; status: "new"; createdAt: Date };

/** Stores the report (404 for an unknown tender) and schedules the team e-mail without waiting for it. */
export async function createTenderFeedback(
  params: CreateTenderFeedbackParams,
  dependencies: Partial<TenderFeedbackDependencies> = {},
): Promise<CreatedTenderFeedback> {
  // Loaded here so the pure validation and e-mail helpers above import without DATABASE_URL (unit tests).
  const { db, tenderFeedbackTable, tendersTable } = await import("@workspace/db");
  const [tender] = await db
    .select({ id: tendersTable.id, title: tendersTable.title })
    .from(tendersTable)
    .where(eq(tendersTable.id, params.tenderId))
    .limit(1);
  if (!tender) throw new NotFoundError(`Tender ${params.tenderId} was not found`);

  const [row] = await db
    .insert(tenderFeedbackTable)
    .values({
      tenderId: tender.id,
      userId: params.userId,
      kind: params.input.kind,
      section: params.input.section,
      message: params.input.message,
      pageUrl: params.input.pageUrl,
      userAgent: params.userAgent,
    })
    .returning({ id: tenderFeedbackTable.id, createdAt: tenderFeedbackTable.createdAt });
  const created = { id: row!.id, status: "new" as const, createdAt: row!.createdAt };

  void notifyTenderFeedback(
    { id: created.id, tenderId: tender.id, tenderTitle: tender.title, authenticated: params.userId !== null, input: params.input },
    dependencies,
  );
  return created;
}
