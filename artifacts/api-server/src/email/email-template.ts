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

/*
 * HTML layout. E-mail clients ignore most CSS, so the markup uses nested tables and inline styles only.
 * Colors are the light-theme values of the design-system tokens (artifacts/licitainsight/src/index.css),
 * converted to hex because many clients do not support hsl(). Keep them in sync when the tokens change.
 */
const colors = {
  canvas: "#F4F5EF", // --background
  surface: "#FFFEFA", // --surface
  ink: "#173944", // --foreground
  muted: "#506B6D", // --muted-foreground
  border: "#D5E2DC", // --border
  link: "#226F7C", // --primary
  tag: "#DBEBE6", // --primary-subtle
  tagInk: "#185C68", // --primary-subtle-foreground
  warning: "#FDF2D8", // --warning-subtle
  warningInk: "#814508", // --warning-subtle-foreground
  action: "#39F3F3", // --action
  actionInk: "#123E49", // --action-foreground
  brand: "#183E4E", // --sidebar (petroleum blue)
  brandInk: "#E3EDE9", // --sidebar-foreground
  brandMuted: "#B7D2BC", // --accent (sage)
} as const;

const sans = "'DM Sans',Arial,Helvetica,sans-serif";
const mono = "'Space Mono',SFMono-Regular,Menlo,Consolas,monospace";

type Tone = "default" | "warning";

/** Small mono label above an item title: what kind of update this is. */
const tagHtml = (label: string, tone: Tone = "default"): string => {
  const [background, color] =
    tone === "warning" ? [colors.warning, colors.warningInk] : [colors.tag, colors.tagInk];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${background};color:${color};font-family:${mono};font-size:11px;line-height:16px;letter-spacing:0.04em;text-transform:uppercase">${escapeHtml(label)}</span>`;
};

const linkHtml = (href: string, label: string): string =>
  `<a href="${escapeHtml(href)}" style="color:${colors.link};font-weight:600;text-decoration:underline">${escapeHtml(label)}</a>`;

const metaHtml = (html: string): string =>
  `<p style="margin:4px 0 0;font-size:14px;line-height:21px;color:${colors.muted}">${html}</p>`;

const emphasisHtml = (html: string): string =>
  `<p style="margin:8px 0 0;font-size:14px;line-height:21px;color:${colors.ink};font-weight:600">${html}</p>`;

/**
 * One row of the list. `body` is already-escaped HTML. `count` shows a big number on the right
 * (results, matches) so the reader can scan the e-mail by size of the news.
 */
const itemBlock = (item: {
  tag: string;
  tone?: Tone;
  title: string;
  body: string;
  cta: string;
  count?: { value: number; label: string };
  /** False for the first row when no section heading sits above it (the header already separates it). */
  divider?: boolean;
}): string => {
  const countCell = item.count
    ? `<td valign="top" align="right" width="72" style="padding-left:16px;font-family:${mono};color:${colors.ink}"><div style="font-size:28px;line-height:32px;font-weight:700">${item.count.value}</div><div style="font-size:11px;line-height:16px;color:${colors.muted};text-transform:uppercase;letter-spacing:0.04em">${escapeHtml(item.count.label)}</div></td>`
    : "";
  const rule = item.divider === false ? "" : `;border-top:1px solid ${colors.border}`;
  return `<tr><td style="padding:20px 0${rule}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top" style="font-family:${sans};color:${colors.ink}">${tagHtml(item.tag, item.tone)}<p style="margin:8px 0 0;font-size:17px;line-height:24px;font-weight:700;color:${colors.ink}">${item.title}</p>${item.body}<p style="margin:12px 0 0;font-size:14px;line-height:20px">${item.cta}</p></td>${countCell}</tr></table></td></tr>`;
};

