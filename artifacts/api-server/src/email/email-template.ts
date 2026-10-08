import type {
  NotificationChangeRecord,
  ProfileMatchNotificationRecord,
} from "@workspace/db/schema";
import {
  DIGEST_DEADLINE_LIMIT,
  nearestDeadline,
  relativeDeadlineDay,
  sortDeadlines,
  type EmailDeadlineSnapshot,
} from "./digest-deadlines";

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
  profileMatches?: ProfileMatchNotificationRecord[];
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

const quantity = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

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
    const previous = change?.from
      ? dateTime(new Date(String(change.from)))
      : null;
    const next = change?.to ? dateTime(new Date(String(change.to))) : null;
    if (previous && next) return `Prazo alterado: ${previous} → ${next}`;
    if (next) return `Novo prazo: ${next}`;
    return "O prazo foi alterado.";
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
  if (type === "tender_document_added")
    return "Novos documentos foram publicados.";
  if (type === "tender_value_changed") return "O valor estimado foi alterado.";
  if (type === "trial_ending") {
    return change?.to
      ? `Seu teste termina em ${dateTime(new Date(String(change.to)))}.`
      : "Seu período de teste está próximo do fim.";
  }
  return "Há uma nova atualização.";
};

/** App URL value for "Todos os status" (same as the frontend's search-defaults); the API never sees it. */
const ALL_STATUSES = "all";

/**
 * A saved query without `status` covers every status, but the search page opens on open tenders
 * when the URL has none, so the link says `status=all` explicitly. An explicit status is kept as is.
 */
export const savedSearchHref = (savedQuery: string): string => {
  const query = savedQuery.replace(/^\?/, "");
  if (new URLSearchParams(query).has("status")) return `/search?${query}`;
  return `/search?${query ? `${query}&` : ""}status=${ALL_STATUSES}`;
};

const notificationLink = (
  notification: EmailNotificationSnapshot,
  origin: string,
): string => {
  if (notification.tenderId) {
    return `${origin}/tenders/${encodeURIComponent(notification.tenderId)}`;
  }
  if (notification.savedSearchQuery !== null) {
    return `${origin}${savedSearchHref(notification.savedSearchQuery)}`;
  }
  if (notification.type === "profile_new_matches") return `${origin}/search?status=${ALL_STATUSES}`;
  return `${origin}/settings#notificacoes`;
};

const itemText = (
  notification: EmailNotificationSnapshot,
  origin: string,
): string => {
  if (notification.type === "saved_search_new_matches") {
    const matchCount = notification.matchCount ?? 0;
    return [
      `Busca salva: ${notification.savedSearchName ?? "Busca salva"}`,
      quantity(matchCount, "novo resultado", "novos resultados"),
      notificationLink(notification, origin),
    ].join("\n");
  }
  if (notification.type === "profile_new_matches") {
    const matches = notification.profileMatches ?? [];
    const matchCount = notification.matchCount ?? matches.length;
    const first = matches[0];
    return [
      quantity(
        matchCount,
        "novo edital com alta aderência",
        "novos editais com alta aderência",
      ),
      ...(first ? [`Destaque: ${truncate(first.title)}`] : []),
      notificationLink(notification, origin),
    ].join("\n");
  }
  if (notification.type === "trial_ending") {
    return [
      changeDescription(notification.type, notification.change),
      notificationLink(notification, origin),
    ].join("\n");
  }
  const details = [
    truncate(notification.tenderTitle ?? "Edital monitorado"),
    notification.tenderOrganizationName ?? "Órgão não informado",
  ];
  if (notification.type === "tender_deadline_changed") {
    details.push(changeDescription(notification.type, notification.change));
  } else {
    details.push(
      notification.tenderProposalDeadline
        ? `Prazo: ${dateTime(notification.tenderProposalDeadline)}`
        : "Prazo não informado",
      changeDescription(notification.type, notification.change),
    );
  }
  details.push(notificationLink(notification, origin));
  return details.join("\n");
};

