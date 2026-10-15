import type { OpportunityDocument } from "@workspace/db";
import { decodeHtml, textFromHtml } from "./funding-parsers";
import { dayFromMonthName } from "./federal-draft";
import {
  onPlatformHost,
  platformForUrl,
  type ApplicationPlatform,
  APPLICATION_PLATFORMS,
} from "./application-platforms";

/**
 * Reads, without AI, where a call takes its applications and when, from the call page or the text of its
 * documents. Each answer needs words about registering next to it; anything less certain is no answer,
 * because a wrong link is worse than none.
 */

export type ApplicationLink = {
  url: string;
  /** Slug of a known platform; `null` for a link accepted only by the words around it. */
  platform: string | null;
  label: string | null;
};

export type NoticePeriod = { from: Date | null; to: Date | null };

/** Lower-case and without accents, one code unit per code unit, so an index means the same in both texts. */
export const foldText = (text: string): string =>
  text
    .split("")
    .map((character) => {
      const folded = character
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return folded.length === 1 ? folded : character;
    })
    .join("");

/** The words of a call page, with each link written out after its text so that both read as one sentence. */
export const readableTextFromHtml = (html: string, baseUrl: string): string => {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1];
  const body = (main ?? html)
    .replace(
      /<(script|style|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href: string, inner: string) => {
        let url: string;
        try {
          url = new URL(decodeHtml(href).trim(), baseUrl).toString();
        } catch {
          return ` ${inner} `;
        }
        return /^https?:/i.test(url) ? ` ${inner} ${url} ` : ` ${inner} `;
      },
    )
    .replace(/<\/(?:div|section|td|tr|table|ul|ol|dl|dt|dd)>/gi, "\n");
  return textFromHtml(body);
};

const URL_START = /(?:https?:\/\/|www\.)/gi;
const URL_CHARACTER = /[^\s<>"'`{}|\\^[\]]/;
/** A line of a PDF that goes on with the address it starts: `…/submissao-de-` + `proposta.` */
const CONTINUATION = /^[a-z0-9_?#=&%][^\s<>"'`{}|\\^[\]]*/;

/** Every address in a text, joining the ones a PDF broke at the end of a line. */
export const urlsInText = (
  text: string,
): Array<{ url: string; index: number }> => {
  const found: Array<{ url: string; index: number }> = [];
  for (const match of text.matchAll(URL_START)) {
    const index = match.index ?? 0;
    if (index > 0 && /[\w@/.:-]/.test(text[index - 1]!)) continue;
    let end = index;
    while (end < text.length && URL_CHARACTER.test(text[end]!)) end += 1;
    let raw = text.slice(index, end);
    while (text[end] === "\n") {
      const next = CONTINUATION.exec(text.slice(end + 1))?.[0];
      if (!next) break;
      const brokenWord = /[-_=?&]$/.test(raw);
      const brokenPath =
        raw.endsWith("/") && /[/._=-]/.test(next.replace(/[.,;:!?)]+$/, ""));
      if (!brokenWord && !brokenPath) break;
      raw += next;
      end += 1 + next.length;
    }
    raw = raw.replace(/[.,;:!?)\]}»"']+$/, "");
    if (/^www\./i.test(raw)) raw = `https://${raw}`;
    try {
      const url = new URL(raw);
      if (!url.hostname.includes(".")) continue;
      found.push({ url: url.toString(), index });
    } catch {
      // not an address
    }
  }
  return found;
};

/** Spaces in the source stand for any run of white space; ` ?` for an optional one. */
const pattern = (source: string, flags = "g"): RegExp =>
  new RegExp(source.replaceAll(" ?", "\\s*").replaceAll(" ", "\\s+"), flags);

