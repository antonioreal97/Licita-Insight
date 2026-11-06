import {
  draft,
  linksFromHtml,
  parseBrazilianDate,
  textFromHtml,
  type FundingOpportunityDraft,
} from "./funding-parsers";
import { submissionPeriod, type FapIdentity } from "./fap-parsers";

const SC_PAGE = "https://fapesc.sc.gov.br/chamadas-abertas/";
const SE_PAGE = "https://fapitec.se.gov.br/editais-abertos/";

/** As listagens estáveis são descobertas nos menus oficiais, sem inferir páginas por ano. */
const discover = (html: string, page: string): string[] =>
  linksFromHtml(html, page).some(
    ({ url }) => url.replace(/\/$/, "") === page.replace(/\/$/, ""),
  )
    ? [page]
    : [];
export const fapescPages = (html: string): string[] => discover(html, SC_PAGE);
export const fapitecPages = (html: string): string[] => discover(html, SE_PAGE);

const excluded =
  /resultado|retifica|extrato|not[ií]cia|servidor(?:es)?|estagi[aá]ri|processo seletivo simplificado|consultoria|credenciamento.*ad\s*hoc/i;

const parseListing = (
  html: string,
  pageUrl: string,
  identity: FapIdentity,
  now: Date,
  cssClass: string,
): FundingOpportunityDraft[] => {
  const seen = new Set<string>();
  const headings = html.matchAll(
    /<h[23]\b[^>]*class=["']([^"']+)["'][^>]*>([\s\S]*?)<\/h[23]>/gi,
  );
  return [...headings].flatMap((heading) => {
    if (!heading[1]!.split(/\s+/).includes(cssClass)) return [];
    const link = linksFromHtml(heading[2]!, pageUrl)[0];
    if (
      !link ||
      !/\b(edital|chamada)\b/i.test(link.title) ||
      excluded.test(link.title) ||
      /pr[eê]mio/i.test(link.title)
    )
      return [];
    const url = new URL(link.url);
    if (
      url.origin !== new URL(pageUrl).origin ||
      /\.(pdf|docx?)(?:$)/i.test(url.pathname) ||
      seen.has(link.url)
    )
      return [];
    seen.add(link.url);
    return [
      draft({
        source: "fap",
        installationId: identity.installationId,
        state: identity.uf,
        kind: "funding",
        organizationName: identity.acronym,
        audience: identity.audience,
        title: link.title,
        sourceUrl: link.url,
        status: "open",
        now,
      }),
    ];
  });
};

export const parseFapescOpportunities = (
  html: string,
  pageUrl: string,
  identity: FapIdentity,
  now = new Date(),
): FundingOpportunityDraft[] =>
  pageUrl === SC_PAGE
    ? parseListing(html, pageUrl, identity, now, "upk-title")
    : [];
export const parseFapitecOpportunities = (
  html: string,
  pageUrl: string,
  identity: FapIdentity,
  now = new Date(),
): FundingOpportunityDraft[] =>
  pageUrl === SE_PAGE
    ? parseListing(html, pageUrl, identity, now, "wp-block-post-title")
    : [];

/** O post é isolado do menu, rodapé, datas de publicação e documentos institucionais. */
export const fapScSeDetail = (
  item: FundingOpportunityDraft,
  html: string,
  identity: FapIdentity,
  now: Date,
): FundingOpportunityDraft => {
  const marker =
    identity.uf === "SC"
      ? /<div\b[^>]*class=["'][^"']*\belementor-widget-theme-post-content\b[^"']*["'][^>]*>/i
      : /<div\b[^>]*class=["'][^"']*\bentry-content\b[^"']*["'][^>]*>/i;
  const start = marker.exec(html);
  if (!start) return item;
  const body = html
    .slice(start.index + start[0].length)
    .split(/<footer\b|<\/article>/i)[0]!;
  const text = textFromHtml(body);
  const range =
    /Prazo\s+para\s+submiss[aã]o\s*:\s*(\d{2}\/\d{2}\/\d{4})\s*(?:a|at[eé]|[–-])\s*(\d{2}\/\d{2}\/\d{4})/i.exec(
      text,
    );
  const continuous =
    /Prazo\s+para\s+submiss[aã]o\s*:\s*Fluxo\s+cont[ií]nuo\s+at[eé]\s*(\d{2}\/\d{2}\/\d{4})/i.exec(
      text,
    );
  const period =
    submissionPeriod(text) ??
    (range
      ? { from: parseBrazilianDate(range[1]), to: parseBrazilianDate(range[2]) }
      : continuous
        ? { from: null, to: parseBrazilianDate(continuous[1]) }
        : null);
  const seen = new Set<string>();
  const documents = linksFromHtml(body, item.sourceUrl)
    .filter(({ title, url }) => {
      if (
        !/\.pdf(?:$|[?#])/i.test(url) ||
        !/edital|retifica/i.test(title) ||
        /resultado|extrato|di[aá]rio|homologa|habilitad/i.test(
          `${title} ${url}`,
        ) ||
        seen.has(url)
      )
        return false;
      seen.add(url);
      return true;
    })
    .slice(0, 5)
    .map((link) => ({ ...link, mediaType: "application/pdf" }));
  return draft({
    source: "fap",
    installationId: identity.installationId,
    state: identity.uf,
    kind: "funding",
    organizationName: identity.acronym,
    audience: identity.audience,
    title: item.title,
    sourceUrl: item.sourceUrl,
    documents,
    registrationFrom: period?.from,
    registrationTo: period?.to,
    status: period ? undefined : "open",
    now,
  });
};
