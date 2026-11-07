import {
  draft,
  linksFromHtml,
  parseBrazilianDate,
  textFromHtml,
  type FundingOpportunityDraft,
} from "./funding-parsers";
import { fapAnchor, type FapIdentity } from "./fap-parsers";

export const FAPERJ_PAGE = "https://www.faperj.br/?id=28.5.7";
/** Alias oficial que redireciona para a lista do ano (530.6.6 em novembro de 2026). */
export const pages = (_home: string, _now: Date): string[] => [FAPERJ_PAGE];

// O CMS usa entidades latinas também nos hrefs; o decodificador comum só cobre pontuação.
const latin: Record<string, string> = {
  aacute: "á",
  agrave: "à",
  acirc: "â",
  atilde: "ã",
  eacute: "é",
  ecirc: "ê",
  iacute: "í",
  oacute: "ó",
  ocirc: "ô",
  otilde: "õ",
  uacute: "ú",
  uuml: "ü",
  ccedil: "ç",
};
const decode = (html: string) =>
  html.replace(/&([a-z]+);/gi, (entity, name: string) => {
    const value = latin[name.toLowerCase()];
    return value
      ? name[0] === name[0]!.toUpperCase()
        ? value.toUpperCase()
        : value
      : entity;
  });
const months = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const datesIn = (line: string): Date[] => {
  const numeric = [...line.matchAll(/\d{2}\/\d{2}\/\d{4}/g)].map(([date]) =>
    parseBrazilianDate(date)!,
  );
  if (numeric.length) return numeric;
  const matches = [
    ...line.matchAll(/(\d{1,2})\s+de\s+([a-zç]+)(?:\s+de\s+(\d{4}))?/gi),
  ];
  const year = matches.at(-1)?.[3];
  if (!year) return [];
  const dates = matches.flatMap((match) => {
    const month = months.indexOf(match[2]!.toLowerCase());
    return month < 0
      ? []
      : [
          parseBrazilianDate(
            `${match[1]!.padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${match[3] ?? year}`,
          )!,
        ];
  });
  const short = /:\s*(?:de\s+)?(\d{1,2})\s+a\s+\d{1,2}\s+de/i.exec(line);
  if (short && dates.length === 1) {
    const first = new Date(dates[0]!);
    first.setUTCDate(Number(short[1]));
    dates.unshift(first);
  }
  return dates;
};

export const parse = (
  html: string,
  pageUrl: string,
  identity: FapIdentity,
  now = new Date(),
): FundingOpportunityDraft[] => {
  const clean = decode(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(
        /<span\b[^>]*style=["'][^"']*line-through[^"']*["'][^>]*>[\s\S]*?<\/span>/gi,
        "",
      ),
  );
  const listing = clean.split(/<p>\s*<strong>2\)\s*OUTROS PROGRAMAS/i)[0]!;
  const anchors = [
    ...listing.matchAll(/<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi),
  ].filter(([anchor]) =>
    /^Edital\s+FAPERJ\s+N[º°o]?\s*\d+\s*\/\s*\d{4}/i.test(textFromHtml(anchor)),
  );
  // Brasília (UTC-3). Em janeiro e fevereiro, editais do ano anterior ainda podem estar recebendo propostas.
  const local = new Date(now.getTime() - 3 * 3600000);
  const year = local.getUTCFullYear();
  const years = local.getUTCMonth() < 2 ? [year, year - 1] : [year];
  const seen = new Set<string>();
  return anchors.flatMap((anchor, index) => {
    const block = listing.slice(
      anchor.index,
      anchors[index + 1]?.index ?? listing.length,
    );
    const links = linksFromHtml(block, pageUrl);
    const first = links[0]!;
    let title = first.title;
    // O CMS divide títulos em links para o mesmo PDF, até no meio de uma palavra.
    if (links[1]?.url === first.url)
      title += `${/^[a-záéíóúâêôãõç]/.test(links[1].title) ? "" : " "}${links[1].title}`;
    if (
      !years.some((kept) => title.includes(`/${kept}`)) ||
      /servidor|estagi[aá]rio|conselho superior|listas tr[ií]plices|processo seletivo simplificado/i.test(
        title,
      )
    )
      return [];
    const lines = textFromHtml(block)
      .split("\n")
      .filter(
        (line) =>
          /(?:submiss[aã]o|inscri[cç][aãõoões]+)/i.test(line) && /:/.test(line),
      );
    const periods = lines.map(datesIn).filter((dates) => dates.length);
    if (!periods.length) return [];
    // Em chamadas com fases, o último período explícito de submissão prevalece.
    const dates = periods.at(-1)!;
    const anchorId = fapAnchor(title);
    if (seen.has(anchorId)) return [];
    seen.add(anchorId);
    const ownPage = /\.pdf(?:$|[?#])/i.test(first.url) ? null : first.url;
    const sourceUrl = ownPage ?? `${pageUrl}#${anchorId}`;
    const documents = links
      .filter(
        ({ title, url }) =>
          /\.pdf(?:$|[?#])/i.test(url) &&
          /edital|retifica|errata/i.test(`${title} ${url}`) &&
          !/resultado|extrato|di[aá]rio/i.test(`${title} ${url}`),
      )
      .filter(
        (link, i, all) =>
          all.findIndex((other) => other.url === link.url) === i,
      )
      .slice(0, 5)
      .map(({ title, url }) => ({ title, url, mediaType: "application/pdf" }));
    return [
      draft({
        source: "fap",
        installationId: identity.installationId,
        state: identity.uf,
        kind: "funding",
        organizationName: identity.acronym,
        audience: identity.audience,
        title,
        sourceUrl,
        registrationFrom: dates.length > 1 ? dates[0] : null,
        registrationTo: dates.at(-1),
        documents,
        raw: ownPage ? { sourceUrl } : { sourceUrl: pageUrl, anchor: anchorId },
        now,
      }),
    ];
  });
};