/** Words that say the link or platform is where the application goes. */
const APPLICATION_WORDS = pattern(
  [
    "inscricao",
    "inscricoes",
    "inscreva",
    "inscrever",
    "submissao",
    "submissoes",
    "submetid[ao]s?",
    "submeter",
    "envio d[aeo]s? (?:proposta|projeto|candidatura|inscric)",
    "propostas? (?:deverao|devera|serao|sera) (?:ser )?(?:encaminhad|enviad|submetid|apresentad|cadastrad)",
    "formulario (?:online |eletronico )?de (?:inscricao|propostas?|submissao|candidatura)",
    "candidatar",
    "apply",
    "application",
    "submission",
  ].join("|"),
);
/** Words that, after the application words, put the link in another step: appeals, results, contact, law. */
const OTHER_STEP_WORDS = pattern(
  [
    "recurso",
    "resultado",
    "homologa",
    "duvida",
    "esclarecimento",
    "contato",
    "fale conosco",
    "legislacao",
    "\\blei\\b",
    "decreto",
    "portaria",
    "resolucao",
    "autenticidade",
    "conferid",
    "linha direta",
    "acompanhamento",
    "prestacao de contas",
    "relatorio",
    "impugna",
    "curriculo",
    "lattes",
    "verificacao",
    "atualiza",
  ].join("|"),
);
/** Words that say the text points to a place: a link, a system, a page. */
const CHANNEL_WORDS = pattern(
  [
    "por meio d",
    "atraves d",
    "\\bvia\\b",
    "\\blink\\b",
    "endereco",
    "plataforma",
    "sistema",
    "formulario",
    "disponivel",
    "exclusivamente",
    "acesse",
    "acessar",
    "\\bsite\\b",
    "pagina",
    "portal",
    "clique",
    "on-?line",
    "internet",
  ].join("|"),
  "",
);

const BEFORE = 240;
const NEAR = 160;

/** Whether the application words come before the place, with no other step in between. */
const applicationContext = (folded: string, index: number): boolean => {
  const start = Math.max(0, index - BEFORE);
  const window = folded.slice(start, index);
  let lastApplication = -1;
  for (const match of window.matchAll(APPLICATION_WORDS))
    lastApplication = (match.index ?? 0) + match[0].length;
  if (lastApplication < 0 || window.length - lastApplication > NEAR)
    return false;
  let lastOtherStep = -1;
  for (const match of window.matchAll(OTHER_STEP_WORDS))
    lastOtherStep = match.index ?? 0;
  return lastOtherStep < lastApplication - 1;
};

/** Whether the sentence of the link says it is a place to go: "no link", "pelo sistema", "acesse". */
const channelContext = (folded: string, index: number): boolean => {
  const window = folded.slice(Math.max(0, index - 200), index);
  const sentence = window.split(/[.!?;]\s+/).pop() ?? "";
  return CHANNEL_WORDS.test(sentence);
};

/** Hosts whose links are never where to apply: law, the official gazette, contact, social media, sign-in. */
const NEVER_HOSTS = [
  "gov.br",
  "planalto.gov.br",
  "in.gov.br",
  "imprensanacional.gov.br",
  "lexml.gov.br",
  "leg.br",
  "doi.org",
  "lattes.cnpq.br",
  "linhadireta.capes.gov.br",
  "cad.capes.gov.br",
  "acesso.gov.br",
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "wa.me",
  "whatsapp.com",
  "t.me",
  "ibge.gov.br",
  "receita.fazenda.gov.br",
  "bndes.gov.br",
];
const DOCUMENT_PATH =
  /\.(?:pdf|docx?|odt|xlsx?|ods|csv|zip|rar|7z|jpe?g|png|gif)(?:$|[/?#])|@@(?:display-file|download)/i;

export const canonicalLink = (value: string): string => {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.protocol = "https:";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
};

const neverApplication = (value: string, exclude: Set<string>): boolean => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return true;
  }
  if (!/^https?:$/.test(url.protocol) || url.username) return true;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    NEVER_HOSTS.some((never) => host === never || host.endsWith(`.${never}`)) ||
    /^sei\d*\./.test(host)
  )
    return true;
  if (DOCUMENT_PATH.test(url.pathname) || DOCUMENT_PATH.test(url.search))
    return true;
  return exclude.has(canonicalLink(value));
};

