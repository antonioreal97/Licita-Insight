import { textFromHtml } from "./funding-parsers";
import {
  internationalLanguageLabels,
  languageCode,
  placeFromName,
} from "./international-countries";
import { dayOfTimestamp, localDeadline } from "./international-deadline";
import {
  internationalDraft,
  type InternationalOpportunityDraft,
} from "./international-draft";
import { worldBankEligibility } from "./international-eligibility";

/** Procurement Notices API of the World Bank (dataset DS00979, CC BY 4.0). */
export const WORLD_BANK_NOTICES_URL =
  "https://search.worldbank.org/api/v2/procnotices";
export const WORLD_BANK_ROBOTS_URL = "https://search.worldbank.org/robots.txt";
export const WORLD_BANK_PAGE_SIZE = 100;

/**
 * Fields asked from the API. The contact person, e-mail, phone and address are left out on purpose: the hub
 * does not need them and they are personal data.
 */
const FIELDS = [
  "id",
  "notice_type",
  "notice_status",
  "noticedate",
  "notice_lang_name",
  "submission_deadline_date",
  "submission_deadline_time",
  "submission_date",
  "project_ctry_name",
  "project_id",
  "project_name",
  "bid_reference_no",
  "bid_description",
  "procurement_group",
  "procurement_method_code",
  "procurement_method_name",
  "contact_organization",
  "notice_text",
];

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * One page of notices whose deadline is still ahead. The window starts yesterday (UTC) so a notice that
 * closes today in a zone ahead of UTC is still read; the parser drops what is already past.
 */
export const worldBankPageUrl = (offset: number, now: Date): string => {
  const params = new URLSearchParams({
    format: "json",
    rows: String(WORLD_BANK_PAGE_SIZE),
    os: String(offset),
    deadline_strdate: isoDay(new Date(now.getTime() - 86_400_000)),
    deadline_enddate: isoDay(new Date(now.getTime() + 730 * 86_400_000)),
    fl: FIELDS.join(","),
  });
  return `${WORLD_BANK_NOTICES_URL}?${params.toString()}`;
};

export const worldBankNoticeUrl = (id: string): string =>
  `https://projects.worldbank.org/en/projects-operations/procurement-detail/${encodeURIComponent(id)}`;

/** Notices a supplier can act on. Contract awards and general procurement notices are not calls. */
const NOTICE_TYPES: Record<string, string> = {
  "invitation for bids": "Convite à licitação",
  "request for bids": "Convite à licitação",
  "request for proposals": "Pedido de propostas",
  "request for expression of interest": "Pedido de manifestação de interesse",
  "invitation for prequalification": "Convite à pré-qualificação",
};

const GROUPS: Record<string, string> = {
  GO: "Bens",
  CW: "Obras",
  CS: "Consultoria",
  NC: "Serviços (não consultoria)",
};

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
};

const publishedAt = (value: unknown): Date | null => {
  const day = dayOfTimestamp(value);
  return day ? new Date(`${day}T00:00:00Z`) : null;
};

const brazilianDay = (day: string | null): string | null =>
  day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : null;

export type WorldBankPage = {
  /** Notices the query matches, as the API reports it. */
  total: number;
  /** Rows in this page, whatever their type. */
  rows: number;
  drafts: InternationalOpportunityDraft[];
  /** Rows left out: not a call, cancelled, no deadline, or deadline already past. */
  skipped: number;
};

