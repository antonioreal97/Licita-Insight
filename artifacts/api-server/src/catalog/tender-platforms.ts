import { normalizeText } from "../domain/normalize";

export type TenderPlatform = { slug: string; label: string };
export type TenderPlatformKind = "platform" | "source_system" | "other" | "unknown";

type KnownPlatform = TenderPlatform & {
  url: string | null;
  /** Matched against the normalized PNCP `usuarioNome`. */
  names: RegExp[];
  /** Registrable domains seen in `linkSistemaOrigem` / `linkProcessoEletronico`. */
  hosts: string[];
};

/**
 * Bidding rooms ("salas de disputa"). Names and hosts come from the open tenders in production
 * (`raw_payload->'publication'->>'usuarioNome'`, `linkSistemaOrigem`), October 2026.
 */
export const TENDER_PLATFORMS: readonly KnownPlatform[] = [
  {
    slug: "comprasgov",
    label: "Compras.gov.br",
    url: "https://www.gov.br/compras/pt-br",
    names: [/^compras\.gov\.br$/, /\bcomprasnet\b/],
    hosts: ["compras.gov.br", "comprasnet.gov.br", "comprasgovernamentais.gov.br", "cnetmobile.estaleiro.serpro.gov.br"],
  },
  {
    slug: "licitanet",
    label: "Licitanet",
    url: "https://licitanet.com.br",
    names: [/\blicitanet\b/],
    hosts: ["licitanet.com.br"],
  },
  {
    slug: "bll",
    label: "BLL Compras",
    url: "https://bllcompras.com",
    names: [/\bbll\b/],
    hosts: ["bllcompras.com", "bll.org.br"],
  },
  {
    slug: "bnc",
    label: "BNC (Bolsa Nacional de Compras)",
    url: "https://bnccompras.com",
    names: [/bolsa nacional de compras/, /\bbnc\b/],
    hosts: ["bnccompras.com"],
  },
  {
    slug: "portal-compras-publicas",
    label: "Portal de Compras Públicas",
    url: "https://www.portaldecompraspublicas.com.br",
    names: [/\becustomize\b/],
    hosts: ["portaldecompraspublicas.com.br"],
  },
  {
    slug: "licitacoes-e",
    label: "Licitações-e (Banco do Brasil)",
    url: "https://www.licitacoes-e.com.br",
    names: [/\blicitacoes-e\b/],
    hosts: ["licitacoes-e.com.br", "licitacoes-e2.bb.com.br"],
  },
  {
    slug: "licitar-digital",
    label: "Licitar Digital",
    url: "https://licitardigital.com.br",
    names: [/\blicitar digital\b/],
    hosts: ["licitardigital.com.br", "ammlicita.org.br"],
  },
  {
    slug: "bbmnet",
    label: "BBMNET",
    url: "https://bbmnet.com.br",
    names: [/\bbbmnet\b/],
    hosts: ["bbmnet.com.br", "novobbmnet.com.br"],
  },
  {
    slug: "licita-mais-brasil",
    label: "Licita + Brasil",
    url: "https://licitamaisbrasil.com.br",
    names: [/^licita \+ brasil$/],
    hosts: ["licitamaisbrasil.com.br"],
  },
  {
    slug: "comprasbr",
    label: "ComprasBR",
    url: "https://comprasbr.com.br",
    names: [/^comprasbr$/],
    hosts: ["comprasbr.com.br"],
  },
  {
    slug: "contrata-mais-brasil",
    label: "Contrata+Brasil",
    url: "https://contratamaisbrasil.sistema.gov.br",
    names: [/^contrata\s*\+\s*brasil$/],
    hosts: ["contratamaisbrasil.sistema.gov.br"],
  },
  {
    slug: "pregao-banrisul",
    label: "Pregão Banrisul",
    url: "https://pregaobanrisul.com.br",
    names: [],
    hosts: ["pregaobanrisul.com.br"],
  },
  {
    slug: "compras-rs",
    label: "Compras RS",
    url: "https://www.compras.rs.gov.br",
    names: [],
    hosts: ["compras.rs.gov.br"],
  },
  {
    slug: "compras-mg",
    label: "Portal de Compras MG",
    url: "https://www1.compras.mg.gov.br",
    names: [/^portal de compras do estado de minas gerais$/],
    hosts: ["compras.mg.gov.br"],
  },
  {
    slug: "compras-rj",
    label: "Portal de Compras RJ (SIGA)",
    url: "https://www.compras.rj.gov.br",
    names: [/^portal de compras publicas do estado do rio de janeiro$/],
    hosts: ["compras.rj.gov.br"],
  },
  {
    slug: "e-compras-am",
    label: "e-Compras AM",
    url: "https://www.e-compras.am.gov.br",
    names: [],
    hosts: ["e-compras.am.gov.br"],
  },
];

/** Federal supplier registry. Not a bidding room, but editais demand it next to the platform. */
export const SICAF_REGISTRY = { slug: "sicaf", label: "SICAF", url: null } as const;

/**
 * Public-management software that publishes to the PNCP for the agency but does not host the bidding.
 * When no link points to a known room, the badge says "Sistema de origem", never "Disputa em".
 */