type Occurrence = {
  platform: ApplicationPlatform | null;
  /** Address written in the text; `null` when the text only names the platform. */
  url: string | null;
  application: boolean;
  channel: boolean;
};

const occurrencesIn = (text: string, exclude: Set<string>): Occurrence[] => {
  const folded = foldText(text);
  const occurrences: Occurrence[] = [];
  for (const { url, index } of urlsInText(text)) {
    const platform = platformForUrl(url);
    if (!platform && (onPlatformHost(url) || neverApplication(url, exclude)))
      continue;
    if (platform && exclude.has(canonicalLink(url))) continue;
    occurrences.push({
      platform,
      url,
      application: applicationContext(folded, index),
      channel: channelContext(folded, index),
    });
  }
  for (const platform of APPLICATION_PLATFORMS) {
    for (const name of platform.names ?? []) {
      for (const match of folded.matchAll(new RegExp(name.source, "g"))) {
        const index = match.index ?? 0;
        occurrences.push({
          platform,
          url: null,
          application: applicationContext(folded, index),
          channel: true,
        });
      }
    }
  }
  return occurrences;
};

/**
 * The link to apply, when the text gives one with confidence: a known platform named or linked right after
 * words about registering, or else a single other link right after such words and a word for a place.
 * `exclude` lists the addresses of the page and documents themselves, never an answer.
 */
export const findApplicationLink = (
  text: string,
  exclude: string[] = [],
): ApplicationLink | null => {
  const excluded = new Set(exclude.map(canonicalLink));
  const occurrences = occurrencesIn(text, excluded);

  const platforms = new Map<
    string,
    { platform: ApplicationPlatform; count: number; url: string | null }
  >();
  for (const occurrence of occurrences) {
    if (!occurrence.platform || !occurrence.application) continue;
    const entry = platforms.get(occurrence.platform.slug) ?? {
      platform: occurrence.platform,
      count: 0,
      url: null,
    };
    entry.count += 1;
    // The first address written next to the application words wins over the platform's entry page.
    if (!entry.url && occurrence.url) entry.url = occurrence.url;
    platforms.set(occurrence.platform.slug, entry);
  }
  const ranked = [...platforms.values()]
    .map((entry) => ({
      ...entry,
      url: entry.url ?? entry.platform.home ?? null,
    }))
    .filter((entry) => entry.url !== null)
    .sort((a, b) => b.count - a.count);
  if (ranked.length > 0) {
    const [first, second] = ranked;
    // Two platforms named as often next to the application words: the text does not say which one.
    if (second && second.count === first!.count) return null;
    return {
      url: first!.url!,
      platform: first!.platform.slug,
      label: first!.platform.label,
    };
  }

  const others = new Set(
    occurrences
      .filter(
        (occurrence) =>
          !occurrence.platform &&
          occurrence.url &&
          occurrence.application &&
          occurrence.channel,
      )
      .map((occurrence) => canonicalLink(occurrence.url!)),
  );
  if (others.size !== 1) return null;
  const url = occurrences.find(
    (occurrence) =>
      !occurrence.platform &&
      occurrence.url &&
      canonicalLink(occurrence.url) === [...others][0],
  )!.url!;
  return { url, platform: null, label: null };
};

/** The rule for a call whose own page is where one applies, so nothing needs to be read. */
export const applicationOnSourcePage = (
  source: string,
  sourceUrl: string | null,
): ApplicationLink | null => {
  if (!sourceUrl) return null;
  const platform = platformForUrl(sourceUrl);
  if (platform)
    return { url: sourceUrl, platform: platform.slug, label: platform.label };
  // Every Mapas Culturais installation takes the applications on the page of the call.
  if (source === "mapas")
    return {
      url: sourceUrl,
      platform: "mapas-culturais",
      label: "Mapas Culturais",
    };
  // Transferegov programmes take proposals in the Transferegov itself, whose portal is the source page.
  if (source === "transferegov")
    return { url: sourceUrl, platform: "transferegov", label: "Transferegov" };
  return null;
};