export const parseWorldBankPage = (payload: unknown, now: Date): WorldBankPage => {
  if (payload === null || typeof payload !== "object")
    throw new Error("Banco Mundial: resposta sem a lista de avisos");
  const body = payload as { total?: unknown; procnotices?: unknown };
  if (!Array.isArray(body.procnotices))
    throw new Error("Banco Mundial: resposta sem a lista de avisos");
  const total = Number(body.total);
  const drafts: InternationalOpportunityDraft[] = [];
  let skipped = 0;

  for (const item of body.procnotices) {
    if (item === null || typeof item !== "object") {
      skipped += 1;
      continue;
    }
    const notice = item as Record<string, unknown>;
    const id = text(notice.id);
    const noticeType = text(notice.notice_type);
    const noticeLabel = NOTICE_TYPES[(noticeType ?? "").toLowerCase()];
    const cancelled = /cancel/i.test(text(notice.notice_status) ?? "");
    const countryPublished = text(notice.project_ctry_name);
    const place = placeFromName(countryPublished);
    const deadline = localDeadline({
      day: dayOfTimestamp(notice.submission_deadline_date),
      clock: text(notice.submission_deadline_time),
      timeZone: place.timeZone,
    });
    if (
      !id ||
      !noticeLabel ||
      cancelled ||
      !deadline ||
      deadline.at.getTime() < now.getTime()
    ) {
      skipped += 1;
      continue;
    }

    const projectId = text(notice.project_id);
    const projectName = text(notice.project_name);
    const reference = text(notice.bid_reference_no);
    const methodCode = text(notice.procurement_method_code);
    const methodName = text(notice.procurement_method_name);
    const group = text(notice.procurement_group)?.toUpperCase() ?? null;
    const opportunityType =
      (group ? GROUPS[group] : undefined) ??
      (/expression of interest/i.test(noticeType ?? "") ? "Consultoria" : null);
    const language = languageCode(text(notice.notice_lang_name));
    const title =
      text(notice.bid_description) ??
      [noticeType, projectName].filter(Boolean).join(" — ");
    const eligibility = worldBankEligibility({
      methodCode,
      methodName,
      country: place.country,
      countryName: place.countryName,
      texts: [
        title,
        reference,
        typeof notice.notice_text === "string"
          ? textFromHtml(notice.notice_text)
          : null,
      ],
    });
    const published = dayOfTimestamp(notice.submission_date);
    const where = place.countryName ?? "país não informado";
    const summary = [
      `${noticeLabel}${opportunityType ? ` de ${opportunityType.toLowerCase()}` : ""} em ${where}`,
      methodName ? `, método ${methodName}` : "",
      projectName ? `, no projeto ${projectName}` : "",
      ".",
      language && language !== "pt"
        ? ` Aviso em ${(internationalLanguageLabels[language] ?? language).toLowerCase()}.`
        : "",
      reference ? ` Referência ${reference}.` : "",
    ].join("");

    drafts.push(
      internationalDraft({
        source: "worldbank",
        externalId: id,
        kind: "procurement",
        titleOriginal: title,
        language,
        summary,
        organizationName: text(notice.contact_organization) ?? "Banco Mundial",
        originName: projectName
          ? [projectId, projectName].filter(Boolean).join(" · ")
          : projectId,
        opportunityType,
        place,
        registrationFrom: publishedAt(notice.submission_date),
        deadline,
        sourceStatus: "open",
        brazilEligibility: eligibility,
        sourceUrl: worldBankNoticeUrl(id),
        details: [
          { label: "Tipo de aviso", value: noticeLabel },
          { label: "Método", value: methodName ?? "" },
          {
            label: "Projeto",
            value: [projectId, projectName].filter(Boolean).join(" · "),
          },
          { label: "País do projeto", value: countryPublished ?? "" },
          { label: "Referência", value: reference ?? "" },
          { label: "Publicado em", value: brazilianDay(published) ?? "" },
        ],
        searchExtras: [reference, projectId, methodName, noticeLabel],
        raw: {
          id,
          noticeType,
          noticeStatus: text(notice.notice_status),
          publishedOn: published,
          language: text(notice.notice_lang_name),
          methodCode,
          methodName,
          procurementGroup: group,
          projectId,
          projectName,
          country: countryPublished,
          reference,
          deadlineDate: dayOfTimestamp(notice.submission_deadline_date),
          deadlineTime: text(notice.submission_deadline_time),
        },
        now,
      }),
    );
  }

  return {
    total: Number.isFinite(total) ? total : body.procnotices.length,
    rows: body.procnotices.length,
    drafts,
    skipped,
  };
};
