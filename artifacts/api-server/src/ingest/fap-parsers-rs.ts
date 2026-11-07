import {
  draft,
  linksFromHtml,
  textFromHtml,
  type FundingOpportunityDraft,
} from "./funding-parsers";
import { submissionPeriod, type FapIdentity } from "./fap-parsers";

/**
 * Listagem AJAX dos editais abertos (`/_service/...` ligado em `/abertos`).
 * O HTML de `/abertos` vem vazio; o corpo das chamadas está neste JSON permitido no robots.
 */
export const FAPERGS_OPEN_LIST =
  "https://fapergs.rs.gov.br/_service/conteudo/pagedlistfilho?id=2042&templatename=pagina.listapagina.padrao&currentPage=1&pageSize=50&ordem=RECENTES";

const HOME = "https://fapergs.rs.gov.br/";

const DOC_OK = /edital|chamada|retifica|guidelines|guideline/i;
const DOC_SKIP = /resultado|homologa|extrato|di[aá]rio|regulamento bolsa/i;
const SKIP_TITLE =
  /\bresultado\b|\bhomologa|\bservidor(?:es)?\b|\bestagi[aá]ri|\bpr[eê]mio\b/i;

/** Home (ou menu) aponta para `/abertos` ou `/chamadas-e-editais`. */
export const fapergsPages = (homeHtml: string): string[] => {
  const found = linksFromHtml(homeHtml, HOME).some(({ url }) => {
    try {
      const path = new URL(url).pathname.replace(/\/$/, "");
      return path === "/abertos" || path === "/chamadas-e-editais";
    } catch {
      return false;
    }
  });
  return found ? [FAPERGS_OPEN_LIST] : [];
};

const absolutize = (href: string): string => {
  try {
    return new URL(href, HOME).toString();
  } catch {
    return href;
  }
};

/** Corpo HTML dentro do JSON do serviço, ou o próprio HTML se já vier renderizado. */
const listBody = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { body?: unknown };
      return typeof parsed.body === "string" ? parsed.body : "";
    } catch {
      return "";
    }
  }
  return raw;
};

/**
 * Cada artigo da listagem "Abertos" vira uma chamada com `status: "open"`.
 * Resultados no título ficam de fora; o `detail` completa período e PDFs.
 */
export const parseFapergsOpportunities = (
  html: string,
  pageUrl: string,
  identity: FapIdentity,
  now = new Date(),
): FundingOpportunityDraft[] => {
  if (!pageUrl.includes("/_service/conteudo/pagedlistfilho")) return [];
  const body = listBody(html);
  if (!body) return [];
  const seen = new Set<string>();
  return [...body.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].flatMap(
    (match) => {
      const article = match[1] ?? "";
      const link = [...linksFromHtml(article, HOME)].find(({ url }) => {
        try {
          const path = new URL(url).pathname.replace(/\/$/, "");
          return (
            path.length > 1 &&
            !path.startsWith("/abertos") &&
            !path.startsWith("/_service") &&
            !path.startsWith("/upload")
          );
        } catch {
          return false;
        }
      });
      if (!link) return [];
      const title = link.title.replace(/\s+/g, " ").trim();
      if (!title || SKIP_TITLE.test(title)) return [];
      const sourceUrl = absolutize(link.url).split("#")[0]!;
      if (seen.has(sourceUrl)) return [];
      seen.add(sourceUrl);
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
          status: "open",
          raw: { sourceUrl },
          now,
        }),
      ];
    },
  );
};

const detailDocuments = (
  body: string,
  sourceUrl: string,
): FundingOpportunityDraft["documents"] => {
  const seen = new Set<string>();
  return linksFromHtml(body, sourceUrl)
    .flatMap(({ title, url }) => {
      if (!/\.pdf(?:$|[?#])/i.test(url)) return [];
      const label = title.replace(/\s+/g, " ").trim() || "Edital";
      const haystack = `${label} ${url}`;
      if (DOC_SKIP.test(haystack) || !DOC_OK.test(haystack)) return [];
      if (seen.has(url)) return [];
      seen.add(url);
      return [
        {
          title: label.replace(/\(\.pdf[^)]*\)/i, "").trim() || "Edital",
          url: absolutize(url),
          mediaType: "application/pdf" as const,
        },
      ];
    })
    .slice(0, 5);
};

/** Completa período (se o post trouxer) e PDFs do edital/retificações, sem mudar o `sourceUrl`. */
export const fapergsDetail = (
  item: FundingOpportunityDraft,
  html: string,
  identity: FapIdentity,
  now: Date,
): FundingOpportunityDraft | null => {
  if (SKIP_TITLE.test(item.title)) return null;
  const start =
    /<div\b[^>]*class=["'][^"']*\bartigo__texto\b[^"']*["'][^>]*>/i.exec(html) ??
    /<article\b[^>]*>/i.exec(html);
  const body = start
    ? html.slice(start.index + start[0].length).split(/<\/article>|<aside\b/i)[0]!
    : html;
  const text = textFromHtml(body);
  const period = submissionPeriod(text);
  const summary =
    text
      .split("\n")
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length >= 40 &&
          line !== item.title &&
          !/^(arquivos anexos|links relacionados|conte[uú]dos relacionados)/i.test(
            line,
          ) &&
          !/PER[IÍ]ODO\s+DE\s+(?:SUBMISS|INSCRI)/i.test(line),
      ) ?? item.summary;
  return draft({
    source: "fap",
    installationId: identity.installationId,
    state: identity.uf,
    kind: "funding",
    title: item.title,
    summary,
    organizationName: identity.acronym,
    audience: identity.audience,
    sourceUrl: item.sourceUrl,
    documents: detailDocuments(body, item.sourceUrl),
    registrationFrom: period?.from,
    registrationTo: period?.to,
    status: period ? undefined : "open",
    raw: { sourceUrl: item.sourceUrl },
    now,
  });
};
