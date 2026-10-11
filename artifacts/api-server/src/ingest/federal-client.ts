import type { OpportunitySource } from "@workspace/db";
import { normalizeText } from "../domain/normalize";
import {
  canonicalUrl,
  endOfDay,
  federalDraft,
  hashedExternalId,
  startOfDay,
  type FederalOpportunityDraft,
} from "./federal-draft";
import {
  BlockedByRobotsError,
  defaultFederalFetch,
  getOk,
  paced,
  robotsGate,
  textOf,
  type FederalFetch,
} from "./federal-http";
import {
  parseGovbrCallPage,
  parseGovbrCards,
  type GovbrCallPage,
  type GovbrCard,
} from "./govbr-parsers";
import {
  DiscricionariasPrograms,
  mapParceriasProgram,
  readCsvFromZip,
  TRANSFEREGOV_API,
  TRANSFEREGOV_PARCERIAS_URL,
  TRANSFEREGOV_PROGRAMS_ZIP_URL,
  type ParceriasProgram,
} from "./transferegov-parsers";

export const FEDERAL_SOURCES = [
  "transferegov",
  "minc",
  "salic",
  "funarte",
] as const satisfies readonly OpportunitySource[];
export type FederalSource = (typeof FEDERAL_SOURCES)[number];

export type FederalSourceResult = {
  source: FederalSource;
  outcome: "ok" | "partial" | "blocked_by_robots" | "failed";
  /** Calls kept for this source, after dropping the ones another source already lists. */
  count: number;
  /** How many of them accept registrations today. */
  open: number;
  message: string | null;
  /** What was read: the official page or endpoint. */
  endpoint: string;
  requests: number;
  /** True when the whole official listing was read, so a call missing from it has left the listing. */
  complete: boolean;
  drafts: FederalOpportunityDraft[];
};

export const FUNARTE_OPEN_URL =
  "https://www.gov.br/funarte/pt-br/editais/editais-abertos";
export const MINC_OPEN_URL =
  "https://www.gov.br/cultura/pt-br/assuntos/editais/inscricoes-abertas";
const FUNARTE_SITE = "https://www.gov.br/funarte/";
const MINC_SITE = "https://www.gov.br/cultura/";
const GOVBR_ROBOTS = "https://www.gov.br/robots.txt";
const SALIC_HOST = "salic.cultura.gov.br";
const MAPA_CULTURA_CALL =
  /^https?:\/\/mapa\.cultura\.gov\.br\/oportunidade\/\d+/i;

/** Ceilings that keep a run small even if a listing grows or a page starts linking to itself. */
const MAX_CARDS = 30;
const MAX_CALLS_PER_PROGRAMME = 12;
const MAX_REDIRECTS = 3;
const MAX_REQUESTS_PER_SOURCE = 60;
const MAX_PARCERIAS_PAGES = 10;
const PARCERIAS_PAGE_SIZE = 200;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Counts the requests of one source and stops it at the daily ceiling, whatever its pages link to. */
const counting = (fetcher: FederalFetch) => {
  const counter = { requests: 0 };
  const counted: FederalFetch = (url) => {
    if (counter.requests >= MAX_REQUESTS_PER_SOURCE)
      throw new Error("Teto de requisições por coleta atingido.");
    counter.requests += 1;
    return fetcher(url);
  };
  return { counter, counted };
};

const openCount = (drafts: FederalOpportunityDraft[]): number =>
  drafts.filter((draft) => draft.status === "open").length;

type Collected = {
  drafts: FederalOpportunityDraft[];
  complete: boolean;
  notes: string[];
};