const SOURCE_SYSTEMS: readonly RegExp[] = [
  /\bipm sistemas\b/,
  /\bbetha\b/,
  /\bfiorilli\b/,
  /\bmegasoft\b/,
  /\btecnosweb\b/,
  /\bsmarapd\b/,
  /\baz informatica\b/,
  /^e & l producoes de software\b/,
  /\belotech\b/,
  /\babase sistemas\b/,
  /\bnovoserv\b/,
  /\bprodata informatica\b/,
  /\bgemmap\b/,
  /\bgrupo assessor\b/,
  /\bpublica tecnologia\b/,
  /^centi$/,
  /\bsisvetor\b/,
  /\bequiplano\b/,
  /\bembras\b/,
  /\bcecam\b/,
  /\bsystem desenvolvimento de software\b/,
  /\bkp sistemas\b/,
  /\belmar tecnologia\b/,
  /\bsh3 informatica\b/,
  /\bgcaspp\b/,
  /\b3tecnos\b/,
  /\bmemory projetos\b/,
  /\bj brasil sistemas\b/,
  /\bobara informatica\b/,
  /\bagili software\b/,
  /\bcitta informatica\b/,
  /\bdigifred\b/,
  /\badpm\b/,
  /\beddydata\b/,
  /\bsonner sistemas\b/,
  /\bdbseller\b/,
  /\blemarq\b/,
  /\bm2a tecnologia\b/,
  /\blicitacon\b/,
];

export const UNKNOWN_PLATFORM: TenderPlatform = {
  slug: "nao-informado",
  label: "Sistema não informado",
};

const SOURCE_SYSTEM_PREFIX = "origem-";
const OTHER_PREFIX = "outro-";

const PLATFORM_BY_SLUG = new Map<string, KnownPlatform>(
  TENDER_PLATFORMS.map((platform) => [platform.slug, platform]),
);

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const displayName = (value: string): string => value.replace(/\s+/g, " ").trim();

const slugPart = (value: string): string =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

const linkHost = (value: unknown): string | null => {
  const text = asText(value);
  if (!text) return null;
  const candidate = /^https?:\/\//i.test(text)
    ? text
    : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(text)
      ? `https://${text}`
      : null;
  return candidate && URL.canParse(candidate)
    ? new URL(candidate).hostname.toLowerCase()
    : null;
};

const hostMatches = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

const platformForHost = (host: string): KnownPlatform | undefined =>
  TENDER_PLATFORMS.find((platform) =>
    platform.hosts.some((domain) => hostMatches(host, domain)),
  );

/**
 * Normalizes the PNCP `usuarioNome` (the system that published the purchase) into the bidding platform.
 * Order: a known room by name; otherwise a known room in `linkSistemaOrigem`/`linkProcessoEletronico`;
 * otherwise the publisher labeled for what it is ("Sistema de origem" or "Outro sistema"). Nothing is guessed.
 */
export const platformFromPublication = (
  record: Record<string, unknown>,
): TenderPlatform => {
  const rawName = asText(record.usuarioNome);
  const name = rawName ? normalizeText(rawName) : null;
  const byName = name
    ? TENDER_PLATFORMS.find((platform) => platform.names.some((pattern) => pattern.test(name)))
    : undefined;
  if (byName) return { slug: byName.slug, label: byName.label };

  for (const link of [record.linkSistemaOrigem, record.linkProcessoEletronico]) {
    const host = linkHost(link);
    const byHost = host ? platformForHost(host) : undefined;
    if (byHost) return { slug: byHost.slug, label: byHost.label };
  }

  if (!rawName || !name) return UNKNOWN_PLATFORM;
  const label = displayName(rawName);
  const part = slugPart(rawName) || "sem-nome";
  return SOURCE_SYSTEMS.some((pattern) => pattern.test(name))
    ? { slug: `${SOURCE_SYSTEM_PREFIX}${part}`, label: `Sistema de origem: ${label}` }
    : { slug: `${OTHER_PREFIX}${part}`, label: `Outro sistema: ${label}` };
};

export const platformKind = (slug: string): TenderPlatformKind => {
  if (PLATFORM_BY_SLUG.has(slug)) return "platform";
  if (slug.startsWith(SOURCE_SYSTEM_PREFIX)) return "source_system";
  if (slug.startsWith(OTHER_PREFIX)) return "other";
  return "unknown";
};

export const platformUrl = (slug: string): string | null =>
  PLATFORM_BY_SLUG.get(slug)?.url ?? null;

/** What a company can say it is registered in: every known room plus SICAF. */
export const REGISTRATION_OPTIONS = [
  ...TENDER_PLATFORMS.map(({ slug, label, url }) => ({ slug, label, url })),
  SICAF_REGISTRY,
];

const REGISTRATION_SLUGS = new Set(REGISTRATION_OPTIONS.map(({ slug }) => slug));

export const isRegistrationSlug = (value: unknown): value is string =>
  typeof value === "string" && REGISTRATION_SLUGS.has(value);

export const registrationLabel = (slug: string): string =>
  REGISTRATION_OPTIONS.find((option) => option.slug === slug)?.label ?? slug;