const itemsTable = (rows: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;

const sectionHeading = (title: string, note?: string): string =>
  `<h3 style="margin:32px 0 12px;font-family:${mono};font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${colors.muted}">${escapeHtml(title)}</h3>${note ? `<p style="margin:-4px 0 16px;font-size:13px;line-height:19px;color:${colors.muted}">${escapeHtml(note)}</p>` : ""}`;

const tenderTags: Record<string, { label: string; tone: Tone }> = {
  tender_deadline_changed: { label: "Prazo alterado", tone: "warning" },
  tender_status_changed: { label: "Status alterado", tone: "warning" },
  tender_document_added: { label: "Novos documentos", tone: "default" },
  tender_value_changed: { label: "Valor alterado", tone: "default" },
};

const itemHtml = (
  notification: EmailNotificationSnapshot,
  origin: string,
  divider: boolean,
): string => {
  const link = notificationLink(notification, origin);
  if (notification.type === "saved_search_new_matches") {
    const matchCount = notification.matchCount ?? 0;
    return itemBlock({
      tag: "Busca salva",
      title: escapeHtml(notification.savedSearchName ?? "Busca salva"),
      body: metaHtml(quantity(matchCount, "novo resultado", "novos resultados")),
      cta: linkHtml(link, "Ver resultados"),
      count: { value: matchCount, label: matchCount === 1 ? "novo" : "novos" },
      divider,
    });
  }
  if (notification.type === "profile_new_matches") {
    const matches = notification.profileMatches ?? [];
    const matchCount = notification.matchCount ?? matches.length;
    const highlights = matches
      .slice(0, 5)
      .map(
        (match) =>
          `<tr><td style="padding:10px 0 0;font-family:${sans}"><a href="${escapeHtml(`${origin}/tenders/${encodeURIComponent(match.id)}`)}" style="color:${colors.link};font-size:14px;line-height:20px;font-weight:600;text-decoration:none">${escapeHtml(truncate(match.title))}</a><br><span style="font-size:13px;line-height:19px;color:${colors.muted}">${escapeHtml(match.organizationName)}</span></td></tr>`,
      )
      .join("");
    return itemBlock({
      tag: "Aderência ao perfil",
      title: matchCount === 1 ? "Novo edital com alta aderência" : "Novos editais com alta aderência",
      body: highlights
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px">${highlights}</table>`
        : metaHtml(quantity(matchCount, "novo edital", "novos editais")),
      cta: `<a href="${escapeHtml(link)}" style="color:${colors.link};font-weight:600;text-decoration:underline">Ver oportunidades</a>`,
      count: { value: matchCount, label: matchCount === 1 ? "edital" : "editais" },
      divider,
    });
  }
  if (notification.type === "trial_ending") {
    return itemBlock({
      tag: "Assinatura",
      tone: "warning",
      title: "Seu teste está terminando",
      body: metaHtml(escapeHtml(changeDescription(notification.type, notification.change))),
      cta: linkHtml(link, "Ver assinatura"),
      divider,
    });
  }
  const tag = tenderTags[notification.type] ?? { label: "Edital monitorado", tone: "default" as Tone };
  const change = escapeHtml(changeDescription(notification.type, notification.change));
  const deadline =
    notification.type === "tender_deadline_changed"
      ? ""
      : metaHtml(
          `Prazo: <span style="font-family:${mono};color:${colors.ink}">${escapeHtml(notification.tenderProposalDeadline ? dateTime(notification.tenderProposalDeadline) : "Não informado")}</span>`,
        );
  return itemBlock({
    tag: tag.label,
    tone: tag.tone,
    title: escapeHtml(truncate(notification.tenderTitle ?? "Edital monitorado")),
    body: `${metaHtml(`Órgão: ${escapeHtml(notification.tenderOrganizationName ?? "Não informado")}`)}${emphasisHtml(change)}${deadline}`,
    cta: linkHtml(link, "Ver edital"),
    divider,
  });
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
    .map((deadline) => {
      const soon = ["hoje", "amanhã"].includes(relativeDeadlineDay(nearestDeadline(deadline), now));
      return itemBlock({
        tag: `Sua etapa: ${stageLabels[deadline.stage]}`,
        tone: soon ? "warning" : "default",
        title: escapeHtml(truncate(deadline.tenderTitle, 120)),
        body: `${metaHtml(`Órgão: ${escapeHtml(deadline.tenderOrganizationName)}`)}${emphasisHtml(escapeHtml(deadlineDescription(deadline, now)))}`,
        cta: linkHtml(tenderLink(deadline.tenderId, origin), "Ver edital"),
      });
    })
    .join("");
  const html = `${sectionHeading(
    "Seus prazos",
    "Até o fim do 3º dia a partir de hoje, no horário de Brasília. Prazos pessoais são os que você informou no Pardal Digital.",
  )}${itemsTable(items)}${more ? `<p style="margin:4px 0 0;font-size:14px;line-height:20px">${linkHtml(savedUrl, more)}</p>` : ""}`;
  return { text, html };
};

const longDate = (value: Date): string =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);