const collectTransferegov = async (
  fetcher: FederalFetch,
  now: Date,
): Promise<Collected> => {
  const allowed = robotsGate(fetcher, [`${TRANSFEREGOV_API}/robots.txt`]);
  const drafts: FederalOpportunityDraft[] = [];
  const notes: string[] = [];
  let complete = true;

  try {
    await allowed(TRANSFEREGOV_PARCERIAS_URL);
    for (let page = 1; page <= MAX_PARCERIAS_PAGES; page += 1) {
      const url = `${TRANSFEREGOV_PARCERIAS_URL}?situacao_programa=Disponibilizado&tamanho_da_pagina=${PARCERIAS_PAGE_SIZE}&pagina=${page}`;
      const body = JSON.parse(textOf(await getOk(fetcher, url))) as {
        data?: unknown;
        total_pages?: unknown;
      };
      if (!Array.isArray(body.data))
        throw new Error("A API de parcerias respondeu sem a lista `data`");
      for (const record of body.data as ParceriasProgram[]) {
        const draft = mapParceriasProgram(record, now);
        if (draft) drafts.push(draft);
      }
      const totalPages = Number(body.total_pages);
      if (!Number.isFinite(totalPages) || page >= totalPages) break;
      if (page === MAX_PARCERIAS_PAGES) {
        complete = false;
        notes.push("Gestão de Parcerias: teto de páginas atingido.");
      }
    }
  } catch (error) {
    if (error instanceof BlockedByRobotsError) throw error;
    complete = false;
    notes.push(`Gestão de Parcerias: ${messageOf(error)}`);
  }

  try {
    await allowed(TRANSFEREGOV_PROGRAMS_ZIP_URL);
    const zip = (await getOk(fetcher, TRANSFEREGOV_PROGRAMS_ZIP_URL)).body;
    const programs = new DiscricionariasPrograms(now);
    await readCsvFromZip(zip, /siconv_programa\.csv$/i, programs.accept);
    drafts.push(...programs.drafts());
  } catch (error) {
    if (error instanceof BlockedByRobotsError) throw error;
    complete = false;
    notes.push(`Discricionárias e Legais: ${messageOf(error)}`);
  }

  if (!complete && drafts.length === 0) throw new Error(notes.join(" "));
  return { drafts, complete, notes };
};

type Resolved =
  | { kind: "page"; url: string; html: string }
  | { kind: "external"; url: string }
  | { kind: "missing"; status: number };

/**
 * Opens a card without leaving the portal. A card may be a redirect: inside the same portal it is
 * followed, to any other host it is kept as the official address and not requested.
 */
const resolveWithin = async (
  fetcher: FederalFetch,
  allowed: (url: string) => Promise<void>,
  site: string,
  startUrl: string,
): Promise<Resolved> => {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!url.startsWith(site)) return { kind: "external", url };
    await allowed(url);
    const response = await fetcher(url);
    if (response.status === 200)
      return { kind: "page", url, html: textOf(response) };
    if (response.status >= 300 && response.status < 400 && response.location) {
      url = response.location;
      continue;
    }
    return { kind: "missing", status: response.status };
  }
  return { kind: "missing", status: 310 };
};

type Portal = {
  site: string;
  listingUrl: string;
  organizationName: string;
  /** Index of the current year, used when the card of an open call points to a page that no longer exists. */
  fallbackIndexUrl?: (now: Date) => string;
};

const hasRegistrationData = (page: GovbrCallPage): boolean =>
  page.registrationFrom !== null ||
  page.registrationTo !== null ||
  page.continuousFlow ||
  page.situation !== null;

