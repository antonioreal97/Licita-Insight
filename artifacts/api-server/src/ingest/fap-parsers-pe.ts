import {
  draft,
  linksFromHtml,
  textFromHtml,
  type FundingOpportunityDraft,
} from "./funding-parsers";
import { fapAnchor, type FapIdentity } from "./fap-parsers";

export const FACEPE_OPEN_PAGE = "https://www.facepe.br/editais/todos/?c=aberto";
export const FACEPE_CONTINUOUS_PAGE =
  "https://www.facepe.br/editais-x-fluxo-continuo/";

const normalizeFacepe = (url: string): string =>
  url
    .replace(/^https:\/\/www2\.facepe\.br/i, "https://www.facepe.br")
    .replace(/\/$/, "");

/** Abertos (`?c=aberto`) e a página de fluxo contínuo, ligadas na home. */
export const facepePages = (homeHtml: string): string[] => {
  const links = linksFromHtml(homeHtml, "https://www.facepe.br/").map(
    ({ url }) => normalizeFacepe(url),
  );
  const pages: string[] = [];
  if (
    links.some(
      (url) =>
        url.includes("/editais/todos/") &&
        /[?&]c=aberto(?:&|$)/i.test(`?${url.split("?")[1] ?? ""}`),
    )
  )
    pages.push(FACEPE_OPEN_PAGE);
  if (links.some((url) => url.includes("/editais-x-fluxo-continuo")))
    pages.push(FACEPE_CONTINUOUS_PAGE);
  return pages;
};

const SKIP_TITLE =
  /\bresultado\b|\bhomologa|\bmembros do conselho|\bservidor(?:es)?\b|\bestagi[aá]ri|\bpr[eê]mio\b|\bcronograma\b|\beleitora|\bcandidaturas\b|\benquadramento\b|\blista de espera\b/i;

/**
 * The `?c=aberto` filter is not reliable: in 2026-11 it listed 60 cards, calls from 2023 and 2024 among
 * them, and no card carries a date. Only calls numbered in the current year (Brasília) are kept, and in
 * January and February also those of the previous year. The card number is "35/2026 - …".
 */
const facepeCallYear = (title: string): number | null => {
  const match = /^\s*\d{1,3}\s*\/\s*(\d{4})\b/.exec(title);
  return match ? Number(match[1]) : null;
};
const facepeYearsKept = (now: Date): number[] => {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1_000);
  const year = local.getUTCFullYear();
  return local.getUTCMonth() <= 1 ? [year, year - 1] : [year];
};
const DOC_SKIP = /resultado|homologa|lista de espera|extrato|di[aá]rio/i;

const isContinuousPage = (pageUrl: string): boolean =>
  normalizeFacepe(pageUrl).includes("/editais-x-fluxo-continuo");

const isOpenPage = (pageUrl: string): boolean => {
  const normalized = normalizeFacepe(pageUrl);
  return (
    normalized.includes("/editais/todos/") &&
    /[?&]c=aberto(?:&|$)/i.test(`?${pageUrl.split("?")[1] ?? ""}`)
  );
};

const callDocuments = (
  body: string,
  pageUrl: string,
): FundingOpportunityDraft["documents"] => {
  const seen = new Set<string>();
  return linksFromHtml(body, pageUrl)
    .flatMap(({ title, url }) => {
      if (!/\.pdf(?:$|[?#])/i.test(url)) return [];
      const label = title.replace(/\s+/g, " ").trim() || "Edital";
      if (DOC_SKIP.test(`${label} ${url}`)) return [];
      if (
        !/edital|errata|adendo|retifica|prorroga|baixar|anexo/i.test(
          `${label} ${url}`,
        )
      )
        return [];
      if (seen.has(url)) return [];
      seen.add(url);
      return [
        {
          title: /^baixar$/i.test(label) ? "Edital" : label,
          url,
          mediaType: "application/pdf" as const,
        },
      ];
    })
    .slice(0, 5);
};

/**
 * Cada card `card-edital-grupo` da listagem filtrada `?c=aberto` é uma chamada aberta.
 * Sem página própria: `sourceUrl` = listagem + âncora. Fluxo contínuo sem data final
 * fica `status: "open"` (a página dedicada ainda pode estar vazia/"em construção").
 */
export const parseFacepeOpportunities = (
  html: string,
  pageUrl: string,
  identity: FapIdentity,
  now = new Date(),
): FundingOpportunityDraft[] => {
  if (isContinuousPage(pageUrl)) {
    // Página oficial ainda "em construção"; editais de fluxo contínuo também saem em ?c=aberto.
    if (/p[aá]gina em constru/i.test(textFromHtml(html))) return [];
  } else if (!isOpenPage(pageUrl)) {
    return [];
  }

  const seen = new Set<string>();
  const blocks = html.split(
    /<div\b[^>]*class=["'][^"']*\bcard-edital-grupo\b[^"']*["'][^>]*>/i,
  );
  return blocks.slice(1).flatMap((block) => {
    const header =
      /class=["'][^"']*\btitulo-pai\b[^"']*["'][^>]*>([\s\S]*?)<\/h4>/i.exec(
        block,
      )?.[1];
    if (!header) return [];
    const title = textFromHtml(header).replace(/\s+/g, " ").trim();
    if (!title || SKIP_TITLE.test(title)) return [];
    const callYear = facepeCallYear(title);
    if (
      !isContinuousPage(pageUrl) &&
      (callYear === null || !facepeYearsKept(now).includes(callYear))
    )
      return [];
    const anchor = fapAnchor(title);
    if (seen.has(anchor)) return [];
    seen.add(anchor);
    const listUrl = isContinuousPage(pageUrl)
      ? FACEPE_CONTINUOUS_PAGE
      : FACEPE_OPEN_PAGE;
    const sourceUrl = `${listUrl}#${anchor}`;
    const documents = callDocuments(block, pageUrl);
    return [
      draft({
        source: "fap",
        installationId: identity.installationId,
        state: identity.uf,
        kind: "funding",
        title,
        organizationName: identity.acronym,
        audience: identity.audience,
        sourceUrl,
        documents,
        // No card carries a date, and the "aberto" filter also lists closed calls: `undated` instead of a
        // guessed `open`. A continuous-flow call (its own page) stays open.
        status: isContinuousPage(pageUrl) ? "open" : "undated",
        raw: { sourceUrl: pageUrl.split("#")[0], anchor },
        now,
      }),
    ];
  });
};
