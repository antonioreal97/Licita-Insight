import {
  draft,
  linksFromHtml,
  textFromHtml,
  type FundingOpportunityDraft,
} from "./funding-parsers";
import { submissionPeriod, type FapIdentity } from "./fap-parsers";

/** Listagem oficial de chamadas com inscrição aberta (não a de "em andamento"). */
export const FAPEG_OPEN_PAGE =
  "https://goias.gov.br/fapeg/editais/inscricoes-abertas/";

/**
 * "Em andamento" no portal da FAPEG cobre chamadas ainda em execução (julgamento,
 * homologação, resultados), não só inscrição aberta. A listagem correta é
 * `/editais/inscricoes-abertas/`.
 */
export const fapegPages = (homeHtml: string): string[] => {
  const wanted = FAPEG_OPEN_PAGE.replace(/\/$/, "");
  const found = linksFromHtml(homeHtml, "https://goias.gov.br/fapeg/").some(
    ({ url }) => url.replace(/\/$/, "") === wanted,
  );
  return found ? [FAPEG_OPEN_PAGE] : [];
};

const DOC_OK = /edital|chamada|retifica/i;
const DOC_SKIP = /resultado|homologa|extrato|di[aá]rio|nota oficial/i;

/** Uma linha da tabela de Inscrições Abertas vira uma chamada com `status: "open"`. */
export const parseFapegOpportunities = (
  html: string,
  pageUrl: string,
  identity: FapIdentity,
  now = new Date(),
): FundingOpportunityDraft[] => {
  if (!pageUrl.replace(/\/$/, "").endsWith("/editais/inscricoes-abertas"))
    return [];
  const table = /<table\b[^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1] ?? "";
  const seen = new Set<string>();
  return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((row) => {
    const cells = [...row[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (cell) => textFromHtml(cell[1] ?? "").replace(/\s+/g, " ").trim(),
    );
    if (cells.length < 5 || !/^\d{1,3}\/\d{4}$/.test(cells[0] ?? "")) return [];
    const link = linksFromHtml(row[1]!, pageUrl).find(({ url, title }) => {
      try {
        const path = new URL(url).pathname;
        return (
          /abrir/i.test(title) &&
          /\/fapeg\//i.test(path) &&
          !/\/editais\//i.test(path)
        );
      } catch {
        return false;
      }
    });
    if (!link || seen.has(link.url)) return [];
    seen.add(link.url);
    const number = cells[0]!;
    const kind = cells[1] || "Chamada Pública";
    const description = cells[3] || link.title;
    const title = `${kind} ${number} — ${description}`.replace(/\s+/g, " ").trim();
    return [
      draft({
        source: "fap",
        installationId: identity.installationId,
        state: identity.uf,
        kind: "funding",
        title,
        organizationName: identity.acronym,
        audience: identity.audience,
        sourceUrl: link.url,
        status: "open",
        raw: { sourceUrl: link.url },
        now,
      }),
    ];
  });
};

/** Completa documentos (e período, se o post trouxer) sem mudar o `sourceUrl`. */
export const fapegDetail = (
  item: FundingOpportunityDraft,
  html: string,
  identity: FapIdentity,
  now: Date,
): FundingOpportunityDraft | null => {
  const start =
    /<div\b[^>]*class=["'][^"']*\bentry-content\b[^"']*["'][^>]*>/i.exec(html) ??
    /<article\b[^>]*>/i.exec(html);
  if (!start) return item;
  const body = html
    .slice(start.index + start[0].length)
    .split(/<footer\b|<\/article>/i)[0]!;
  const text = textFromHtml(body);
  const period = submissionPeriod(text);
  const seen = new Set<string>();
  const documents = linksFromHtml(body, item.sourceUrl)
    .filter(({ title, url }) => {
      if (!/\.pdf(?:$|[?#])/i.test(url)) return false;
      if (!DOC_OK.test(`${title} ${url}`) || DOC_SKIP.test(`${title} ${url}`))
        return false;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, 5)
    .map(({ title, url }) => ({
      title: title || "Edital",
      url,
      mediaType: "application/pdf" as const,
    }));
  return draft({
    source: "fap",
    installationId: identity.installationId,
    state: identity.uf,
    kind: "funding",
    title: item.title,
    organizationName: identity.acronym,
    audience: identity.audience,
    sourceUrl: item.sourceUrl,
    documents,
    registrationFrom: period?.from,
    registrationTo: period?.to,
    status: period ? undefined : "open",
    raw: { sourceUrl: item.sourceUrl },
    now,
  });
};
