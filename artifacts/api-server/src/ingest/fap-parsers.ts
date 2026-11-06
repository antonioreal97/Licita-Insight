import {
  draft,
  linksFromHtml,
  parseBrazilianDate,
  textFromHtml,
  type FundingOpportunityDraft,
} from "./funding-parsers";

/** What a FAP parser needs to know about the foundation whose page it reads. */
export type FapIdentity = {
  installationId: string;
  uf: string;
  acronym: string;
  audience: string;
};

/** "PERÍODO DE SUBMISSÃO: 03/03/2026 a 24/04/2026", also with INSCRIÇÃO/INSCRIÇÕES and "até" or a dash. */
const SUBMISSION_PERIOD =
  /PER[IÍ]ODO\s+DE\s+(?:SUBMISS(?:[AÃ]O|[OÕ]ES)|INSCRI[CÇ](?:[AÃ]O|[OÕ]ES))\s*:?\s*(\d{2}\/\d{2}\/\d{4})\s*(?:a|at[eé]|[–-])\s*(\d{2}\/\d{2}\/\d{4})/i;

/** The submission period written in a call's text, or `null` when the text gives none. */
export const submissionPeriod = (
  text: string,
): { from: Date | null; to: Date | null } | null => {
  const match = SUBMISSION_PERIOD.exec(text.replace(/\s+/g, " "));
  return match
    ? { from: parseBrazilianDate(match[1]), to: parseBrazilianDate(match[2]) }
    : null;
};

/** Staff selections are published next to the calls but are hiring, not funding. */
const STAFF_SELECTION = /\bservidor(?:es)?\b|processo seletivo simplificado/i;

/** "EDITAL 06/2026", "CHAMADA PÚBLICA FAPDF Nº 12/2026" → `edital-06-2026`, `chamada-12-2026`. */
export const fapAnchor = (title: string): string => {
  const numbered =
    /\b(EDITAL|CHAMADA|CHAMAMENTO)\b[^/]*?(\d{1,3})\s*\/\s*(\d{4})/i.exec(
      title,
    );
  if (numbered)
    return `${numbered[1]!.toLowerCase()}-${numbered[2]!.padStart(2, "0")}-${numbered[3]}`;
  return title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
};

/**
 * Year pages of the FAPDF calls ("/editais-fapdf-20261" for 2026), linked from the home page. Reads the
 * page of the current year in Brasília and, in January and February, also the previous one, whose calls
 * can still be open. Without a page for the current year, falls back to the most recent one.
 */
export const fapdfYearPages = (homeHtml: string, now: Date): string[] => {
  const byYear = new Map<number, string>();
  for (const { url } of linksFromHtml(homeHtml, "https://www.fap.df.gov.br/")) {
    const match = /\/editais-fapdf-(\d{4})\d*\/?$/i.exec(new URL(url).pathname);
    if (!match) continue;
    const year = Number(match[1]);
    // The same year can be linked twice; keep the first, it is the menu entry.
    if (!byYear.has(year)) byYear.set(year, url);
  }
  if (!byYear.size) return [];
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1_000);
  const year = local.getUTCFullYear();
  const wanted = local.getUTCMonth() <= 1 ? [year, year - 1] : [year];
  const pages = wanted.flatMap((y) => (byYear.has(y) ? [byYear.get(y)!] : []));
  if (pages.length) return pages;
  return [byYear.get(Math.max(...byYear.keys()))!];
};

/**
 * One FAPDF year page. Each call is a collapsible panel titled "EDITAL 06/2026 - …" (calls of a program are
 * panels nested in the program panel). Only panels with an explicit submission period become calls: prizes,
 * results-only panels and staff selections carry none or are skipped.
 */
export const parseFapdfOpportunities = (
  html: string,
  pageUrl: string,
  identity: FapIdentity,
  now = new Date(),
): FundingOpportunityDraft[] => {
  const panels = html
    .split(/<span\b[^>]*class=["']panel-title["'][^>]*>/i)
    .slice(1);
  const seen = new Set<string>();
  return panels.flatMap((panel) => {
    const end = panel.indexOf("</span>");
    if (end < 0) return [];
    const title = textFromHtml(panel.slice(0, end)).replace(/\s+/g, " ").trim();
    const body = panel.slice(end + "</span>".length);
    const text = textFromHtml(body);
    const period = SUBMISSION_PERIOD.exec(text.replace(/\s+/g, " "));
    if (!title || !period || STAFF_SELECTION.test(title)) return [];
    const anchor = fapAnchor(title);
    if (seen.has(anchor)) return [];
    seen.add(anchor);
    const summary =
      text
        .split("\n")
        .map((line) => line.trim())
        .find(
          (line) =>
            line.length >= 40 &&
            line !== title &&
            !/^(extrato|republica|comunicado|resultado)|DODF/i.test(line),
        ) ?? null;
    const documents = linksFromHtml(body, pageUrl)
      .filter(
        ({ title: label, url }) =>
          /\/documents\//.test(url) &&
          /edital|chamada/i.test(label) &&
          !/extrato|resultado|comiss[aã]o|recurso/i.test(label),
      )
      .slice(0, 5)
      .map(({ title: label, url }) => ({
        title: label,
        url,
        mediaType: /pdf$/i.test(url) ? "application/pdf" : null,
      }));
    return [
      draft({
        source: "fap",
        installationId: identity.installationId,
        state: identity.uf,
        kind: "funding",
        title,
        summary,
        organizationName: identity.acronym,
        audience: identity.audience,
        sourceUrl: `${pageUrl}#${anchor}`,
        documents,
        registrationFrom: parseBrazilianDate(period[1]),
        registrationTo: parseBrazilianDate(period[2]),
        raw: { sourceUrl: pageUrl, anchor },
        now,
      }),
    ];
  });
};
