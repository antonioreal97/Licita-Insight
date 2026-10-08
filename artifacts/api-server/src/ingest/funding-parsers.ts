import { createHash } from "node:crypto";
import { normalizeText } from "../domain/normalize";
import { opportunityStatus, type OpportunityStatus } from "./opportunity-map";
import type {
  OpportunityDocument,
  OpportunityKind,
  OpportunitySource,
} from "@workspace/db";

export type FundingOpportunityDraft = {
  id: string;
  installationId: OpportunitySource;
  externalId: string;
  kind: OpportunityKind;
  source: OpportunitySource;
  title: string;
  summary: string | null;
  organizationName: string;
  audience: string | null;
  amount: number | null;
  documents: OpportunityDocument[];
  state: string | null;
  registrationFrom: Date | null;
  registrationTo: Date | null;
  status: OpportunityStatus;
  sourceUrl: string;
  searchText: string;
  raw: Record<string, unknown>;
};

const entities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  ndash: "–",
  mdash: "—",
  deg: "°",
  ordm: "º",
  ordf: "ª",
};

export const decodeHtml = (value: string): string =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const parsed = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : _match;
    }
    return entities[entity.toLowerCase()] ?? _match;
  });

export const textFromHtml = (value: string): string =>
  decodeHtml(
    value
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>|<\/li>|<\/h\d>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[\t\r ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

const absoluteUrl = (href: string, baseUrl: string): string =>
  new URL(decodeHtml(href), baseUrl).toString();

const linksFromHtml = (
  html: string,
  baseUrl: string,
): Array<{ title: string; url: string }> =>
  [
    ...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  ].flatMap((match) => {
    try {
      const title = textFromHtml(match[2] ?? "");
      return title
        ? [{ title, url: absoluteUrl(match[1] ?? "", baseUrl) }]
        : [];
    } catch {
      return [];
    }
  });

const parseBrazilianDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const amountFromText = (text: string): number | null => {
  const match = /R\$\s*([\d.]+,\d{2})/i.exec(text);
  if (!match) return null;
  const amount = Number(match[1]!.replaceAll(".", "").replace(",", "."));
  return Number.isFinite(amount) ? amount : null;
};

const idFor = (source: OpportunitySource, url: string): string => {
  const digest = createHash("sha256").update(url).digest("hex").slice(0, 24);
  return `${source}-${digest}`;
};

const draft = (input: {
  source: OpportunitySource;
  kind: OpportunityKind;
  title: string;
  summary?: string | null;
  organizationName: string;
  audience?: string | null;
  sourceUrl: string;
  documents?: OpportunityDocument[];
  registrationFrom?: Date | null;
  registrationTo?: Date | null;
  status?: OpportunityStatus;
  raw?: Record<string, unknown>;
  now: Date;
}): FundingOpportunityDraft => {
  const registrationFrom = input.registrationFrom ?? null;
  const registrationTo = input.registrationTo ?? null;
  const summary = input.summary ?? null;
  const audience = input.audience ?? null;
  const amount = amountFromText(`${input.title} ${summary ?? ""}`);
  const externalId = idFor(input.source, input.sourceUrl).slice(
    input.source.length + 1,
  );
  return {
    id: `${input.source}-${externalId}`,
    installationId: input.source,
    externalId,
    kind: input.kind,
    source: input.source,
    title: input.title,
    summary,
    organizationName: input.organizationName,
    audience,
    amount,
    documents: input.documents ?? [],
    state: null,
    registrationFrom,
    registrationTo,
    status:
      input.status ??
      opportunityStatus(registrationFrom, registrationTo, false, input.now),
    sourceUrl: input.sourceUrl,
    searchText: normalizeText(
      [
        input.title,
        summary,
        input.organizationName,
        audience,
        input.source,
        input.kind,
      ]
        .filter(Boolean)
        .join(" "),
    ),
    raw: input.raw ?? { sourceUrl: input.sourceUrl },
  };
};

const pdfDocuments = (html: string, baseUrl: string): OpportunityDocument[] =>
  linksFromHtml(html, baseUrl)
    .filter(({ url }) => /\.pdf(?:$|[?#])/i.test(url))
    .map(({ title, url }) => ({ title, url, mediaType: "application/pdf" }));

export const parseCnpqOpportunities = (
  html: string,
  now = new Date(),
): FundingOpportunityDraft[] => {
  const baseUrl =
    "https://www.gov.br/cnpq/pt-br/chamadas/abertas-para-submissao";
  const chunks = html
    .split(/<div class=["']item visualIEFloatFix["']>/i)
    .slice(1);
  return chunks.flatMap((chunk) => {
    const headline =
      /<h2\b[^>]*class=["']headline["'][^>]*>([\s\S]*?)<\/h2>/i.exec(
        chunk,
      )?.[1];
    if (!headline) return [];
    const link = linksFromHtml(headline, baseUrl)[0];
    if (!link) return [];
    const content =
      /<div id=["']parent-fieldname-text["'][^>]*>([\s\S]*?)<\/div>/i.exec(
        chunk,
      )?.[1] ?? "";
    const text = textFromHtml(content);
    const dates =
      /Inscri(?:ções|coes)\s*:\s*(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i.exec(
        text,
      );
    const summary = text.split("\n").find((line) => line.length >= 40) ?? null;
    return [
      draft({
        source: "cnpq",
        kind: "funding",
        title: link.title,
        summary,
        organizationName: "CNPq",
        audience: "Pesquisadores, ICTs e instituições elegíveis à chamada",
        sourceUrl: link.url,
        documents: pdfDocuments(content, link.url),
        registrationFrom: parseBrazilianDate(dates?.[1]),
        registrationTo: parseBrazilianDate(dates?.[2]),
        raw: { sourceUrl: link.url, text },
        now,
      }),
    ];
  });
};

export const parseCapesOpportunities = (
  html: string,
  now = new Date(),
): FundingOpportunityDraft[] => {
  const baseUrl =
    "https://www.gov.br/capes/pt-br/assuntos/editais-e-resultados-capes";
  const section =
    /Editais Abertos<\/h2>\s*<ul>([\s\S]*?)<\/ul>/i.exec(html)?.[1] ?? "";
  const seen = new Set<string>();
  return linksFromHtml(section, baseUrl).flatMap((link) => {
    if (seen.has(link.url)) return [];
    seen.add(link.url);
    return [
      draft({
        source: "capes",
        kind: "funding",
        title: link.title,
        organizationName: "CAPES",
        audience:
          "Estudantes, pesquisadores e instituições elegíveis ao programa",
        sourceUrl: link.url,
        documents: /\.pdf(?:\/|$|[?#])/i.test(link.url)
          ? [
              {
                title: link.title,
                url: link.url,
                mediaType: "application/pdf",
              },
            ]
          : [],
        status: "open",
        raw: { sourceUrl: link.url },
        now,
      }),
    ];
  });
};

/** Parser mantido para fixtures e para uso futuro caso a FINEP passe a autorizar coleta no robots.txt. */
export const parseFinepOpportunities = (
  html: string,
  now = new Date(),
): FundingOpportunityDraft[] => {
  const baseUrl = "https://www.finep.gov.br/chamadas-publicas";
  const seen = new Set<string>();
  return linksFromHtml(html, baseUrl).flatMap((link) => {
    if (!/\/chamadas-publicas\/chamadapublica\/\d+(?:$|[?#])/i.test(link.url))
      return [];
    if (seen.has(link.url)) return [];
    seen.add(link.url);
    return [
      draft({
        source: "finep",
        kind: "innovation",
        title: link.title,
        organizationName: "FINEP",
        audience: "Empresas, startups e ICTs elegíveis à chamada",
        sourceUrl: link.url,
        status: "open",
        raw: { sourceUrl: link.url },
        now,
      }),
    ];
  });
};

export const enrichFinepOpportunity = (
  opportunity: FundingOpportunityDraft,
  html: string,
  now = new Date(),
): FundingOpportunityDraft => {
  const text = textFromHtml(html);
  const dates =
    /(?:Inscri(?:ções|coes)|Prazo|Período)\s*:\s*(\d{2}\/\d{2}\/\d{4})\s+(?:a|até)\s+(\d{2}\/\d{2}\/\d{4})/i.exec(
      text,
    );
  const registrationFrom = parseBrazilianDate(dates?.[1]);
  const registrationTo = parseBrazilianDate(dates?.[2]);
  const audience =
    /Público[- ]alvo\s*:\s*([^\n]+)/i.exec(text)?.[1]?.trim() ??
    opportunity.audience;
  const summary =
    text
      .split("\n")
      .find(
        (line) =>
          line.length >= 60 &&
          !/^(?:Público|Inscri|Prazo|Período|Documentos?)/i.test(line),
      ) ?? opportunity.summary;
  const documents = pdfDocuments(html, opportunity.sourceUrl);
  return {
    ...opportunity,
    summary,
    audience,
    amount: amountFromText(text),
    documents,
    registrationFrom,
    registrationTo,
    status: opportunityStatus(registrationFrom, registrationTo, false, now),
    searchText: normalizeText(
      [
        opportunity.title,
        summary,
        opportunity.organizationName,
        audience,
        opportunity.source,
        opportunity.kind,
      ]
        .filter(Boolean)
        .join(" "),
    ),
    raw: { sourceUrl: opportunity.sourceUrl, text },
  };
};
