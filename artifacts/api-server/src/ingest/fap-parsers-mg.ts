import {
  draft,
  linksFromHtml,
  textFromHtml,
  type FundingOpportunityDraft,
} from "./funding-parsers";
import type { FapIdentity } from "./fap-parsers";

/** Listagem Nuxt filtrada pelas chamadas abertas (payload `__NUXT_DATA__`). */
export const FAPEMIG_OPEN_PAGE =
  "https://fapemig.br/oportunidades/chamadas-e-editais?status=aberta";

const DETAIL_BASE = "https://fapemig.br/oportunidades/chamadas-e-editais";

const DOC_OK = /edital|chamada|retifica/i;
const DOC_SKIP = /resultado|homologa|extrato|di[aá]rio|decis[aã]o administrativa/i;
const STAFF_SELECTION = /\bservidor(?:es)?\b|processo seletivo simplificado|estagi[aá]ri/i;

/** A home liga a listagem de chamadas (com ou sem `?status=aberta`). */
export const fapemigPages = (homeHtml: string): string[] => {
  const found = linksFromHtml(homeHtml, "https://fapemig.br/").some(({ url }) => {
    try {
      const parsed = new URL(url);
      return parsed.pathname.replace(/\/$/, "") === "/oportunidades/chamadas-e-editais";
    } catch {
      return false;
    }
  });
  return found ? [FAPEMIG_OPEN_PAGE] : [];
};

type FapemigAnexo = {
  descricao?: string;
  retificacao?: boolean;
  url_anexo?: string;
  tipo_arquivo?: string;
};

type FapemigCall = {
  titulo?: string;
  slug?: string;
  status_chamada?: string;
  descricao_chamada?: string;
  data_inicio_submissao?: string | null;
  data_fim_submissao?: string | null;
  anexos?: FapemigAnexo[];
};

const NUXT_WRAP = new Set([
  "Reactive",
  "ShallowReactive",
  "Ref",
  "EmptyRef",
  "Set",
  "Map",
]);

/** Resolve um índice do payload Nuxt (ou devolve o valor já materializado). */
const nuxtValue = (table: unknown[], value: unknown, seen = new Set<number>()): unknown => {
  if (Array.isArray(value)) {
    if (typeof value[0] === "string" && NUXT_WRAP.has(value[0])) {
      return value.length > 1 ? nuxtValue(table, value[1], seen) : value;
    }
    if (value[0] === "Date") return value[1];
    return value.map((item) => nuxtValue(table, item, seen));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = nuxtValue(table, item, seen);
    }
    return out;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) return value;
  if (value < 0 || value >= table.length || seen.has(value)) return null;
  const next = new Set(seen);
  next.add(value);
  return nuxtValue(table, table[value], next);
};

const extractNuxtTable = (html: string): unknown[] | null => {
  const match =
    /id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html) ??
    /type=["']application\/json["'][^>]*data-nuxt-data[^>]*>([\s\S]*?)<\/script>/i.exec(
      html,
    );
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** Achata o payload e devolve objetos que parecem uma chamada do catálogo. */
const fapemigCallsFromHtml = (html: string): FapemigCall[] => {
  const table = extractNuxtTable(html);
  if (!table?.length) return [];
  const root = nuxtValue(table, 0);
  const found: FapemigCall[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (
      typeof rec.slug === "string" &&
      typeof rec.titulo === "string" &&
      typeof rec.status_chamada === "string"
    ) {
      if (!seen.has(rec.slug)) {
        seen.add(rec.slug);
        found.push(rec as FapemigCall);
      }
      return;
    }
    for (const value of Object.values(rec)) visit(value);
  };
  visit(root);
  return found;
};

const parseFapemigDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(
    trimmed,
  );
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4] ?? "12"}:${match[5] ?? "00"}:${match[6] ?? "00"}-03:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

const callDocuments = (
  anexos: FapemigAnexo[] | undefined,
): FundingOpportunityDraft["documents"] => {
  const seen = new Set<string>();
  return (anexos ?? [])
    .flatMap((anexo) => {
      const url = anexo.url_anexo?.trim();
      const label = (anexo.descricao ?? "").replace(/\s+/g, " ").trim() || "Edital";
      if (!url) return [];
      const haystack = `${label} ${url}`;
      if (DOC_SKIP.test(haystack)) return [];
      if (!(anexo.retificacao || DOC_OK.test(haystack))) return [];
      if (seen.has(url)) return [];
      seen.add(url);
      const mediaType =
        /pdf$/i.test(anexo.tipo_arquivo ?? "") || /\.pdf(?:$|[?#])/i.test(url)
          ? ("application/pdf" as const)
          : null;
      return [{ title: label, url, mediaType }];
    })
    .slice(0, 5);
};

const summaryFrom = (htmlish: string | undefined, title: string): string | null => {
  if (!htmlish) return null;
  const text = textFromHtml(htmlish).replace(/\s+/g, " ").trim();
  if (!text || text === title || text.length < 40) return null;
  return text.slice(0, 400);
};

/**
 * Lê as chamadas no payload Nuxt da listagem `?status=aberta`. Só entram as com
 * `status_chamada === "aberta"` (ou período de submissão explícito). Documentos = edital/chamada/retificação.
 */
export const parseFapemigOpportunities = (
  html: string,
  pageUrl: string,
  identity: FapIdentity,
  now = new Date(),
): FundingOpportunityDraft[] => {
  let parsedPage: URL;
  try {
    parsedPage = new URL(pageUrl);
  } catch {
    return [];
  }
  if (parsedPage.pathname.replace(/\/$/, "") !== "/oportunidades/chamadas-e-editais")
    return [];
  if (parsedPage.searchParams.get("status") !== "aberta") return [];

  return fapemigCallsFromHtml(html).flatMap((call) => {
    const title = (call.titulo ?? "").replace(/\s+/g, " ").trim();
    const slug = (call.slug ?? "").trim();
    if (!title || !slug || STAFF_SELECTION.test(title)) return [];
    if (call.status_chamada?.toLowerCase() !== "aberta") return [];
    const from = parseFapemigDate(call.data_inicio_submissao);
    const to = parseFapemigDate(call.data_fim_submissao);
    const sourceUrl = `${DETAIL_BASE}/${slug}`;
    return [
      draft({
        source: "fap",
        installationId: identity.installationId,
        state: identity.uf,
        kind: "funding",
        title,
        summary: summaryFrom(call.descricao_chamada, title),
        organizationName: identity.acronym,
        audience: identity.audience,
        sourceUrl,
        documents: callDocuments(call.anexos),
        registrationFrom: from,
        registrationTo: to,
        status: from || to ? undefined : "open",
        raw: { sourceUrl },
        now,
      }),
    ];
  });
};
