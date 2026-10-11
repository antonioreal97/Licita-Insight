import type { OpportunityDocument } from "@workspace/db";
import { canonicalUrl, dayFromMonthName, dayFromText } from "./federal-draft";
import { decodeHtml, linksFromHtml, textFromHtml } from "./funding-parsers";

export type GovbrCard = { title: string; url: string };

export type GovbrCallPage = {
  title: string | null;
  /** Cards inside the page: a programme page lists its calls this way. */
  cards: GovbrCard[];
  summary: string | null;
  audience: string | null;
  /** Registration label as the page prints it, e.g. "Inscrições abertas". */
  situation: string | null;
  registrationFrom: string | null;
  registrationTo: string | null;
  continuousFlow: boolean;
  documents: OpportunityDocument[];
  /** Outbound links, to recognise where registration happens (Salic, Mapa da Cultura…). */
  links: string[];
};

const attribute = (attributes: string, name: string): string | null => {
  const match = new RegExp(
    `\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`,
    "i",
  ).exec(attributes);
  return match ? decodeHtml(match[2] ?? match[3] ?? "") : null;
};

/** The page body, without the portal header, menus and share links around it. */
const mainOf = (html: string): string => {
  const main = /<main\b[\s\S]*?<\/main>/i.exec(html)?.[0] ?? html;
  const below = main.search(/<div[^>]*id=["']viewlet-below-content["']/i);
  return below > 0 ? main.slice(0, below) : main;
};

const contentOf = (html: string): string => {
  const main = mainOf(html);
  const core = main.search(/<div[^>]*id=["']content-core["']/i);
  return core >= 0 ? main.slice(core) : main;
};

/** gov.br portals list calls as cards: `<a class="govbr-card-content" href>` with the name in `.titulo`. */
export const parseGovbrCards = (html: string, pageUrl: string): GovbrCard[] => {
  const seen = new Set<string>();
  const cards: GovbrCard[] = [];
  for (const match of mainOf(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attributes = match[1] ?? "";
    if (!/\bgovbr-card-content\b/.test(attribute(attributes, "class") ?? ""))
      continue;
    const href = attribute(attributes, "href");
    const inner = match[2] ?? "";
    const titled =
      /<span\b[^>]*class=["'][^"']*\btitulo\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(
        inner,
      )?.[1] ?? inner;
    const title = textFromHtml(titled).replace(/\s+/g, " ").trim();
    if (!href || !title) continue;
    let url: string;
    try {
      url = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:/i.test(url) || seen.has(url)) continue;
    seen.add(url);
    cards.push({ title, url });
  }
  return cards;
};

const DOCUMENT_TYPES: Array<[RegExp, string]> = [
  [/\.pdf$/i, "application/pdf"],
  [
    /\.docx$/i,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [/\.doc$/i, "application/msword"],
  [
    /\.xlsx$/i,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  [/\.xls$/i, "application/vnd.ms-excel"],
  [/\.odt$/i, "application/vnd.oasis.opendocument.text"],
];
const MAX_DOCUMENTS = 40;

/** Only the title, the official address and the type of each attachment; the files are never downloaded. */
const documentsOf = (
  content: string,
  pageUrl: string,
): OpportunityDocument[] => {
  const seen = new Set<string>();
  const documents: OpportunityDocument[] = [];
  for (const link of linksFromHtml(content, pageUrl)) {
    let path: string;
    try {
      path = new URL(link.url).pathname.replace(
        /\/(?:view|@@download\/file)$/i,
        "",
      );
    } catch {
      continue;
    }
    const mediaType = DOCUMENT_TYPES.find(([pattern]) =>
      pattern.test(path),
    )?.[1];
    if (!mediaType || seen.has(link.url)) continue;
    seen.add(link.url);
    documents.push({
      title: link.title.replace(/\s+/g, " ").slice(0, 300),
      url: link.url,
      mediaType,
    });
    if (documents.length >= MAX_DOCUMENTS) break;
  }
  return documents;
};

const DATE = String.raw`(\d{1,2}\/\d{1,2}\/\d{4})`;
const MONTH = String.raw`(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)`;
const REGISTRATION = String.raw`inscri[çc](?:[õo]es|[ãa]o)`;

export type RegistrationWindow = {
  from: string | null;
  to: string | null;
  continuousFlow: boolean;
};

/**
 * Registration dates as the page states them, most structured form first. Free text is read only inside
 * the sentence that talks about registration; a page with no explicit date keeps both ends empty.
 */
export const registrationWindowFromText = (
  text: string,
): RegistrationWindow => {
  const continuousFlow =
    /fluxo cont[íi]nuo|inscri[çc][õo]es s[ãa]o permanentes/i.test(text);
  const window = (from: string | null, to: string | null) => ({
    from,
    to,
    continuousFlow,
  });

  // Funarte information box: "Inscrições abertas / De 30/03/2026 / Até 30/04/2027".
  const box = new RegExp(
    String.raw`${REGISTRATION}[^\n]{0,60}\n+\s*De\s+${DATE}\s+At[ée]\s+${DATE}`,
    "i",
  ).exec(text);
  if (box) return window(dayFromText(box[1]), dayFromText(box[2]));

  // Schedule table: "Início das inscrições … 15/08/2026" and "Encerramento do prazo de inscrição 13/10/2026".
  const opening = new RegExp(
    String.raw`(?:In[íi]cio|Abertura)\s+d[aeo]s?\s+${REGISTRATION}[^\d\n.]{0,60}\s*${DATE}`,
    "i",
  ).exec(text);
  const closing = new RegExp(
    String.raw`(?:Encerramento|Fim|T[ée]rmino)(?:\s+do\s+prazo)?\s+d[aeo]s?\s+${REGISTRATION}[^\d\n.]{0,60}\s*${DATE}`,
    "i",
  ).exec(text);
  if (opening || closing)
    return window(dayFromText(opening?.[1]), dayFromText(closing?.[1]));

  const range = new RegExp(
    String.raw`${REGISTRATION}[^.\n]{0,160}?\bde\s+${DATE}\s+(?:a|at[ée])\s+${DATE}`,
    "i",
  ).exec(text);
  if (range) return window(dayFromText(range[1]), dayFromText(range[2]));

  const until = new RegExp(
    String.raw`${REGISTRATION}[^.\n]{0,200}?\bat[ée]\s+(?:o\s+dia\s+)?${DATE}`,
    "i",
  ).exec(text);
  if (until) return window(null, dayFromText(until[1]));

  const untilNamed = new RegExp(
    String.raw`${REGISTRATION}[^.\n]{0,260}?\bat[ée]\s[^.\n]{0,90}?\b(\d{1,2})º?\s+de\s+${MONTH}\s+de\s+(\d{4})`,
    "i",
  ).exec(text);
  if (untilNamed)
    return window(
      null,
      dayFromMonthName(untilNamed[1]!, untilNamed[2]!, untilNamed[3]!),
    );

  return window(null, null);
};

/** The same label appears as a heading in capitals and inside the information box. */
const sentenceCase = (value: string): string => {
  const lower = value.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
};

const BOILERPLATE =
  /^(?:info|compartilhe|publicado em|atualizado em|informa[çc][õo]es|arquivos relacionados|e-mail)\b/i;

const summaryOf = (lines: string[]): string | null => {
  const paragraph = lines.find(
    (line) =>
      line.length >= 80 &&
      !BOILERPLATE.test(line) &&
      !/rela[çc][ãa]o de propostas|resultado (?:final|preliminar|provis[óo]rio)/i.test(
        line,
      ),
  );
  if (!paragraph) return null;
  return paragraph.length <= 400
    ? paragraph
    : `${paragraph.slice(0, 399).trimEnd()}…`;
};

const audienceOf = (lines: string[]): string | null => {
  const heading = lines.findIndex((line) =>
    /^(?:quem pode (?:participar|se inscrever)|p[úu]blico[- ]alvo)\s*\??:?$/i.test(
      line,
    ),
  );
  const answer = heading >= 0 ? lines[heading + 1] : undefined;
  return answer && answer.length >= 20 ? answer : null;
};

/** One call page of a gov.br portal (Funarte, MinC): free text plus attachments. */
export const parseGovbrCallPage = (
  html: string,
  pageUrl: string,
): GovbrCallPage => {
  const main = mainOf(html);
  const content = contentOf(html);
  const heading =
    /<h1\b[^>]*class=["'][^"']*documentFirstHeading[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i.exec(
      main,
    )?.[1];
  const text = textFromHtml(content);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const window = registrationWindowFromText(text);
  const situation =
    /Inscri[çc][õo]es\s+(?:abertas|encerradas|prorrogadas|suspensas|em breve)/i.exec(
      text,
    )?.[0] ?? null;
  const links = [
    ...new Set(
      linksFromHtml(content, pageUrl).flatMap((link) => {
        try {
          return [canonicalUrl(link.url)];
        } catch {
          return [];
        }
      }),
    ),
  ];
  return {
    title: heading ? textFromHtml(heading).replace(/\s+/g, " ").trim() : null,
    cards: parseGovbrCards(html, pageUrl),
    summary: summaryOf(lines),
    audience: audienceOf(lines),
    situation: situation ? sentenceCase(situation.replace(/\s+/g, " ")) : null,
    registrationFrom: window.from,
    registrationTo: window.to,
    continuousFlow: window.continuousFlow,
    documents: documentsOf(content, pageUrl),
    links,
  };
};
