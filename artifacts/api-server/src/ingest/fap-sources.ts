import * as fapesp from "./fap-parsers-sp";
import * as faperj from "./fap-parsers-rj";
import {
  fapescPages,
  fapitecPages,
  parseFapescOpportunities,
  parseFapitecOpportunities,
  fapScSeDetail,
} from "./fap-parsers-sc-se-am";
import type { FundingOpportunityDraft } from "./funding-parsers";
import {
  fapdfYearPages,
  parseFapdfOpportunities,
  type FapIdentity,
} from "./fap-parsers";
import {
  fapegDetail,
  fapegPages,
  parseFapegOpportunities,
} from "./fap-parsers-go";
import {
  fapemaDetail,
  fapemaPages,
  parseFapemaOpportunities,
} from "./fap-parsers-ma";
import { facepePages, parseFacepeOpportunities } from "./fap-parsers-pe";
import {
  fapemigPages,
  parseFapemigOpportunities,
} from "./fap-parsers-mg";
import {
  fapergsDetail,
  fapergsPages,
  parseFapergsOpportunities,
} from "./fap-parsers-rs";

type FetchText = (url: string) => Promise<string>;

/** How a FAP's calls are read: the pages to read (found from the home page) and the parser of each page. */
type FapAdapter = {
  pages: (homeHtml: string, now: Date) => string[];
  parse: (
    html: string,
    pageUrl: string,
    identity: FapIdentity,
    now: Date,
  ) => FundingOpportunityDraft[];
  /**
   * For listings that carry no dates: reads each call's own page (`draft.sourceUrl`) and returns the call
   * completed with period, summary and documents, or `null` to drop it (no period, not a call). Keep
   * `sourceUrl` unchanged: the call id is derived from it.
   */
  detail?: (
    draft: FundingOpportunityDraft,
    html: string,
    identity: FapIdentity,
    now: Date,
  ) => FundingOpportunityDraft | null;
};

/** Most call pages read per FAP and per run when the adapter has `detail` (`FAP_MAX_DETAILS`). */
export const fapMaxDetails = (value = process.env.FAP_MAX_DETAILS): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 30;
};

/**
 * - `active`: has an adapter and is read by the daily funding collection.
 * - `pending`: public HTML listing seen in the 2026-11 survey; adapter still to be written.
 * - `blocked_by_robots`: robots.txt forbids automated reading; never collected.
 * - `unreachable`: the site did not answer in the survey; check again before writing an adapter.
 */
export type FapCollection =
  "active" | "pending" | "blocked_by_robots" | "unreachable";

export type FapCatalogEntry = {
  uf: string;
  acronym: string;
  name: string;
  home: string;
  collection: FapCollection;
  adapter?: FapAdapter;
};