const itemHtml = (
  notification: EmailNotificationSnapshot,
  origin: string,
): string => {
  const link = escapeHtml(notificationLink(notification, origin));
  if (notification.type === "saved_search_new_matches") {
    const matchCount = notification.matchCount ?? 0;
    return `<li style="margin-bottom:20px"><strong>${escapeHtml(notification.savedSearchName ?? "Busca salva")}</strong><br>${quantity(matchCount, "novo resultado", "novos resultados")}<br><a href="${link}">Ver resultados</a></li>`;
  }
  if (notification.type === "profile_new_matches") {
    const matches = notification.profileMatches ?? [];
    const matchCount = notification.matchCount ?? matches.length;
    const highlights = matches
      .slice(0, 5)
      .map(
        (match) =>
          `<li><a href="${escapeHtml(`${origin}/tenders/${encodeURIComponent(match.id)}`)}">${escapeHtml(truncate(match.title))}</a> — ${escapeHtml(match.organizationName)}</li>`,
      )
      .join("");
    return `<li style="margin-bottom:20px"><strong>${quantity(matchCount, "novo edital com alta aderência", "novos editais com alta aderência")}</strong>${highlights ? `<ul>${highlights}</ul>` : ""}<a href="${link}">Ver oportunidades</a></li>`;
  }
  if (notification.type === "trial_ending") {
    return `<li style="margin-bottom:20px"><strong>Seu teste está terminando</strong><br>${escapeHtml(changeDescription(notification.type, notification.change))}<br><a href="${link}">Ver assinatura</a></li>`;
  }
  const deadline = notification.tenderProposalDeadline
    ? dateTime(notification.tenderProposalDeadline)
    : "Não informado";
  const deadlineHtml =
    notification.type === "tender_deadline_changed"
      ? escapeHtml(changeDescription(notification.type, notification.change))
      : `Prazo: ${escapeHtml(deadline)}<br>${escapeHtml(changeDescription(notification.type, notification.change))}`;
  return `<li style="margin-bottom:20px"><strong>${escapeHtml(truncate(notification.tenderTitle ?? "Edital monitorado"))}</strong><br>Órgão: ${escapeHtml(notification.tenderOrganizationName ?? "Não informado")}<br>${deadlineHtml}<br><a href="${link}">Ver edital</a></li>`;
};

const stageLabels: Record<EmailDeadlineSnapshot["stage"], string> = {
  analyzing: "Analisando",
  participating: "Preparando documentos",
};

/** One line per tender: the closest deadline first, then the other one when it is also in the window. */
const deadlineDescription = (deadline: EmailDeadlineSnapshot, now: Date): string => {
  const when = (value: Date) => `${dateTime(value)} (${relativeDeadlineDay(value, now)})`;
  const action = deadline.nextAction?.trim();
  const personal = deadline.personalDeadline
    ? action
      ? `Seu prazo (informado por você): ${truncate(action, 200)} — ${when(deadline.personalDeadline)}`
      : `Seu prazo (informado por você): ${when(deadline.personalDeadline)}`
    : null;
  const proposal = deadline.proposalDeadline
    ? `Prazo oficial de proposta: ${when(deadline.proposalDeadline)}`
    : null;
  const parts =
    nearestDeadline(deadline) === deadline.personalDeadline ? [personal, proposal] : [proposal, personal];
  return parts.filter(Boolean).join(" · ");
};

const tenderLink = (tenderId: string, origin: string): string =>
  `${origin}/tenders/${encodeURIComponent(tenderId)}`;

const deadlinesSection = (
  deadlines: readonly EmailDeadlineSnapshot[],
  now: Date,
  origin: string,
): { text: string; html: string } | null => {
  if (deadlines.length === 0) return null;
  const sorted = sortDeadlines(deadlines);
  const shown = sorted.slice(0, DIGEST_DEADLINE_LIMIT);
  const remaining = sorted.length - shown.length;
  const savedUrl = `${origin}/saved-tenders`;
  const more =
    remaining > 0
      ? `e mais ${quantity(remaining, "edital salvo", "editais salvos")} com prazo nos próximos dias`
      : null;
  const text = [
    "Seus prazos (até o fim do 3º dia a partir de hoje, horário de Brasília)",
    "",
    shown
      .map((deadline) =>
        [
          truncate(deadline.tenderTitle, 120),
          deadline.tenderOrganizationName,
          `Sua etapa: ${stageLabels[deadline.stage]}`,
          deadlineDescription(deadline, now),
          tenderLink(deadline.tenderId, origin),
        ].join("\n"),
      )
      .join("\n\n"),
    ...(more ? ["", `${more}: ${savedUrl}`] : []),
  ].join("\n");
  const items = shown
    .map(
      (deadline) =>
        `<li style="margin-bottom:20px"><strong>${escapeHtml(truncate(deadline.tenderTitle, 120))}</strong><br>Órgão: ${escapeHtml(deadline.tenderOrganizationName)}<br>Sua etapa: ${escapeHtml(stageLabels[deadline.stage])}<br>${escapeHtml(deadlineDescription(deadline, now))}<br><a href="${escapeHtml(tenderLink(deadline.tenderId, origin))}">Ver edital</a></li>`,
    )
    .join("");
  const html = `<h3 style="font-size:17px">Seus prazos</h3><p style="font-size:13px;color:#596273">Até o fim do 3º dia a partir de hoje, no horário de Brasília. Prazos pessoais são os que você informou no Pardal Digital.</p><ul style="padding-left:20px">${items}</ul>${more ? `<p><a href="${escapeHtml(savedUrl)}">${escapeHtml(more)}</a></p>` : ""}`;
  return { text, html };
};