const collectPortal = async (
  fetcher: FederalFetch,
  portal: Portal,
  now: Date,
): Promise<Collected> => {
  const allowed = robotsGate(fetcher, [
    GOVBR_ROBOTS,
    `${portal.site}robots.txt`,
  ]);
  await allowed(portal.listingUrl);
  const listing = textOf(await getOk(fetcher, portal.listingUrl));
  const cards = parseGovbrCards(listing, portal.listingUrl);
  const notes: string[] = [];
  let complete = true;
  // An empty listing may be a change in the page markup: nothing is closed on its account.
  if (cards.length === 0) {
    complete = false;
    notes.push("A listagem não trouxe nenhuma chamada.");
  }
  if (cards.length > MAX_CARDS) {
    complete = false;
    notes.push(`Listagem com ${cards.length} chamadas; lidas ${MAX_CARDS}.`);
  }

  const drafts: FederalOpportunityDraft[] = [];
  const seen = new Set<string>();
  const add = (draft: FederalOpportunityDraft) => {
    if (seen.has(draft.externalId)) return;
    seen.add(draft.externalId);
    drafts.push(draft);
  };

  const fromPage = (
    card: GovbrCard,
    url: string,
    page: GovbrCallPage,
    originName: string | null,
  ): FederalOpportunityDraft => {
    const address = canonicalUrl(url);
    const viaSalic = page.links.some((link) => {
      try {
        return new URL(link).hostname === SALIC_HOST;
      } catch {
        return false;
      }
    });
    const source: OpportunitySource =
      viaSalic && portal.site === MINC_SITE
        ? "salic"
        : portal.site === MINC_SITE
          ? "minc"
          : "funarte";
    return federalDraft({
      source,
      externalId: hashedExternalId(address),
      kind: "culture",
      title: page.title ?? card.title,
      summary: page.summary,
      organizationName: portal.organizationName,
      audience: page.audience,
      documents: page.documents,
      registrationFrom: startOfDay(page.registrationFrom),
      registrationTo: endOfDay(page.registrationTo),
      continuousFlow: page.continuousFlow && page.registrationTo === null,
      listedAsOpen: true,
      cultural: true,
      opportunityType: source === "salic" ? "Lei Rouanet" : null,
      originName,
      sourceUrl: address,
      aliases: [
        address,
        ...page.links.filter((link) => MAPA_CULTURA_CALL.test(link)),
      ],
      raw: {
        listedAt: portal.listingUrl,
        cardUrl: card.url,
        situation: page.situation,
        registrationFrom: page.registrationFrom,
        registrationTo: page.registrationTo,
        continuousFlow: page.continuousFlow,
      },
      now,
    });
  };

  /** The listing says the call is open; with no page of its own, the card is all there is. */
  const fromCard = (
    card: GovbrCard,
    officialUrl: string,
    note: string,
    aliases: string[] = [],
  ) =>
    federalDraft({
      source: portal.site === MINC_SITE ? "minc" : "funarte",
      externalId: hashedExternalId(canonicalUrl(card.url)),
      kind: "culture",
      title: card.title,
      organizationName: portal.organizationName,
      listedAsOpen: true,
      cultural: true,
      sourceUrl: officialUrl,
      aliases,
      raw: { listedAt: portal.listingUrl, cardUrl: card.url, note },
      now,
    });

  let fallbackCards: Promise<GovbrCard[]> | undefined;
  const fallbackFor = async (card: GovbrCard): Promise<string | null> => {
    if (!portal.fallbackIndexUrl) return null;
    const indexUrl = portal.fallbackIndexUrl(now);
    fallbackCards ??= (async () => {
      try {
        await allowed(indexUrl);
        return parseGovbrCards(
          textOf(await getOk(fetcher, indexUrl)),
          indexUrl,
        );
      } catch {
        return [];
      }
    })();
    const wanted = normalizeText(card.title);
    return (
      (await fallbackCards).find(
        (candidate) =>
          normalizeText(candidate.title) === wanted &&
          candidate.url !== card.url,
      )?.url ?? null
    );
  };

  for (const card of cards.slice(0, MAX_CARDS)) {
    try {
      let resolved = await resolveWithin(
        fetcher,
        allowed,
        portal.site,
        card.url,
      );
      if (resolved.kind === "missing") {
        const fallback = await fallbackFor(card);
        if (fallback)
          resolved = await resolveWithin(
            fetcher,
            allowed,
            portal.site,
            fallback,
          );
      }
      if (resolved.kind === "external") {
        add(
          fromCard(card, resolved.url, "O cartão aponta para outro site.", [
            resolved.url,
          ]),
        );
        continue;
      }
      if (resolved.kind === "missing") {
        notes.push(
          `"${card.title}": página respondeu HTTP ${resolved.status}.`,
        );
        add(
          fromCard(
            card,
            portal.listingUrl,
            "A página do cartão não respondeu.",
          ),
        );
        continue;
      }
      const page = parseGovbrCallPage(resolved.html, resolved.url);
      if (page.cards.length === 0 || hasRegistrationData(page)) {
        add(fromPage(card, resolved.url, page, null));
        continue;
      }
      // A programme page: its cards are the calls. Pages with no registration data are notices.
      const programme = page.title ?? card.title;
      let calls = 0;
      if (page.cards.length > MAX_CALLS_PER_PROGRAMME) {
        complete = false;
        notes.push(
          `"${programme}": ${page.cards.length} chamadas; lidas ${MAX_CALLS_PER_PROGRAMME}.`,
        );
      }
      for (const inner of page.cards.slice(0, MAX_CALLS_PER_PROGRAMME)) {
        const leaf = await resolveWithin(
          fetcher,
          allowed,
          portal.site,
          inner.url,
        );
        if (leaf.kind !== "page") continue;
        const leafPage = parseGovbrCallPage(leaf.html, leaf.url);
        if (!hasRegistrationData(leafPage)) continue;
        add(fromPage(inner, leaf.url, leafPage, programme));
        calls += 1;
      }
      if (calls === 0) add(fromPage(card, resolved.url, page, null));
    } catch (error) {
      if (error instanceof BlockedByRobotsError) throw error;
      complete = false;
      notes.push(`"${card.title}": ${messageOf(error)}`);
    }
  }
  return { drafts, complete, notes };
};