export const renderNotificationEmail = (input: {
  mode: "digest" | "immediate";
  notifications: EmailNotificationSnapshot[];
  origin: string;
  unsubscribeToken: string;
  /** Digest only: saved-tender deadlines ("Seus prazos"), rendered before the notifications. */
  deadlines?: readonly EmailDeadlineSnapshot[];
  now?: Date;
}) => {
  const now = input.now ?? new Date();
  const unsubscribeApiUrl = `${input.origin}/api/v1/email/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}&scope=all`;
  const unsubscribePageUrl = `${input.origin}/descadastro?token=${encodeURIComponent(input.unsubscribeToken)}&scope=all`;
  const settingsUrl = `${input.origin}/settings#notificacoes`;
  const dashboardUrl = `${input.origin}/dashboard`;
  const heading =
    input.mode === "digest"
      ? "Seu resumo diário de oportunidades"
      : "Alerta importante do Pardal Digital";
  const deadlines =
    input.mode === "digest"
      ? deadlinesSection(input.deadlines ?? [], now, input.origin)
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
    .map((notification, index) => itemHtml(notification, input.origin, deadlines !== null || index > 0))
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
  const summary =
    input.mode === "immediate"
      ? `${updates} em um edital que você monitora.`
      : [
          ...(deadlineCount > 0 ? [`${quantity(deadlineCount, "prazo", "prazos")} nos próximos dias`] : []),
          ...(input.notifications.length > 0 ? [updates] : []),
        ].join(" e ") + ".";
  const eyebrow = input.mode === "digest" ? `Resumo diário · ${longDate(now)}` : "Alerta imediato";
  const sectionsText = [
    ...(deadlines ? [deadlines.text] : []),
    ...(input.notifications.length > 0
      ? [deadlines ? `Novidades\n\n${itemsText}` : itemsText]
      : []),
  ].join("\n\n");
  const sectionsHtml = [
    ...(deadlines ? [deadlines.html] : []),
    ...(input.notifications.length > 0
      ? [`${deadlines ? sectionHeading("Novidades") : ""}${itemsTable(itemsHtml)}`]
      : []),
  ].join("");
  // One primary action per e-mail: the digest closes with a button to the app; an immediate alert already has its own link.
  const primaryAction =
    input.mode === "digest"
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px"><tr><td bgcolor="${colors.action}" style="border-radius:8px"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 22px;font-family:${sans};font-size:15px;line-height:20px;font-weight:700;color:${colors.actionInk};text-decoration:none;border-radius:8px">Abrir o Pardal Digital</a></td></tr></table>`
      : "";

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<style>
@media (max-width:620px){.pd-pad{padding-left:20px!important;padding-right:20px!important}.pd-outer{padding:0!important}}
</style>
</head>
<body style="margin:0;padding:0;background:${colors.canvas};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(summary)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.canvas}" style="background:${colors.canvas}">
<tr><td align="center" class="pd-outer" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${sans};color:${colors.ink}">
<tr><td class="pd-pad" bgcolor="${colors.brand}" style="background:${colors.brand};padding:28px 32px;border-radius:12px 12px 0 0">
<p style="margin:0;font-size:18px;line-height:24px;font-weight:700;letter-spacing:-0.01em;color:#FFFFFF">Pardal Digital</p>
<p style="margin:20px 0 0;font-family:${mono};font-size:11px;line-height:16px;letter-spacing:0.08em;text-transform:uppercase;color:${colors.brandMuted}">${escapeHtml(eyebrow)}</p>
<h1 style="margin:6px 0 0;font-size:24px;line-height:31px;font-weight:700;letter-spacing:-0.015em;color:#FFFFFF">${escapeHtml(heading)}</h1>
<p style="margin:8px 0 0;font-size:15px;line-height:22px;color:${colors.brandInk}">${escapeHtml(summary)}</p>
</td></tr>
<tr><td class="pd-pad" bgcolor="${colors.surface}" style="background:${colors.surface};padding:8px 32px 32px;border:1px solid ${colors.border};border-top:0;border-radius:0 0 12px 12px">
${sectionsHtml}${primaryAction}
</td></tr>
<tr><td class="pd-pad" style="padding:24px 32px 8px;font-size:12px;line-height:18px;color:${colors.muted}">
<p style="margin:0">${escapeHtml(why)}</p>
<p style="margin:10px 0 0"><a href="${escapeHtml(settingsUrl)}" style="color:${colors.link};text-decoration:underline">Gerenciar preferências</a> &nbsp;·&nbsp; <a href="${escapeHtml(unsubscribePageUrl)}" style="color:${colors.link};text-decoration:underline">Descadastrar de e-mails</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

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
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribeApiUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
};