/** The 27 state research foundations (one per UF, DF included). Survey: docs/research/fontes-fap-2026-11.md. */
export const FAP_CATALOG: readonly FapCatalogEntry[] = [
  {
    uf: "AC",
    acronym: "FAPAC",
    name: "Fundação de Amparo à Pesquisa do Acre",
    home: "https://fapac.ac.gov.br/",
    collection: "pending",
  },
  {
    uf: "AL",
    acronym: "FAPEAL",
    name: "Fundação de Amparo à Pesquisa do Estado de Alagoas",
    home: "https://www.fapeal.br/",
    collection: "pending",
  },
  {
    uf: "AM",
    acronym: "FAPEAM",
    name: "Fundação de Amparo à Pesquisa do Estado do Amazonas",
    home: "https://www.fapeam.am.gov.br/",
    // Listagem Vue depende de /wp-admin/ proibido; sitemaps indisponíveis.
    collection: "pending",
  },
  {
    uf: "AP",
    acronym: "FAPEAP",
    name: "Fundação de Amparo à Pesquisa do Amapá",
    home: "https://fapeap.portal.ap.gov.br/",
    collection: "pending",
  },
  {
    uf: "BA",
    acronym: "FAPESB",
    name: "Fundação de Amparo à Pesquisa do Estado da Bahia",
    home: "https://www.fapesb.ba.gov.br/",
    collection: "pending",
  },
  {
    uf: "CE",
    acronym: "FUNCAP",
    name: "Fundação Cearense de Apoio ao Desenvolvimento Científico e Tecnológico",
    home: "https://www.funcap.ce.gov.br/",
    collection: "pending",
  },
  {
    uf: "DF",
    acronym: "FAPDF",
    name: "Fundação de Apoio à Pesquisa do Distrito Federal",
    home: "https://www.fap.df.gov.br/",
    collection: "active",
    adapter: { pages: fapdfYearPages, parse: parseFapdfOpportunities },
  },
  {
    uf: "ES",
    acronym: "FAPES",
    name: "Fundação de Amparo à Pesquisa e Inovação do Espírito Santo",
    home: "https://fapes.es.gov.br/",
    collection: "pending",
  },
  {
    uf: "GO",
    acronym: "FAPEG",
    name: "Fundação de Amparo à Pesquisa do Estado de Goiás",
    home: "https://goias.gov.br/fapeg/",
    collection: "active",
    adapter: {
      pages: (home) => fapegPages(home),
      parse: parseFapegOpportunities,
      detail: fapegDetail,
    },
  },
  {
    uf: "MA",
    acronym: "FAPEMA",
    name: "Fundação de Amparo à Pesquisa e ao Desenvolvimento Científico e Tecnológico do Maranhão",
    home: "https://www.fapema.br/",
    collection: "active",
    adapter: {
      pages: (home) => fapemaPages(home),
      parse: parseFapemaOpportunities,
      detail: fapemaDetail,
    },
  },
  {
    uf: "MG",
    acronym: "FAPEMIG",
    name: "Fundação de Amparo à Pesquisa do Estado de Minas Gerais",
    home: "https://fapemig.br/",
    collection: "active",
    adapter: {
      pages: (home) => fapemigPages(home),
      parse: parseFapemigOpportunities,
    },
  },
  {
    uf: "MS",
    acronym: "FUNDECT",
    name: "Fundação de Apoio ao Desenvolvimento do Ensino, Ciência e Tecnologia do Estado de Mato Grosso do Sul",
    home: "https://www.fundect.ms.gov.br/",
    collection: "pending",
  },
  {
    uf: "MT",
    acronym: "FAPEMAT",
    name: "Fundação de Amparo à Pesquisa do Estado de Mato Grosso",
    home: "https://www.fapemat.mt.gov.br/",
    collection: "blocked_by_robots",
  },
  {
    uf: "PA",
    acronym: "FAPESPA",
    name: "Fundação Amazônia de Amparo a Estudos e Pesquisas",
    home: "https://www.fapespa.pa.gov.br/",
    collection: "pending",
  },
  {
    uf: "PB",
    acronym: "FAPESQ",
    name: "Fundação de Apoio à Pesquisa do Estado da Paraíba",
    home: "https://fapesq.rpp.br/",
    collection: "pending",
  },
  {
    uf: "PE",
    acronym: "FACEPE",
    name: "Fundação de Amparo à Ciência e Tecnologia do Estado de Pernambuco",
    home: "https://www.facepe.br/",
    collection: "active",
    adapter: {
      pages: (home) => facepePages(home),
      parse: parseFacepeOpportunities,
    },
  },
  {
    uf: "PI",
    acronym: "FAPEPI",
    name: "Fundação de Amparo à Pesquisa do Estado do Piauí",
    home: "https://www.fapepi.pi.gov.br/",
    collection: "pending",
  },
  {
    uf: "PR",
    acronym: "Fundação Araucária",
    name: "Fundação Araucária de Apoio ao Desenvolvimento Científico e Tecnológico do Paraná",
    home: "https://www.fappr.pr.gov.br/",
    collection: "pending",
  },
  {
    uf: "RJ",
    acronym: "FAPERJ",
    name: "Fundação Carlos Chagas Filho de Amparo à Pesquisa do Estado do Rio de Janeiro",
    home: "https://www.faperj.br/",
    collection: "active",
    adapter: { pages: faperj.pages, parse: faperj.parse },
  },
  {
    uf: "RN",
    acronym: "FAPERN",
    name: "Fundação de Apoio à Pesquisa do Estado do Rio Grande do Norte",
    home: "https://www.fapern.rn.gov.br/",
    collection: "pending",
  },
  {
    uf: "RO",
    acronym: "FAPERO",
    name: "Fundação Rondônia de Amparo ao Desenvolvimento das Ações Científicas e Tecnológicas e à Pesquisa",
    home: "https://fapero.ro.gov.br/",
    collection: "unreachable",
  },
  {
    uf: "RR",
    acronym: "FAPERR",
    name: "Fundação de Amparo à Pesquisa do Estado de Roraima",
    home: "https://faperr.rr.gov.br/",
    collection: "pending",
  },
  {
    uf: "RS",
    acronym: "FAPERGS",
    name: "Fundação de Amparo à Pesquisa do Estado do Rio Grande do Sul",
    home: "https://fapergs.rs.gov.br/",
    collection: "active",
    adapter: {
      pages: (home) => fapergsPages(home),
      parse: parseFapergsOpportunities,
      detail: fapergsDetail,
    },
  },
  {
    uf: "SC",
    acronym: "FAPESC",
    name: "Fundação de Amparo à Pesquisa e Inovação do Estado de Santa Catarina",
    home: "https://fapesc.sc.gov.br/",
    collection: "active",
    adapter: {
      pages: fapescPages,
      parse: parseFapescOpportunities,
      detail: fapScSeDetail,
    },
  },
  {
    uf: "SE",
    acronym: "FAPITEC",
    name: "Fundação de Apoio à Pesquisa e à Inovação Tecnológica do Estado de Sergipe",
    home: "https://fapitec.se.gov.br/",
    collection: "active",
    adapter: {
      pages: fapitecPages,
      parse: parseFapitecOpportunities,
      detail: fapScSeDetail,
    },
  },
  {
    uf: "SP",
    acronym: "FAPESP",
    name: "Fundação de Amparo à Pesquisa do Estado de São Paulo",
    home: "https://fapesp.br/",
    collection: "active",
    adapter: { pages: fapesp.pages, parse: fapesp.parse },
  },
  {
    uf: "TO",
    acronym: "FAPT",
    name: "Fundação de Amparo à Pesquisa do Estado do Tocantins",
    home: "https://www.fapt.to.gov.br/",
    collection: "unreachable",
  },
];

