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
import type { EmailTenderHighlight } from "../ai/tender-highlights-policy";


/** Tenders cited per saved-search card: the first ones of the snapshot that have highlights. */
export const SAVED_SEARCH_HIGHLIGHT_LIMIT = 3;

export type EmailNotificationSnapshot = {
  id: string;
  type: string;
  createdAt: Date;
  tenderId: string | null;
  tenderTitle: string | null;
  tenderOrganizationName: string | null;
  tenderProposalDeadline: Date | null;
  change: NotificationChangeRecord | null;
  savedSearchId?: string | null;
  savedSearchName: string | null;
  savedSearchQuery: string | null;
  matchCount: number | null;
  /** Saved-search snapshot ids, in arrival order; only used to pick the tenders whose highlights are shown. */
  tenderIds?: string[];
  profileMatches?: ProfileMatchNotificationRecord[];
  /** Digest card of several `saved_search_new_matches` of the same saved search (see groupSavedSearchNotifications). */
  groupedCount?: number;
};

/**
 * One digest card per saved search: rows older than the daily notification (one per evaluation cycle) and a day's
 * continuation after an e-mail would otherwise each be a card. The card keeps the place of the first row, sums
 * `matchCount` and takes id (link), name and query from the most recent row, whose snapshot link stays valid.
 */
