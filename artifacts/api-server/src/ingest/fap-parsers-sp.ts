import {
  draft,
  linksFromHtml,
  parseBrazilianDate,
  textFromHtml,
  type FundingOpportunityDraft,
} from "./funding-parsers";
import { type FapIdentity } from "./fap-parsers";

export const FAPESP_PAGE = "https://fapesp.br/chamadas";
/** Endereço estável da listagem, inclusive quando o menu aponta para o alias do ano. */
export const pages = (_home: string, _now: Date): string[] => [FAPESP_PAGE];

export const parse = (
  html: string,
  pageUrl: string,
  identity: FapIdentity,
  now = new Date(),
): FundingOpportunityDraft[] => {
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  // Só o primeiro painel, explicitamente aberto; os demais repetem chamadas por modalidade
  // e incluem previsões de lançamento que ainda não recebem propostas.
  const start = /Abertas\s*\(Todas\)/i.exec(clean);
  if (!start) return [];
  const body = clean
    .slice(start.index)
    .split(/<div\b[^>]*class=["'][^"']*accordion-header/i)[0]!;
  const seen = new Set<string>();
  return body
    .split(/<h3\b[^>]*>/i)
    .slice(1)
    .flatMap((block) => {
      const end = block.indexOf("</h3>");
      const link = linksFromHtml(block.slice(0, end), pageUrl)[0];
      if (
        !link ||
        /resultado|retifica|servidor|estagi[aá]rio/i.test(link.title)
      )
        return [];
      const url = new URL(link.url);
      if (!/^(?:www\.)?fapesp\.br$/.test(url.hostname)) return [];
      url.protocol = "https:";
      url.hostname = "fapesp.br";
      const sourceUrl = url.toString();
      if (seen.has(sourceUrl)) return [];
      seen.add(sourceUrl);
      const text = textFromHtml(block.slice(end + 5));
      const deadline = text
        .split("\n")
        .find((line) => /prazo|datas?[- ]limite|submiss[aã]o/i.test(line));
      const to = parseBrazilianDate(
        deadline?.match(/\d{2}\/\d{2}\/\d{4}/)?.[0],
      );
      const documents = linksFromHtml(block, pageUrl)
        .filter(
          ({ title, url }) =>
            /\.pdf(?:$|[?#])/i.test(url) &&
            /edital|chamada|retifica|errata/i.test(title) &&
            !/resultado|extrato|di[aá]rio/i.test(`${title} ${url}`),
        )
        .slice(0, 5)
        .map(({ title, url }) => ({
          title,
          url,
          mediaType: "application/pdf",
        }));
      return [
        draft({
          source: "fap",
          installationId: identity.installationId,
          state: identity.uf,
          kind: "funding",
          organizationName: identity.acronym,
          audience: identity.audience,
          title: link.title,
          summary: text
            .split("\n")
            .filter((line) =>
              /^(?:[ÁA]reas?|Modalidades?|Programa|Prazo|Data|Submiss)/i.test(
                line,
              ),
            )
            .join("\n"),
          sourceUrl,
          registrationTo: to,
          status: to ? undefined : "open",
          documents,
          raw: { sourceUrl },
          now,
        }),
      ];
    });
};