export const renderNotificationEmail = (input: {
  mode: "digest" | "immediate";
  notifications: EmailNotificationSnapshot[];
  origin: string;
  unsubscribeToken: string;
  /** Digest only: saved-tender deadlines ("Seus prazos"), rendered before the notifications. */
  deadlines?: readonly EmailDeadlineSnapshot[];
  now?: Date;
}) => {
  const unsubscribeApiUrl = `${input.origin}/api/v1/email/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}&scope=all`;
  const unsubscribePageUrl = `${input.origin}/descadastro?token=${encodeURIComponent(input.unsubscribeToken)}&scope=all`;
  const settingsUrl = `${input.origin}/settings#notificacoes`;
  const heading =
    input.mode === "digest"
      ? "Seu resumo diário de oportunidades"
      : "Alerta importante do Pardal Digital";
  const deadlines =
    input.mode === "digest"
      ? deadlinesSection(input.deadlines ?? [], input.now ?? new Date(), input.origin)
      : null;
  const deadlineCount = deadlines
    ? input.deadlines!.flatMap(({ personalDeadline, proposalDeadline }) => [personalDeadline, proposalDeadline]).filter(Boolean).length
    : 0;
  const why =
    input.mode === "digest"
      ? deadlines
        ? "Você recebe este resumo porque ele está ligado nas suas preferências do Pardal Digital. Os prazos vêm dos editais que você salvou nas etapas Analisando ou Preparando documentos; a etapa é sua, não o status oficial do edital."
        : "Você recebe este resumo porque ele está ligado nas suas preferências do Pardal Digital."
      : "Você recebe este aviso porque monitora este edital e os avisos imediatos estão ligados.";
  const itemsText = input.notifications
    .map((notification) => itemText(notification, input.origin))
    .join("\n\n");
  const itemsHtml = input.notifications
    .map((notification) => itemHtml(notification, input.origin))
    .join("");
  const updates = quantity(input.notifications.length, "atualização", "atualizações");
  const subject =
    input.mode === "immediate"
      ? "Pardal Digital: alerta importante em suas oportunidades"
      : deadlineCount === 0
        ? `Pardal Digital: ${updates} no seu resumo`
        : input.notifications.length === 0
          ? `Pardal Digital: ${quantity(deadlineCount, "prazo", "prazos")} nos próximos dias`
          : `Pardal Digital: ${quantity(deadlineCount, "prazo", "prazos")} e ${updates} no seu resumo`;
  const sectionsText = [
    ...(deadlines ? [deadlines.text] : []),
    ...(input.notifications.length > 0
      ? [deadlines ? `Novidades\n\n${itemsText}` : itemsText]
      : []),
  ].join("\n\n");
  const sectionsHtml = [
    ...(deadlines ? [deadlines.html] : []),
    ...(input.notifications.length > 0
      ? [
          `${deadlines ? '<h3 style="font-size:17px">Novidades</h3>' : ""}<ul style="padding-left:20px">${itemsHtml}</ul>`,
        ]
      : []),
  ].join("");

  return {
    subject,
    text: [
      "Pardal Digital",
      heading,
      "",
      sectionsText,
      "",
      why,
      `Preferências: ${settingsUrl}`,
      `Descadastrar: ${unsubscribePageUrl}`,
    ].join("\n"),
    html: `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><main style="max-width:640px;margin:auto"><h1 style="font-size:24px">Pardal Digital</h1><h2 style="font-size:20px">${escapeHtml(heading)}</h2>${sectionsHtml}<hr><p style="font-size:13px;color:#596273">${escapeHtml(why)}<br><a href="${escapeHtml(settingsUrl)}">Gerenciar preferências</a> · <a href="${escapeHtml(unsubscribePageUrl)}">Descadastrar de e-mails</a></p></main></body></html>`,
    headers: {
      "List-Unsubscribe": `<${unsubscribeApiUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
};
