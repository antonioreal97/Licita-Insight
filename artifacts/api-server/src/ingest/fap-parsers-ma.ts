import {
  draft,
  linksFromHtml,
  parseBrazilianDate,
  textFromHtml,
  type FundingOpportunityDraft,
} from "./funding-parsers";
import { submissionPeriod, type FapIdentity } from "./fap-parsers";

export const FAPEMA_OPEN_PAGE =
  "https://www.fapema.br/category/editais/editais-em-aberto/";

/** Categoria só de editais em aberto (1ª página; a paginação do WordPress fica de fora). */
export const fapemaPages = (homeHtml: string): string[] => {
  const base = FAPEMA_OPEN_PAGE.replace(/\/$/, "");
  const found = linksFromHtml(homeHtml, "https://www.fapema.br/").some(
    ({ url }) => {
      const path = url.replace(/\/$/, "");
      return (
        path === base || path.endsWith("/category/editais/editais-em-aberto")
      );
    },
  );
  return found ? [FAPEMA_OPEN_PAGE] : [];
};

const SKIP_TITLE =
  /\bresultado\b|\bretifica[cç][aã]o\b|\bnot[ií]cia\b|\bservidor(?:es)?\b|\bestagi[aá]ri|\bprocesso seletivo simplificado\b|\bresolu[cç][aã]o\b|\bdiretrizes da chamada\b/i;

/** Período no resumo da listagem ou no post (formato livre da FAPEMA). */
export const fapemaPeriod = (
  text: string,
): { from: Date | null; to: Date | null } | null => {
  const normalized = text.replace(/\s+/g, " ");
  const shared = submissionPeriod(normalized);
  if (shared) return shared;
  // `[\s\S]` (não `[^\d]`): o texto costuma ter "até às 12h" antes das datas.
  const range =
    /per[ií]odo\s+de\s+submiss[\s\S]{0,200}?(\d{2}\/\d{2}\/\d{4})\s*(?:a|at[eé]|[–-])\s*(\d{2}\/\d{2}\/\d{4})/i.exec(
      normalized,
    );
  if (range)
    return {
      from: parseBrazilianDate(range[1]),
      to: parseBrazilianDate(range[2]),
    };
  const until =
    /inscri[cç][oõ]es?\s+[\s\S]{0,80}?at[eé]\s+[\s\S]{0,40}?(\d{2}\/\d{2}\/\d{4})/i.exec(
      normalized,
    );
  return until ? { from: null, to: parseBrazilianDate(until[1]) } : null;
};

const pdfUrl = (href: string): string | null => {
  try {
    const url = new URL(href);
    const file = url.searchParams.get("file");
    if (file && /\.pdf(?:$|[?#])/i.test(file)) return file;
    if (/\.pdf(?:$|[?#])/i.test(url.pathname)) return url.toString();
  } catch {
    return null;
  }
  return null;
};

/** Cada post da categoria vira uma chamada; o período costuma vir só no `detail`. */
export const parseFapemaOpportunities = (
  html: string,
  pageUrl: string,
  identity: FapIdentity,
  now = new Date(),
): FundingOpportunityDraft[] => {
  if (!/editais-em-aberto/i.test(pageUrl)) return [];
  const main =
    /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html;
  const seen = new Set<string>();
  return [...main.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)].flatMap(
    (heading) => {
      const link = linksFromHtml(heading[1]!, pageUrl)[0];
      if (!link) return [];
      const title = link.title.replace(/\s+/g, " ").trim();
      if (!title || SKIP_TITLE.test(title) || seen.has(link.url)) return [];
      if (!/\b(edital|chamada|concurso)\b/i.test(title)) return [];
      try {
        if (new URL(link.url).origin !== "https://www.fapema.br") return [];
      } catch {
        return [];
      }
      seen.add(link.url);
      const start = main.indexOf(heading[0]!) + heading[0]!.length;
      const nextHeading = main.slice(start).search(/<h3\b/i);
      const after = main.slice(
        start,
        nextHeading < 0 ? start + 800 : start + nextHeading,
      );
      const period = fapemaPeriod(textFromHtml(after));
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
          registrationFrom: period?.from,
          registrationTo: period?.to,
          status: period ? undefined : "open",
          raw: { sourceUrl: link.url },
          now,
        }),
      ];
    },
  );
};

/** Lê o post: exige período de submissão/inscrição; documentos só do edital e retificações. */
export const fapemaDetail = (
  item: FundingOpportunityDraft,
  html: string,
  identity: FapIdentity,
  now: Date,
): FundingOpportunityDraft | null => {
  const start = /<article\b[^>]*>/i.exec(html);
  if (!start) return null;
  const body = html
    .slice(start.index + start[0].length)
    .split(/<\/article>/i)[0]!;
  const text = textFromHtml(body);
  if (SKIP_TITLE.test(item.title) && /resultado/i.test(text.slice(0, 400)))
    return null;
  const period =
    fapemaPeriod(text) ??
    (item.registrationFrom || item.registrationTo
      ? { from: item.registrationFrom, to: item.registrationTo }
      : null);
  if (!period) return null;
  const seen = new Set<string>();
  const documents: FundingOpportunityDraft["documents"] = [];
  // Rótulos do acordeão ("31/08 - EDITAL") ficam no `<a href="#">` imediatamente antes do PDF.
  const labeled = [
    ...body.matchAll(
      /<a\b[^>]*href=["']#[^"']*["'][^>]*>([\s\S]*?)<\/a>[\s\S]{0,400}?viewer\.php\?file=([^"'&]+)/gi,
    ),
  ];
  for (const match of labeled) {
    const label = textFromHtml(match[1] ?? "").replace(/\s+/g, " ").trim();
    const url = decodeURIComponent(match[2] ?? "");
    if (!url || seen.has(url)) continue;
    const blob = `${label} ${url}`;
    if (/resultado|homologa|nota[_-\s]?oficial|di[aá]rio/i.test(blob)) continue;
    if (!/edital|retifica|anexo|chamada/i.test(blob)) continue;
    seen.add(url);
    documents.push({ title: label || "Edital", url, mediaType: "application/pdf" });
    if (documents.length >= 5) break;
  }
  if (!documents.length) {
    for (const { title, url: href } of linksFromHtml(body, item.sourceUrl)) {
      const url = pdfUrl(href);
      if (!url || seen.has(url)) continue;
      const label = title.replace(/^tela cheia$/i, "").trim() || "Edital";
      const blob = `${label} ${url}`;
      if (/resultado|homologa|nota[_-\s]?oficial|di[aá]rio/i.test(blob)) continue;
      if (!/edital|retifica|anexo|chamada/i.test(blob)) continue;
      seen.add(url);
      documents.push({ title: label, url, mediaType: "application/pdf" });
      if (documents.length >= 5) break;
    }
  }
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
    registrationFrom: period.from,
    registrationTo: period.to,
    raw: { sourceUrl: item.sourceUrl },
    now,
  });
};
