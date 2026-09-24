import type { NotificationChangeRecord } from "@workspace/db/schema";

export type EmailNotificationSnapshot = {
  id: string;
  type: string;
  createdAt: Date;
  tenderId: string | null;
  tenderTitle: string | null;
  tenderOrganizationName: string | null;
  tenderProposalDeadline: Date | null;
  change: NotificationChangeRecord | null;
  savedSearchName: string | null;
  savedSearchQuery: string | null;
  matchCount: number | null;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const truncate = (value: string, maximum = 220): string =>
  value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;

const dateTime = (value: Date): string =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);

const changeDescription = (
  type: string,
  change: NotificationChangeRecord | null,
): string => {
  if (type === "tender_deadline_changed") {
    return change?.to
      ? `Novo prazo: ${dateTime(new Date(String(change.to)))}`
      : "O prazo foi alterado.";
  }
  if (type === "tender_status_changed") {
    const labels: Record<string, string> = {
      suspended: "Suspenso",
      cancelled: "Revogado",
      open: "Aberto",
      under_review: "Em análise",
      closed: "Encerrado",
    };
    return `Novo status: ${labels[String(change?.to)] ?? String(change?.to ?? "alterado")}`;
  }
  if (type === "tender_document_added") return "Novos documentos foram publicados.";
  if (type === "tender_value_changed") return "O valor estimado foi alterado.";
  if (type === "trial_ending") {
    return change?.to
      ? `Seu teste termina em ${dateTime(new Date(String(change.to)))}.`
      : "Seu período de teste está próximo do fim.";
  }
  return "Há uma nova atualização.";
};

const notificationLink = (
  notification: EmailNotificationSnapshot,
  origin: string,
): string => {
  if (notification.tenderId) {
    return `${origin}/tenders/${encodeURIComponent(notification.tenderId)}`;
  }
  if (notification.savedSearchQuery !== null) {
    const query = notification.savedSearchQuery.replace(/^\?/, "");
    return `${origin}/search${query ? `?${query}` : ""}`;
  }
  return `${origin}/settings#notificacoes`;
};

const itemText = (notification: EmailNotificationSnapshot, origin: string): string => {
  if (notification.type === "saved_search_new_matches") {
    return [
      `Busca salva: ${notification.savedSearchName ?? "Busca salva"}`,
      `${notification.matchCount ?? 0} novo(s) resultado(s)`,
      notificationLink(notification, origin),
    ].join("\n");
  }
  if (notification.type === "trial_ending") {
    return [changeDescription(notification.type, notification.change), notificationLink(notification, origin)].join("\n");
  }
  return [
    truncate(notification.tenderTitle ?? "Edital monitorado"),
    notification.tenderOrganizationName ?? "Órgão não informado",
    notification.tenderProposalDeadline
      ? `Prazo: ${dateTime(notification.tenderProposalDeadline)}`
      : "Prazo não informado",
    changeDescription(notification.type, notification.change),
    notificationLink(notification, origin),
  ].join("\n");
};

const itemHtml = (notification: EmailNotificationSnapshot, origin: string): string => {
  const link = escapeHtml(notificationLink(notification, origin));
  if (notification.type === "saved_search_new_matches") {
    return `<li style="margin-bottom:20px"><strong>${escapeHtml(notification.savedSearchName ?? "Busca salva")}</strong><br>${notification.matchCount ?? 0} novo(s) resultado(s)<br><a href="${link}">Ver resultados</a></li>`;
  }
  if (notification.type === "trial_ending") {
    return `<li style="margin-bottom:20px"><strong>Seu teste está terminando</strong><br>${escapeHtml(changeDescription(notification.type, notification.change))}<br><a href="${link}">Ver assinatura</a></li>`;
  }
  const deadline = notification.tenderProposalDeadline
    ? dateTime(notification.tenderProposalDeadline)
    : "Não informado";
  return `<li style="margin-bottom:20px"><strong>${escapeHtml(truncate(notification.tenderTitle ?? "Edital monitorado"))}</strong><br>Órgão: ${escapeHtml(notification.tenderOrganizationName ?? "Não informado")}<br>Prazo: ${escapeHtml(deadline)}<br>${escapeHtml(changeDescription(notification.type, notification.change))}<br><a href="${link}">Ver edital</a></li>`;
};

export const renderNotificationEmail = (input: {
  mode: "digest" | "immediate";
  notifications: EmailNotificationSnapshot[];
  origin: string;
  unsubscribeToken: string;
}) => {
  const unsubscribeApiUrl = `${input.origin}/api/v1/email/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}&scope=all`;
  const unsubscribePageUrl = `${input.origin}/descadastro?token=${encodeURIComponent(input.unsubscribeToken)}&scope=all`;
  const settingsUrl = `${input.origin}/settings#notificacoes`;
  const heading =
    input.mode === "digest"
      ? "Seu resumo diário de oportunidades"
      : "Alerta importante da LicitAI";
  const why =
    input.mode === "digest"
      ? "Você recebeu este e-mail porque ativou o resumo diário de notificações."
      : "Você recebeu este e-mail porque ativou alertas imediatos para eventos críticos.";
  const itemsText = input.notifications
    .map((notification) => itemText(notification, input.origin))
    .join("\n\n");
  const itemsHtml = input.notifications
    .map((notification) => itemHtml(notification, input.origin))
    .join("");

  return {
    subject:
      input.mode === "digest"
        ? `LicitAI: ${input.notifications.length} atualização(ões) no seu resumo`
        : "LicitAI: alerta importante em suas oportunidades",
    text: [
      "LicitAI",
      heading,
      "",
      itemsText,
      "",
      why,
      `Preferências: ${settingsUrl}`,
      `Descadastrar: ${unsubscribePageUrl}`,
    ].join("\n"),
    html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><main style="max-width:640px;margin:auto"><h1 style="font-size:24px">LicitAI</h1><h2 style="font-size:20px">${escapeHtml(heading)}</h2><ul style="padding-left:20px">${itemsHtml}</ul><hr><p style="font-size:13px;color:#596273">${escapeHtml(why)}<br><a href="${escapeHtml(settingsUrl)}">Gerenciar preferências</a> · <a href="${escapeHtml(unsubscribePageUrl)}">Descadastrar de e-mails</a></p></main></body></html>`,
    headers: {
      "List-Unsubscribe": `<${unsubscribeApiUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
};
