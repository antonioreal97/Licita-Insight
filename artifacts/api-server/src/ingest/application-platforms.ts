import { mapasInstallations } from "./cultural-installations";

/**
 * Systems where a call takes its applications. A notice that names one of them, next to words about
 * registering or submitting, says where to apply. Add a platform here with the host it answers on; a
 * `home` lets a notice that only names the platform ("via Plataforma Sucupira") point to it.
 */
export type ApplicationPlatform = {
  slug: string;
  /** Name shown to the user. */
  label: string;
  /** Definite article of the name in Portuguese: "na Plataforma Sucupira", "no Salic". */
  article: "a" | "o";
  /** Matches the host of a link to the platform. */
  host: (host: string) => boolean;
  /** Path a link must have to be an application page; the host alone is enough when absent. */
  path?: RegExp;
  /** How a notice names the platform, on accent-free lower-case text. */
  names?: RegExp[];
  /** Entry page used when the notice names the platform without a link. */
  home?: string;
};

const exact =
  (...hosts: string[]) =>
  (host: string): boolean =>
    hosts.includes(host);
const under =
  (...domains: string[]) =>
  (host: string): boolean =>
    domains.some((domain) => host === domain || host.endsWith(`.${domain}`));

const hostOf = (value: string): string | null => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** Hosts of the Mapas Culturais installations the hub collects; their call pages take the applications. */
const mapasHosts = new Set(
  mapasInstallations()
    .map((installation) => hostOf(installation.baseUrl))
    .filter(
      (host): host is string => host !== null && host !== "mapa.cultura.gov.br",
    ),
);

export const APPLICATION_PLATFORMS: ApplicationPlatform[] = [
  {
    slug: "sucupira",
    label: "Plataforma Sucupira",
    article: "a",
    host: exact("sucupira.capes.gov.br"),
    names: [/plataforma sucupira/],
    home: "https://sucupira.capes.gov.br/",
  },
  {
    slug: "sicapes",
    label: "SICAPES",
    article: "o",
    host: exact("inscricao.capes.gov.br", "sicapes.capes.gov.br"),
    names: [/\bsicapes\b/],
    home: "https://inscricao.capes.gov.br/",
  },
  {
    slug: "carlos-chagas",
    label: "Plataforma Carlos Chagas",
    article: "a",
    host: exact("carloschagas.cnpq.br"),
    names: [/plataforma (?:integrada )?carlos chagas/],
    home: "https://carloschagas.cnpq.br/",
  },
  {
    slug: "salic",
    label: "Salic",
    article: "o",
    host: exact("salic.cultura.gov.br"),
    names: [/\bsalic\b/],
    home: "https://salic.cultura.gov.br/",
  },
  {
    slug: "transferegov",
    label: "Transferegov",
    article: "o",
    host: under("transferegov.sistema.gov.br", "plataformamaisbrasil.gov.br"),
    names: [/\btransferegov\b/, /plataforma \+ ?brasil|plataforma mais brasil/],
    home: "https://portal.transferegov.sistema.gov.br/",
  },
  {
    slug: "sigproj",
    label: "SigProj",
    article: "o",
    host: (host) => /(?:^|\.)sigproj\d*\./.test(host),
  },
  {
    slug: "prosas",
    label: "Plataforma Prosas",
    article: "a",
    host: under("prosas.com.br"),
    names: [/plataforma prosas/],
    home: "https://prosas.com.br/",
  },
  {
    slug: "mapa-da-cultura",
    label: "Mapa da Cultura",
    article: "o",
    host: exact("mapa.cultura.gov.br"),
    path: /^\/oportunidade\/\d+/,
  },
  {
    slug: "mapas-culturais",
    label: "Mapas Culturais",
    article: "o",
    host: (host) => mapasHosts.has(host),
    path: /^\/oportunidade\/\d+/,
  },
  {
    slug: "fapesp-sage",
    label: "SAGe (FAPESP)",
    article: "o",
    host: exact("sage.fapesp.br"),
    home: "https://sage.fapesp.br/",
  },
  {
    slug: "sisfaperj",
    label: "SisFAPERJ",
    article: "o",
    host: exact("sisfaperj.faperj.br"),
    names: [/\bsisfaperj\b/],
    home: "https://sisfaperj.faperj.br/",
  },
  {
    slug: "fapemig-everest",
    label: "Everest (FAPEMIG)",
    article: "o",
    host: exact("everest.fapemig.br"),
    home: "https://everest.fapemig.br/",
  },
  {
    slug: "facepe-agil",
    label: "AgilFAP (FACEPE)",
    article: "o",
    host: exact("agil.facepe.br"),
    home: "https://agil.facepe.br/",
  },
  {
    slug: "sigfap",
    label: "SIGFAP",
    article: "o",
    host: (host) => /(?:^|\.)sigfap[a-z]*\./.test(host),
  },
  {
    slug: "eu-funding-tenders",
    label: "Funding & Tenders Portal",
    article: "o",
    host: exact("ec.europa.eu"),
    path: /^\/info\/funding-tenders\/opportunities\/portal\/screen\/(?:opportunities\/topic-details|how-to-participate)\//,
  },
  {
    // EU external action calls take concept notes and applications in PROSPECT, the page of the call.
    slug: "eu-prospect",
    label: "PROSPECT",
    article: "o",
    host: exact("webgate.ec.europa.eu"),
    path: /^\/prospect\//,
  },
  {
    slug: "google-forms",
    label: "Formulário Google",
    article: "o",
    host: (host) => host === "forms.gle" || host === "docs.google.com",
    path: /^\/(?:forms\/|[A-Za-z0-9]+$)/,
  },
  {
    slug: "even3",
    label: "Even3",
    article: "a",
    host: under("even3.com.br"),
  },
];

const bySlug = new Map(
  APPLICATION_PLATFORMS.map((platform) => [platform.slug, platform]),
);

export const platformBySlug = (
  slug: string | null | undefined,
): ApplicationPlatform | null => (slug ? (bySlug.get(slug) ?? null) : null);

/** The platform a link belongs to, when its host and path are one of the application pages above. */
export const platformForUrl = (value: string): ApplicationPlatform | null => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return (
    APPLICATION_PLATFORMS.find(
      (platform) =>
        platform.host(host) &&
        (!platform.path || platform.path.test(url.pathname)),
    ) ?? null
  );
};

export const platformHost = (value: string): string | null => hostOf(value);

/** True when the link is on the host of a known platform, whatever its path. */
export const onPlatformHost = (value: string): boolean => {
  const host = hostOf(value);
  return (
    host !== null &&
    APPLICATION_PLATFORMS.some((platform) => platform.host(host))
  );
};