export const fapInstallationId = (uf: string): string =>
  `fap-${uf.toLowerCase()}`;

export const fapIdentity = (entry: FapCatalogEntry): FapIdentity => ({
  installationId: fapInstallationId(entry.uf),
  uf: entry.uf,
  acronym: entry.acronym,
  audience: `Pesquisadores, ICTs e empresas elegíveis ao edital da ${entry.acronym} (${entry.uf})`,
});

/** FAPs read by the collection. `FAP_SOURCES=df,sp` narrows it; `FAP_SOURCES=off` turns them all off. */
export const activeFaps = (
  filter = process.env.FAP_SOURCES,
): FapCatalogEntry[] => {
  const wanted = filter?.trim().toLowerCase();
  if (wanted === "off" || wanted === "false") return [];
  const ufs = wanted ? new Set(wanted.split(/[\s,]+/).filter(Boolean)) : null;
  return FAP_CATALOG.filter(
    (entry) =>
      entry.collection === "active" &&
      entry.adapter &&
      (!ufs || ufs.has(entry.uf.toLowerCase())),
  );
};

/** Reads one FAP: home page (to find the current pages), then each page, waiting `delayMs` between requests. */
export const collectFapDrafts = async (
  entry: FapCatalogEntry,
  options: { fetchText: FetchText; now: Date; wait: () => Promise<void> },
): Promise<{ drafts: FundingOpportunityDraft[]; pages: string[] }> => {
  if (!entry.adapter) return { drafts: [], pages: [] };
  const identity = fapIdentity(entry);
  const home = await options.fetchText(entry.home);
  const pages = entry.adapter.pages(home, options.now);
  if (!pages.length)
    throw new Error(`Nenhuma página de editais encontrada em ${entry.home}`);
  const drafts: FundingOpportunityDraft[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    await options.wait();
    const html = await options.fetchText(page);
    for (const item of entry.adapter.parse(html, page, identity, options.now)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      drafts.push(item);
    }
  }
  const detail = entry.adapter.detail;
  if (!detail) return { drafts, pages };
  // A call page that fails to load keeps the call as listed; the others are still read.
  const completed: FundingOpportunityDraft[] = [];
  for (const [index, item] of drafts.entries()) {
    if (index >= fapMaxDetails()) {
      completed.push(item);
      continue;
    }
    await options.wait();
    let html: string;
    try {
      html = await options.fetchText(item.sourceUrl);
    } catch {
      completed.push(item);
      continue;
    }
    const result = detail(item, html, identity, options.now);
    if (result) completed.push(result);
  }
  return { drafts: completed, pages };
};