export const groupSavedSearchNotifications = <T extends EmailNotificationSnapshot>(
  notifications: readonly T[],
): Array<T & Pick<EmailNotificationSnapshot, "groupedCount">> => {
  const grouped: Array<T & Pick<EmailNotificationSnapshot, "groupedCount">> = [];
  const bySearch = new Map<string, number>();
  for (const notification of notifications) {
    const searchId = notification.type === "saved_search_new_matches" ? notification.savedSearchId : null;
    const index = searchId ? bySearch.get(searchId) : undefined;
    if (!searchId || index === undefined) {
      if (searchId) bySearch.set(searchId, grouped.length);
      grouped.push(notification);
      continue;
    }
    const card = grouped[index]!;
    const latest = notification.createdAt >= card.createdAt ? notification : card;
    grouped[index] = {
      ...latest,
      matchCount: (card.matchCount ?? 0) + (notification.matchCount ?? 0),
      ...(card.tenderIds || notification.tenderIds
        ? { tenderIds: [...new Set([...(card.tenderIds ?? []), ...(notification.tenderIds ?? [])])] }
        : {}),
      groupedCount: (card.groupedCount ?? 1) + 1,
    };
  }
  return grouped;
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

const notificationSearchHref = (notificationId: string): string => {
  const params = new URLSearchParams({ status: ALL_STATUSES, notification: notificationId });
  return `/search?${params}`;
};

const notificationLink = (
  notification: EmailNotificationSnapshot,
  origin: string,
): string => {
  if (notification.type === "saved_search_new_matches") {
    return `${origin}${notificationSearchHref(notification.id)}`;
  }
  if (notification.type === "profile_new_matches" && (notification.matchCount ?? notification.profileMatches?.length ?? 0) > 1) {
    return `${origin}${notificationSearchHref(notification.id)}`;
  }
  if (notification.tenderId) {
    return `${origin}/tenders/${encodeURIComponent(notification.tenderId)}`;
  }
  if (notification.savedSearchQuery !== null) {
    return `${origin}${savedSearchHref(notification.savedSearchQuery)}`;
  }
  if (notification.type === "profile_new_matches") return `${origin}/search?status=${ALL_STATUSES}`;
  return `${origin}/settings#notificacoes`;
};

/** A grouped card also links the saved search itself: the snapshot link only holds the latest row's ids. */
const groupedSearchLink = (
  notification: EmailNotificationSnapshot,
  origin: string,
): string | null =>
  (notification.groupedCount ?? 1) > 1 && notification.savedSearchQuery !== null
    ? `${origin}${savedSearchHref(notification.savedSearchQuery)}`
    : null;

type Highlights = ReadonlyMap<string, EmailTenderHighlight>;

/** The saved search's cited tenders: the first ones of the snapshot that have something to say. */
const savedSearchHighlights = (
  notification: EmailNotificationSnapshot,
  highlights: Highlights,
): EmailTenderHighlight[] =>
  (notification.tenderIds ?? [])
    .map((tenderId) => highlights.get(tenderId))
    .filter((highlight): highlight is EmailTenderHighlight => Boolean(highlight?.lines.length))
    .slice(0, SAVED_SEARCH_HIGHLIGHT_LIMIT);

const highlightLinesText = (lines: readonly string[]): string[] =>
  lines.map((line) => `  • ${line}`);

const itemText = (
  notification: EmailNotificationSnapshot,
  origin: string,
  highlights: Highlights,
): string => {
  if (notification.type === "saved_search_new_matches") {
    const matchCount = notification.matchCount ?? 0;
    const searchLink = groupedSearchLink(notification, origin);
    const cited = savedSearchHighlights(notification, highlights);
    return [
      `Busca salva: ${notification.savedSearchName ?? "Busca salva"}`,
      quantity(matchCount, "novo resultado", "novos resultados"),
      ...(cited.length > 0
        ? [
            "Destaques:",
            ...cited.flatMap((tender) => [
              `- ${truncate(tender.title, 120)}`,
              ...highlightLinesText(tender.lines),
              `  ${tenderLink(tender.tenderId, origin)}`,
            ]),
          ]
        : []),
      searchLink
        ? `Últimos resultados: ${notificationLink(notification, origin)}`
        : notificationLink(notification, origin),
      ...(searchLink ? [`Abrir a busca salva: ${searchLink}`] : []),
    ].join("\n");
  }
  if (notification.type === "profile_new_matches") {
    const matches = notification.profileMatches ?? [];
    const matchCount = notification.matchCount ?? matches.length;
    const first = matches[0];
    const lines = first ? (highlights.get(first.id)?.lines ?? []) : [];
    return [
      quantity(
        matchCount,
        "novo edital com alta aderência",
        "novos editais com alta aderência",
      ),
      ...(first ? [`Destaque: ${truncate(first.title)}`, ...highlightLinesText(lines)] : []),
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
 * HTML layout, following the Pardal brand book (design system "Pardal": petróleo, lima, aqua and creme,
 * rounded shapes, lots of cream breathing room). E-mail clients ignore most CSS, so the markup uses nested
 * tables and inline styles only, with hex values because many clients do not support hsl() or var().
 * Keep these in sync with the design system's tokens.json when it changes.
 */
const colors = {
  page: "#F6F3ED", // fundo (creme-claro)
  card: "#EFEBE1", // fundo-alt (creme)
  ink: "#164C49", // texto (petroleo): 8.2:1 on creme, 8.8:1 on creme-claro
  inverse: "#00464E", // superficie-inversa (petroleo-profundo)
  inverseInk: "#F6F3ED", // texto-inverso (creme-claro): 9.6:1 on petroleo-profundo
  highlight: "#D9F58B", // destaque (lima): the one primary button per e-mail
  aqua: "#9ED6D1", // tags; petroleo on it 6.0:1
  line: "#CBD0C8", // linha (nevoa): decorative dividers only
} as const;

/** Qurova / Nexa are licensed; Quicksand and Montserrat are the brand's stand-ins, then system fonts. */
const titleFont = "Qurova,Quicksand,'Trebuchet MS',Arial,sans-serif";
const textFont = "Nexa,Montserrat,Arial,Helvetica,sans-serif";

/**
 * The stand-in fonts, served by the app itself (artifacts/licitainsight/public/fonts), never by a third-party CDN.
 * Apple Mail and iOS load them; Gmail and Outlook ignore @font-face and fall back to Arial.
 */
const fontFaces = (origin: string): string =>
  [
    ["Quicksand", "quicksand-latin-wght-normal.woff2", "300 700"],
    ["Montserrat", "montserrat-latin-wght-normal.woff2", "100 900"],
  ]
    .map(
      ([family, file, weight]) =>
        `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url('${escapeHtml(`${origin}/fonts/${file}`)}') format('woff2')}`,
    )
    .join("\n");

/**
 * The official lima logo for the petróleo profundo header, rendered at 2x (320×272) from
 * artifacts/licitainsight/public/brand/pardal-logo-lima.svg and served by the app. PNG because Gmail blocks SVG.
 * The URL is the same for every recipient, so loading it does not tell who opened the e-mail.
 */
const LOGO_PATH = "/brand/email/pardal-logo-lima-2x.png";

type Tone = "default" | "urgent";

/** `rotulo` style: the only uppercase text in the brand. Urgent tags invert to petróleo profundo. */
const tagHtml = (label: string, tone: Tone = "default"): string => {
  const [background, color] =
    tone === "urgent" ? [colors.inverse, colors.inverseInk] : [colors.aqua, colors.ink];
  return `<span style="display:inline-block;padding:4px 10px;border-radius:8px;background:${background};color:${color};font-family:${textFont};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase">${escapeHtml(label)}</span>`;
};

const linkHtml = (href: string, label: string): string =>
  `<a href="${escapeHtml(href)}" style="color:${colors.ink};font-weight:700;text-decoration:underline">${escapeHtml(label)}</a>`;

const metaHtml = (html: string): string =>
  `<p style="margin:6px 0 0;font-size:14px;line-height:20px;color:${colors.ink}">${html}</p>`;

const emphasisHtml = (html: string): string =>
  `<p style="margin:12px 0 0;font-size:15px;line-height:23px;color:${colors.ink};font-weight:700">${html}</p>`;

/**
 * One item: a creme card (fundo-alt, raio-md) on the creme-claro page. `body` is already-escaped HTML.
 * `count` shows a big number on the right (results, matches) so the reader can scan by size of the news.
 */
const itemBlock = (item: {
  tag: string;
  tone?: Tone;
  title: string;
  body: string;
  cta: string;
  count?: { value: number; label: string };
}): string => {
  const countCell = item.count
    ? `<td valign="top" align="right" width="72" style="padding-left:16px;color:${colors.ink}"><div style="font-family:${titleFont};font-size:36px;line-height:40px;font-weight:500">${item.count.value}</div><div style="font-family:${textFont};font-size:12px;line-height:16px;letter-spacing:0.06em;text-transform:uppercase">${escapeHtml(item.count.label)}</div></td>`
    : "";
  return `<tr><td style="padding:0 0 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.card}" style="background:${colors.card};border-radius:14px"><tr><td class="pd-card" style="padding:24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top" style="font-family:${textFont};color:${colors.ink}">${tagHtml(item.tag, item.tone)}<p style="margin:12px 0 0;font-family:${titleFont};font-size:20px;line-height:27px;font-weight:500;color:${colors.ink}">${item.title}</p>${item.body}<p style="margin:16px 0 0;font-size:15px;line-height:20px">${item.cta}</p></td>${countCell}</tr></table></td></tr></table></td></tr>`;
};

const itemsTable = (rows: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;

const sectionHeading = (title: string, note?: string): string =>
  `<h3 style="margin:16px 0 ${note ? "6px" : "16px"};font-family:${textFont};font-size:13px;line-height:16px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${colors.ink}">${escapeHtml(title)}</h3>${note ? `<p style="margin:0 0 16px;font-family:${textFont};font-size:14px;line-height:20px;color:${colors.ink}">${escapeHtml(note)}</p>` : ""}`;

const tenderTags: Record<string, { label: string; tone: Tone }> = {
  tender_deadline_changed: { label: "Prazo alterado", tone: "urgent" },
  tender_status_changed: { label: "Status alterado", tone: "urgent" },
  tender_document_added: { label: "Novos documentos", tone: "default" },
  tender_value_changed: { label: "Valor alterado", tone: "default" },
};

/** Highlight lines under a cited tender: plain sentences, one per line, readable without the app. */
const highlightLinesHtml = (lines: readonly string[]): string =>
  lines.length === 0
    ? ""
    : `<br><span style="display:inline-block;margin-top:4px;font-size:14px;line-height:21px;color:${colors.ink}">${lines.map((line) => `&#8226;&nbsp;${escapeHtml(line)}`).join("<br>")}</span>`;

const citedTenderRow = (
  tender: { id: string; title: string; organizationName: string },
  lines: readonly string[],
  origin: string,
): string =>
  `<tr><td style="padding:12px 0 0;font-family:${textFont}"><a href="${escapeHtml(tenderLink(tender.id, origin))}" style="color:${colors.ink};font-size:15px;line-height:21px;font-weight:700;text-decoration:none">${escapeHtml(truncate(tender.title))}</a><br><span style="font-size:14px;line-height:20px;color:${colors.ink}">${escapeHtml(tender.organizationName)}</span>${highlightLinesHtml(lines)}</td></tr>`;

const citedTendersTable = (rows: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px">${rows}</table>`;

const itemHtml = (
  notification: EmailNotificationSnapshot,
  origin: string,
  highlights: Highlights,
): string => {
  const link = notificationLink(notification, origin);
  if (notification.type === "saved_search_new_matches") {
    const matchCount = notification.matchCount ?? 0;
    const searchLink = groupedSearchLink(notification, origin);
    const cited = savedSearchHighlights(notification, highlights);
    return itemBlock({
      tag: "Busca salva",
      title: escapeHtml(notification.savedSearchName ?? "Busca salva"),
      body: `${metaHtml(quantity(matchCount, "novo resultado", "novos resultados"))}${
        cited.length > 0
          ? `${emphasisHtml(cited.length === 1 ? "Destaque" : "Destaques")}${citedTendersTable(
              cited
                .map((tender) =>
                  citedTenderRow({ id: tender.tenderId, title: tender.title, organizationName: tender.organizationName }, tender.lines, origin),
                )
                .join(""),
            )}`
          : ""
      }`,
      cta: searchLink
        ? `${linkHtml(link, "Ver os últimos resultados")} &nbsp;·&nbsp; ${linkHtml(searchLink, "Abrir a busca salva")}`
        : linkHtml(link, "Ver resultados"),
      count: { value: matchCount, label: matchCount === 1 ? "novo" : "novos" },
    });
  }
  if (notification.type === "profile_new_matches") {
    const matches = notification.profileMatches ?? [];
    const matchCount = notification.matchCount ?? matches.length;
    const rows = matches
      .slice(0, 5)
      .map((match) => citedTenderRow(match, highlights.get(match.id)?.lines ?? [], origin))
      .join("");
    return itemBlock({
      tag: "Aderência ao perfil",
      title: matchCount === 1 ? "Novo edital com alta aderência" : "Novos editais com alta aderência",
      body: rows
        ? citedTendersTable(rows)
        : metaHtml(quantity(matchCount, "novo edital", "novos editais")),
      cta: `<a href="${escapeHtml(link)}" style="color:${colors.ink};font-weight:700;text-decoration:underline">Ver oportunidades</a>`,
      count: { value: matchCount, label: matchCount === 1 ? "edital" : "editais" },
    });
  }
  if (notification.type === "trial_ending") {
    return itemBlock({
      tag: "Assinatura",
      tone: "urgent",
      title: "Seu teste está terminando",
      body: metaHtml(escapeHtml(changeDescription(notification.type, notification.change))),
      cta: linkHtml(link, "Ver assinatura"),
    });
  }
  const tag = tenderTags[notification.type] ?? { label: "Edital monitorado", tone: "default" as Tone };
  const change = escapeHtml(changeDescription(notification.type, notification.change));
  const deadline =
    notification.type === "tender_deadline_changed"
      ? ""
      : metaHtml(
          `Prazo: ${escapeHtml(notification.tenderProposalDeadline ? dateTime(notification.tenderProposalDeadline) : "Não informado")}`,
        );
  return itemBlock({
    tag: tag.label,
    tone: tag.tone,
    title: escapeHtml(truncate(notification.tenderTitle ?? "Edital monitorado")),
    body: `${metaHtml(`Órgão: ${escapeHtml(notification.tenderOrganizationName ?? "Não informado")}`)}${emphasisHtml(change)}${deadline}`,
    cta: linkHtml(link, "Ver edital"),
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
        tone: soon ? "urgent" : "default",
        title: escapeHtml(truncate(deadline.tenderTitle, 120)),
        body: `${metaHtml(`Órgão: ${escapeHtml(deadline.tenderOrganizationName)}`)}${emphasisHtml(escapeHtml(deadlineDescription(deadline, now)))}`,
        cta: linkHtml(tenderLink(deadline.tenderId, origin), "Ver edital"),
      });
    })
    .join("");
  const html = `${sectionHeading(
    "Seus prazos",
    "Até o fim do 3º dia a partir de hoje, no horário de Brasília. Prazos pessoais são os que você informou no Pardal Digital.",
  )}${itemsTable(items)}${more ? `<p style="margin:0;font-family:${textFont};font-size:15px;line-height:22px">${linkHtml(savedUrl, more)}</p>` : ""}`;
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
  /** Highlights of the cited tenders, by tender id (see ai/tender-highlights.ts); absent tenders render as before. */
  highlights?: ReadonlyMap<string, EmailTenderHighlight>;
  now?: Date;
}) => {
  const highlights = input.highlights ?? new Map<string, EmailTenderHighlight>();
  const now = input.now ?? new Date();
  const notifications = groupSavedSearchNotifications(input.notifications);
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
  const itemsText = notifications
    .map((notification) => itemText(notification, input.origin, highlights))
    .join("\n\n");
  const itemsHtml = notifications
    .map((notification) => itemHtml(notification, input.origin, highlights))
    .join("");
  const updates = quantity(notifications.length, "atualização", "atualizações");
  const subject =
    input.mode === "immediate"
      ? "Pardal Digital: alerta importante em suas oportunidades"
      : deadlineCount === 0
        ? `Pardal Digital: ${updates} no seu resumo`
        : notifications.length === 0
          ? `Pardal Digital: ${quantity(deadlineCount, "prazo", "prazos")} nos próximos dias`
          : `Pardal Digital: ${quantity(deadlineCount, "prazo", "prazos")} e ${updates} no seu resumo`;
  const summary =
    input.mode === "immediate"
      ? `${updates} em um edital que você monitora.`
      : [
          ...(deadlineCount > 0 ? [`${quantity(deadlineCount, "prazo", "prazos")} nos próximos dias`] : []),
          ...(notifications.length > 0 ? [updates] : []),
        ].join(" e ") + ".";
  const eyebrow = input.mode === "digest" ? `Resumo diário · ${longDate(now)}` : "Alerta imediato";
  const sectionsText = [
    ...(deadlines ? [deadlines.text] : []),
    ...(notifications.length > 0
      ? [deadlines ? `Novidades\n\n${itemsText}` : itemsText]
      : []),
  ].join("\n\n");
  const sectionsHtml = [
    ...(deadlines ? [deadlines.html] : []),
    ...(notifications.length > 0
      ? [`${deadlines ? sectionHeading("Novidades") : ""}${itemsTable(itemsHtml)}`]
      : []),
  ].join("");
  // One primary action per e-mail (one lima highlight per screen): the digest closes with a button to the app;
  // an immediate alert already has its own link.
  const primaryAction =
    input.mode === "digest"
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr><td bgcolor="${colors.highlight}" style="border-radius:999px"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:14px 28px;font-family:${textFont};font-size:16px;line-height:20px;font-weight:700;color:${colors.ink};text-decoration:none;border-radius:999px">Abrir o Pardal Digital</a></td></tr></table>`
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
${fontFaces(input.origin)}
@media (max-width:620px){.pd-outer{padding:16px 12px!important}.pd-hero{padding:24px!important}.pd-card{padding:20px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:${colors.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(summary)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.page}" style="background:${colors.page}">
<tr><td align="center" class="pd-outer" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;font-family:${textFont};color:${colors.ink}">
<tr><td class="pd-hero" bgcolor="${colors.inverse}" style="background:${colors.inverse};padding:32px;border-radius:24px">
<img src="${escapeHtml(`${input.origin}${LOGO_PATH}`)}" width="160" height="136" alt="Pardal Digital" style="display:block;width:160px;height:136px;border:0;outline:none;text-decoration:none;font-family:${titleFont};font-size:24px;line-height:32px;color:${colors.inverseInk}">
<p style="margin:32px 0 0;font-family:${textFont};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${colors.highlight}">${escapeHtml(eyebrow)}</p>
<h1 style="margin:8px 0 0;font-family:${titleFont};font-size:30px;line-height:38px;font-weight:500;color:${colors.inverseInk}">${escapeHtml(heading)}</h1>
<p style="margin:8px 0 0;font-family:${textFont};font-size:16px;line-height:24px;color:${colors.inverseInk}">${escapeHtml(summary)}</p>
</td></tr>
<tr><td style="padding:24px 0 0">
${sectionsHtml}${primaryAction}
</td></tr>
<tr><td style="padding:32px 0 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${colors.line};font-size:0;line-height:0">&nbsp;</td></tr></table>
<p style="margin:20px 0 0;font-family:${textFont};font-size:13px;line-height:20px;color:${colors.ink}">${escapeHtml(why)}</p>
<p style="margin:12px 0 0;font-family:${textFont};font-size:13px;line-height:20px"><a href="${escapeHtml(settingsUrl)}" style="color:${colors.ink};text-decoration:underline">Gerenciar preferências</a> &nbsp;·&nbsp; <a href="${escapeHtml(unsubscribePageUrl)}" style="color:${colors.ink};text-decoration:underline">Descadastrar de e-mails</a></p>
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