const funartePortal: Portal = {
  site: FUNARTE_SITE,
  listingUrl: FUNARTE_OPEN_URL,
  organizationName: "Funarte — Fundação Nacional de Artes",
  fallbackIndexUrl: (now) =>
    `https://www.gov.br/funarte/pt-br/editais/${now.getUTCFullYear()}`,
};

const mincPortal: Portal = {
  site: MINC_SITE,
  listingUrl: MINC_OPEN_URL,
  organizationName: "Ministério da Cultura",
};

const endpoints: Record<FederalSource, string> = {
  transferegov: `${TRANSFEREGOV_PARCERIAS_URL} + ${TRANSFEREGOV_PROGRAMS_ZIP_URL}`,
  minc: MINC_OPEN_URL,
  salic: `${MINC_OPEN_URL} (chamadas com inscrição pelo Salic)`,
  funarte: FUNARTE_OPEN_URL,
};

/**
 * Reads the federal culture sources once. Transferegov is an open-data API; MinC and Funarte are public
 * gov.br pages read the way a visitor would, after their robots.txt. Lei Rouanet calls are the MinC calls
 * whose registration happens in Salic: the Salic API lists projects already submitted, not calls.
 */
export const collectFederalOnce = async (options?: {
  fetcher?: FederalFetch;
  now?: Date;
  delayMs?: number;
}): Promise<FederalSourceResult[]> => {
  const now = options?.now ?? new Date();
  const delayMs =
    options?.delayMs ??
    Number(process.env.CULTURE_FEDERAL_PAGE_DELAY_MS ?? 1_000);
  const base = paced(options?.fetcher ?? defaultFederalFetch, delayMs);

  const run = async (
    collect: (fetcher: FederalFetch) => Promise<Collected>,
  ): Promise<
    | (Collected & { outcome: "ok" | "partial"; requests: number })
    | {
        outcome: "blocked_by_robots" | "failed";
        message: string;
        requests: number;
      }
  > => {
    const { counter, counted } = counting(base);
    try {
      const collected = await collect(counted);
      return {
        ...collected,
        outcome: collected.complete ? "ok" : "partial",
        requests: counter.requests,
      };
    } catch (error) {
      return {
        outcome:
          error instanceof BlockedByRobotsError
            ? "blocked_by_robots"
            : "failed",
        message: messageOf(error),
        requests: counter.requests,
      };
    }
  };

  const transferegov = await run((fetcher) =>
    collectTransferegov(fetcher, now),
  );
  const minc = await run((fetcher) => collectPortal(fetcher, mincPortal, now));
  const funarte = await run((fetcher) =>
    collectPortal(fetcher, funartePortal, now),
  );

  // The same call can be listed by MinC and by Funarte; the first source to list it keeps it.
  const claimed = new Set<string>();
  const unique = (drafts: FederalOpportunityDraft[]) => {
    const kept: FederalOpportunityDraft[] = [];
    let dropped = 0;
    for (const draft of drafts) {
      if (draft.aliases.some((alias) => claimed.has(alias))) {
        dropped += 1;
        continue;
      }
      kept.push(draft);
    }
    for (const draft of kept)
      for (const alias of draft.aliases) claimed.add(alias);
    return { kept, dropped };
  };

  const result = (
    source: FederalSource,
    outcome: Awaited<ReturnType<typeof run>>,
    select: (draft: FederalOpportunityDraft) => boolean,
    countRequests: boolean,
  ): FederalSourceResult => {
    if (!("drafts" in outcome))
      return {
        source,
        outcome: outcome.outcome,
        count: 0,
        open: 0,
        message: outcome.message,
        endpoint: endpoints[source],
        requests: countRequests ? outcome.requests : 0,
        complete: false,
        drafts: [],
      };
    const { kept, dropped } = unique(outcome.drafts.filter(select));
    const notes = [
      ...(source === "salic" ? [] : outcome.notes),
      ...(dropped > 0
        ? [`${dropped} chamada(s) já listada(s) por outra fonte.`]
        : []),
    ];
    return {
      source,
      outcome: outcome.outcome,
      count: kept.length,
      open: openCount(kept),
      message: notes.length > 0 ? notes.join(" ") : null,
      endpoint: endpoints[source],
      requests: countRequests ? outcome.requests : 0,
      complete: outcome.complete,
      drafts: kept,
    };
  };

  return [
    result("transferegov", transferegov, () => true, true),
    result("minc", minc, (draft) => draft.source === "minc", true),
    result("salic", minc, (draft) => draft.source === "salic", false),
    result("funarte", funarte, () => true, true),
  ];
};