// ---------------------------------------------------------------------------------------------------
// Notice documents

export const DOCUMENT_URL =
  /\.(?:pdf|docx?|odt)(?:$|[/?#])|@@(?:display-file|download)/i;
const NOTICE_TITLE =
  /edital|chamada|regulamento|retifica|altera|errata|prorroga/;
const NOT_NOTICE_TITLE =
  /resultado|lista|listagem|homolog|recurso|anexo|modelo|declara|termo|formulario|planilha|portaria|extrato|aprovad|selecionad|convoca|ata\b/;
export const CHANGE_TITLE = /retifica|altera|errata|prorroga/;

export const normalizedTitle = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export type NoticeDocument = { title: string; url: string };

/** The documents worth reading for where and when to apply: the notice and its amendments, newest year first. */
export const noticeDocuments = (
  listed: OpportunityDocument[],
  pageLinks: NoticeDocument[],
  limit: number,
): NoticeDocument[] => {
  const seen = new Set<string>();
  const candidates: Array<NoticeDocument & { year: number; listed: boolean }> =
    [];
  for (const [document, isListed] of [
    ...listed.map((document) => [document, true] as const),
    ...pageLinks.map((document) => [document, false] as const),
  ]) {
    const key = canonicalLink(document.url);
    if (seen.has(key) || !DOCUMENT_URL.test(document.url)) continue;
    const title = normalizedTitle(document.title);
    // A document the source itself listed is read even without a telling title; links on the page need one.
    if (NOT_NOTICE_TITLE.test(title) && !CHANGE_TITLE.test(title)) continue;
    if (!isListed && !NOTICE_TITLE.test(title)) continue;
    seen.add(key);
    const years = [...title.matchAll(/\b(20\d{2})\b/g)].map((match) =>
      Number(match[1]),
    );
    candidates.push({
      title: document.title,
      url: document.url,
      year: years.length ? Math.max(...years) : 0,
      listed: isListed,
    });
  }
  const newest = Math.max(0, ...candidates.map((candidate) => candidate.year));
  return candidates
    .filter((candidate) => candidate.year === 0 || candidate.year === newest)
    .sort(
      (a, b) =>
        Number(CHANGE_TITLE.test(normalizedTitle(a.title))) -
          Number(CHANGE_TITLE.test(normalizedTitle(b.title))) ||
        Number(b.listed) - Number(a.listed),
    )
    .slice(0, limit)
    .map(({ title, url }) => ({ title, url }));
};

// ---------------------------------------------------------------------------------------------------
// Registration period

const MONTH =
  "(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)";
const DAY = "(\\d{1,2})(?:º|°|o)?";
const TIME =
  "\\(?(?:(?:as|a) )?(\\d{1,2}) ?(?:h|:) ?(\\d{2})?(?: ?min(?:utos)?)?(?: ?\\d{2} ?s)?(?:,? ?-? ?\\(?horario (?:oficial )?de brasilia\\)?,?)?\\)?";
/** Words that open the stretch: the period to register or submit. */
const PERIOD_WORDS = pattern(
  "periodo de (?:inscricao|inscricoes|submissao|envio)|inscricao|inscricoes|submissao|submissoes|envio d[ao]s? propostas?|recebimento d[ae]s? propostas?",
);
/** Words that put a date in another step of the call, before the period words or between them and the date. */
const OTHER_DATE_STEP =
  "homologa|resultado|recurso|divulga|publicacao|relacao|analise|avaliacao|julgamento|habilitacao|impugna";
const OTHER_DATE_STEP_BEFORE = pattern(OTHER_DATE_STEP, "");
const OTHER_DATE_STEP_BETWEEN = pattern(
  `${OTHER_DATE_STEP}|selecao|cadastro|processo|anexo|referencia|codigo`,
  "",
);
const LONG_RANGE = pattern(
  `^(?:de |entre )?${DAY}(?: de ${MONTH})?(?: de (\\d{4}))?,? (?:a|ate|e) (?:o dia )?(?:${TIME} (?:do dia |de ))?${DAY} de ${MONTH} de (\\d{4})(?:,? (?:ate )?${TIME})?`,
  "",
);
const NUMERIC_RANGE = pattern(
  `^(?:de |entre )?(\\d{1,2})(?:/(\\d{1,2})(?:/(\\d{4}))?)? ?(?:a|ate|e|-|–) ?(?:o dia )?(\\d{1,2})/(\\d{1,2})/(\\d{4})(?:,? (?:ate )?${TIME})?`,
  "",
);
const LONG_UNTIL = pattern(
  `^ate (?:o dia )?(?:${TIME} (?:do dia |de ))?${DAY} de ${MONTH} de (\\d{4})(?:,? (?:ate )?${TIME})?`,
  "",
);
const NUMERIC_UNTIL = pattern(
  `^ate (?:o dia )?(?:${TIME} (?:do dia |de ))?(\\d{1,2})/(\\d{1,2})/(\\d{4})(?:,? (?:ate )?${TIME})?`,
  "",
);
const LONG_DATE = pattern(
  `^${DAY} de ${MONTH} de (\\d{4})(?:,? (?:ate )?${TIME})?`,
  "",
);
const NUMERIC_DATE = pattern(
  `^(\\d{1,2})/(\\d{1,2})/(\\d{4})(?:,? (?:ate )?${TIME})?`,
  "",
);
/** Start of any date expression, to find the first one after the period words. */
const ANY_DATE = pattern(
  `(?:(?:de |entre |ate (?:o dia )?(?:${TIME} (?:do dia |de ))?)?)(?:${DAY} de ${MONTH}|\\d{1,2}/\\d{1,2}(?:/\\d{4})?|${DAY} (?:a|e) ${DAY} de ${MONTH}|\\d{1,2} ?(?:a|ate|-|–) ?\\d{1,2}/\\d{1,2}/\\d{4})`,
);

const pad = (value: number) => String(value).padStart(2, "0");
const isoDay = (year: number, month: number, day: number): string | null => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 2000 ||
    year > 2100 ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return `${year}-${pad(month)}-${pad(day)}`;
};
const monthNumber = (name: string): number =>
  [
    "janeiro",
    "fevereiro",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ].indexOf(name) + 1;

/** Brasília time: a period opens at 00:00 of its first day and closes at the hour given, or 23:59:59. */
const opening = (day: string | null): Date | null =>
  day ? new Date(`${day}T00:00:00-03:00`) : null;
const closing = (
  day: string | null,
  hour?: string,
  minute?: string,
): Date | null => {
  if (!day) return null;
  if (hour !== undefined && Number(hour) <= 23 && Number(minute ?? 0) <= 59)
    return new Date(
      `${day}T${pad(Number(hour))}:${pad(Number(minute ?? 0))}:00-03:00`,
    );
  return new Date(`${day}T23:59:59-03:00`);
};

type PeriodCandidate = { from: Date | null; to: Date | null };

/** Reads one date expression at the start of `text`; `labels` are the words just before it. */
const readDates = (text: string, labels: string): PeriodCandidate | null => {
  let match = LONG_RANGE.exec(text);
  if (match) {
    const [, d1, m1, y1, h1, n1, d2, m2, y2, h2, n2] = match;
    const toMonth = monthNumber(m2!);
    const fromMonth = m1 ? monthNumber(m1) : toMonth;
    const toYear = Number(y2);
    const fromYear = y1
      ? Number(y1)
      : fromMonth > toMonth
        ? toYear - 1
        : toYear;
    const fromDay = isoDay(fromYear, fromMonth, Number(d1));
    const toDay = dayFromMonthName(d2!, m2!, y2!);
    if (!fromDay || !toDay || fromDay > toDay) return null;
    return { from: opening(fromDay), to: closing(toDay, h1 ?? h2, n1 ?? n2) };
  }
  match = NUMERIC_RANGE.exec(text);
  if (match) {
    const [, d1, m1, y1, d2, m2, y2, h, n] = match;
    const toYear = Number(y2);
    const toMonth = Number(m2);
    const fromMonth = m1 ? Number(m1) : toMonth;
    const fromYear = y1
      ? Number(y1)
      : fromMonth > toMonth
        ? toYear - 1
        : toYear;
    const fromDay = isoDay(fromYear, fromMonth, Number(d1));
    const toDay = isoDay(toYear, toMonth, Number(d2));
    if (!fromDay || !toDay || fromDay > toDay) return null;
    return { from: opening(fromDay), to: closing(toDay, h, n) };
  }
  match = LONG_UNTIL.exec(text);
  if (match) {
    const [, h1, n1, d, m, y, h2, n2] = match;
    const day = dayFromMonthName(d!, m!, y!);
    return day ? { from: null, to: closing(day, h1 ?? h2, n1 ?? n2) } : null;
  }
  match = NUMERIC_UNTIL.exec(text);
  if (match) {
    const [, h1, n1, d, m, y, h2, n2] = match;
    const day = isoDay(Number(y), Number(m), Number(d));
    return day ? { from: null, to: closing(day, h1 ?? h2, n1 ?? n2) } : null;
  }
  // A lone date is a start or an end only when the words before it say which.
  const lone = LONG_DATE.exec(text) ?? NUMERIC_DATE.exec(text);
  if (!lone) return null;
  const [, d, m, y, h, n] = lone;
  const day = /^\d+$/.test(m!)
    ? isoDay(Number(y), Number(m), Number(d))
    : dayFromMonthName(d!, m!, y!);
  if (!day) return null;
  const starts = /inicio|abertura|a partir/.test(labels);
  const ends = /limite|final|termino|encerramento|prazo/.test(labels);
  if (starts === ends) return null;
  return starts
    ? { from: opening(day), to: null }
    : { from: null, to: closing(day, h, n) };
};

const sameInstant = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * The registration period, when the text states it next to the words for registering or submitting and
 * every statement agrees. Two different periods (an amended schedule, a second stage) are no answer.
 */
export const findRegistrationPeriod = (text: string): NoticePeriod | null => {
  const folded = foldText(text).replace(/\s+/g, " ");
  const candidates: PeriodCandidate[] = [];
  for (const match of folded.matchAll(PERIOD_WORDS)) {
    const keywordStart = match.index ?? 0;
    const after = keywordStart + match[0].length;
    // The words before the period words, back to the previous date: "relação das inscrições homologadas".
    const lead = folded
      .slice(Math.max(0, keywordStart - 40), keywordStart)
      .split(/\d{4}|\d{1,2}\/\d{1,2}/)
      .pop()!;
    if (OTHER_DATE_STEP_BEFORE.test(lead)) continue;
    const rest = folded.slice(after, after + 200);
    const dateMatch = new RegExp(ANY_DATE.source).exec(rest);
    if (!dateMatch || (dateMatch.index ?? 0) > 120) continue;
    const between = rest.slice(0, dateMatch.index);
    if (OTHER_DATE_STEP_BETWEEN.test(between)) continue;
    const labels = `${lead}${match[0]}${between}`;
    const candidate = readDates(rest.slice(dateMatch.index), labels);
    if (candidate) candidates.push(candidate);
  }
  if (candidates.length === 0) return null;
  let from: Date | null = null;
  let to: Date | null = null;
  for (const candidate of candidates) {
    if (candidate.from) {
      if (from && !sameInstant(from, candidate.from)) return null;
      from = candidate.from;
    }
    if (candidate.to) {
      if (to && !sameInstant(to, candidate.to)) return null;
      to = candidate.to;
    }
  }
  if (from && to && from.getTime() > to.getTime()) return null;
  return from || to ? { from, to } : null;
};
