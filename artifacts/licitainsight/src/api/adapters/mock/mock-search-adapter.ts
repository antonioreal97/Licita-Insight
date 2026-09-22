import { modalityLabels, statusLabels } from '@/lib/tender-labels';
import { ApiError } from '../../errors';
import type { SearchAdapter } from '../search-adapter';
import type {
  FacetBucket,
  Highlight,
  SearchFacets,
  SearchSuggestion,
  TenderDetail,
  TenderSearchParams,
  TenderSearchResponse,
  TenderSummary,
} from '../../types';
import { tenderFixtures } from './fixtures';

/**
 * In-memory implementation of the Search API v1 contract.
 *
 * QA scenarios — append to the page URL:
 *   ?mock=slow         2.5 s latency
 *   ?mock=error        500 INTERNAL_ERROR
 *   ?mock=unavailable  503 SEARCH_UNAVAILABLE
 *   ?mock=empty        zero results
 */

type Scenario = 'slow' | 'error' | 'unavailable' | 'empty' | null;

const DEFAULT_LATENCY_MS = Number(import.meta.env.VITE_MOCK_LATENCY_MS ?? 350);

function currentScenario(): Scenario {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('mock');
  return value === 'slow' || value === 'error' || value === 'unavailable' || value === 'empty' ? value : null;
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

async function simulate(signal?: AbortSignal) {
  const scenario = currentScenario();
  await delay(scenario === 'slow' ? 2500 : DEFAULT_LATENCY_MS, signal);
  if (scenario === 'error') throw new ApiError('INTERNAL_ERROR', 'Erro simulado (mock=error).', 500, { requestId: 'mock-error' });
  if (scenario === 'unavailable') throw new ApiError('SEARCH_UNAVAILABLE', 'Índice de busca indisponível (mock=unavailable).', 503, { requestId: 'mock-503' });
  return scenario;
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const tokenize = (q: string) =>
  normalize(q)
    .split(/\s+/)
    .filter((term) => term.length > 1);

function haystack(tender: TenderDetail) {
  return normalize(
    [
      tender.title,
      tender.objectSummary,
      tender.organization.name,
      tender.categories.map((c) => c.label).join(' '),
      tender.items.map((i) => i.description).join(' '),
    ].join(' '),
  );
}

function score(tender: TenderDetail, terms: string[]) {
  if (terms.length === 0) return null;
  const title = normalize(tender.title);
  const body = haystack(tender);
  let hits = 0;
  let points = 0;
  for (const term of terms) {
    if (!body.includes(term)) continue;
    hits += 1;
    points += title.includes(term) ? 2 : 1;
  }
  if (hits < terms.length) return 0;
  return Math.min(1, 0.35 + points / (terms.length * 3));
}

function highlight(text: string | null, terms: string[]): string[] {
  if (!text || terms.length === 0) return [];
  const folded = normalize(text);
  if (!terms.some((term) => folded.includes(term))) return [];
  // Positions line up because stripping combining marks from NFD maps each precomposed (NFC) char back to one char.
  let result = '';
  let index = 0;
  while (index < text.length) {
    const match = terms.find((term) => folded.startsWith(term, index));
    if (match) {
      result += `<mark>${escapeHtml(text.slice(index, index + match.length))}</mark>`;
      index += match.length;
    } else {
      result += escapeHtml(text[index]);
      index += 1;
    }
  }
  return [result];
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

type FacetGroup = 'status' | 'modality' | 'state' | 'source' | 'category' | 'organization';

function matches(tender: TenderDetail, params: TenderSearchParams, skip?: FacetGroup) {
  const has = <T>(list: T[] | undefined, value: T) => !list?.length || list.includes(value);
  if (skip !== 'status' && !has(params.status, tender.status)) return false;
  if (skip !== 'modality' && !has(params.modality, tender.modality)) return false;
  if (skip !== 'state' && !has(params.state, tender.location.state ?? '')) return false;
  if (skip !== 'source' && !has(params.sourceId, tender.source.id)) return false;
  if (skip !== 'organization' && !has(params.organizationId, tender.organization.id)) return false;
  if (skip !== 'category' && params.category?.length && !tender.categories.some((c) => params.category!.includes(c.slug))) return false;
  if (params.city?.length && !params.city.includes(tender.location.city ?? '')) return false;
  if (params.valueMin !== undefined || params.valueMax !== undefined) {
    if (tender.estimatedValue === null) return false;
    if (params.valueMin !== undefined && tender.estimatedValue < params.valueMin) return false;
    if (params.valueMax !== undefined && tender.estimatedValue > params.valueMax) return false;
  }
  const day = (value: string | null) => value?.slice(0, 10) ?? null;
  const published = day(tender.publishedAt);
  if (params.publishedFrom && (!published || published < params.publishedFrom)) return false;
  if (params.publishedTo && (!published || published > params.publishedTo)) return false;
  const deadline = day(tender.proposalDeadline);
  if (params.deadlineFrom && (!deadline || deadline < params.deadlineFrom)) return false;
  if (params.deadlineTo && (!deadline || deadline > params.deadlineTo)) return false;
  return true;
}

function buckets(pool: TenderDetail[], pick: (t: TenderDetail) => { value: string; label: string }[], limit?: number): FacetBucket[] {
  const counts = new Map<string, FacetBucket>();
  for (const tender of pool) {
    for (const { value, label } of pick(tender)) {
      const bucket = counts.get(value) ?? { value, label, count: 0 };
      bucket.count += 1;
      counts.set(value, bucket);
    }
  }
  const sorted = [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
  return limit ? sorted.slice(0, limit) : sorted;
}

function computeFacets(textPool: TenderDetail[], params: TenderSearchParams): SearchFacets {
  // Disjunctive faceting: each group ignores its own selection.
  const poolWithout = (group: FacetGroup) => textPool.filter((t) => matches(t, params, group));
  const values = textPool
    .filter((t) => matches(t, params))
    .map((t) => t.estimatedValue)
    .filter((v): v is number => v !== null);
  return {
    status: buckets(poolWithout('status'), (t) => [{ value: t.status, label: statusLabels[t.status] }]),
    modality: buckets(poolWithout('modality'), (t) => [{ value: t.modality, label: modalityLabels[t.modality] }]),
    state: buckets(poolWithout('state'), (t) => (t.location.state ? [{ value: t.location.state, label: t.location.state }] : [])),
    source: buckets(poolWithout('source'), (t) => [{ value: t.source.id, label: t.source.name }]),
    category: buckets(poolWithout('category'), (t) => t.categories.map((c) => ({ value: c.slug, label: c.label }))),
    organization: buckets(poolWithout('organization'), (t) => [{ value: t.organization.id, label: t.organization.name }], 20),
    valueRange: { min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null },
  };
}

function toSummary(tender: TenderDetail, relevanceScore: number | null, highlights: Highlight[]): TenderSummary {
  const {
    description: _description,
    processNumber: _processNumber,
    items: _items,
    documents: _documents,
    timeline: _timeline,
    createdAt: _createdAt,
    ...summary
  } = tender;
  return { ...summary, relevance: { score: relevanceScore, highlights } };
}

const compareNullable = (a: number | string | null, b: number | string | null, dir: 1 | -1) => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -dir : dir;
};

export const mockSearchAdapter: SearchAdapter = {
  async searchTenders(params, signal) {
    const started = performance.now();
    const scenario = await simulate(signal);
    const q = params.q?.trim() ?? '';
    const terms = tokenize(q);
    const page = Math.max(1, params.page ?? 1);
    const pageSize = params.pageSize ?? 20;
    if (pageSize < 1 || pageSize > 100) throw new ApiError('INVALID_PARAMETER', 'pageSize must be between 1 and 100', 400);

    const scored = (scenario === 'empty' ? [] : tenderFixtures)
      .map((tender) => ({ tender, score: score(tender, terms) }))
      .filter((entry) => entry.score === null || entry.score > 0);
    const textPool = scored.map((entry) => entry.tender);
    const scoreById = new Map(scored.map((entry) => [entry.tender.id, entry.score]));
    const filtered = textPool.filter((tender) => matches(tender, params));

    const sort = params.sort ?? 'relevance';
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case 'deadline_asc':
          return compareNullable(a.proposalDeadline, b.proposalDeadline, 1);
        case 'value_desc':
          return compareNullable(a.estimatedValue, b.estimatedValue, -1);
        case 'value_asc':
          return compareNullable(a.estimatedValue, b.estimatedValue, 1);
        case 'published_desc':
          return compareNullable(a.publishedAt, b.publishedAt, -1);
        case 'relevance':
        default:
          return terms.length ? (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0) : compareNullable(a.publishedAt, b.publishedAt, -1);
      }
    });

    const total = sorted.length;
    const data = sorted.slice((page - 1) * pageSize, page * pageSize).map((tender) => {
      const highlights: Highlight[] = [];
      const titleFragments = highlight(tender.title, terms);
      if (titleFragments.length) highlights.push({ field: 'title', fragments: titleFragments });
      const summaryFragments = highlight(tender.objectSummary, terms);
      if (summaryFragments.length) highlights.push({ field: 'objectSummary', fragments: summaryFragments });
      return toSummary(tender, sort === 'relevance' && terms.length ? (scoreById.get(tender.id) ?? null) : null, highlights);
    });

    const response: TenderSearchResponse = {
      data,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), totalIsEstimate: false },
      facets: params.facets === false ? null : computeFacets(textPool, params),
      meta: { query: q || null, searchMode: 'keyword', tookMs: Math.round(performance.now() - started), indexUpdatedAt: new Date().toISOString() },
    };
    return response;
  },

  async getTender(id, signal) {
    await simulate(signal);
    const tender = tenderFixtures.find((item) => item.id === id);
    if (!tender) throw new ApiError('NOT_FOUND', `Licitação ${id} não encontrada.`, 404);
    return tender;
  },

  async getSuggestions(q, limit = 8, signal) {
    await delay(120, signal);
    const term = normalize(q.trim());
    if (term.length < 2) return { suggestions: [] };
    const seen = new Set<string>();
    const out: SearchSuggestion[] = [];
    for (const tender of tenderFixtures) {
      for (const category of tender.categories) {
        if (normalize(category.label).includes(term) && !seen.has(`c:${category.slug}`)) {
          seen.add(`c:${category.slug}`);
          out.push({
            type: 'category',
            value: category.slug,
            label: category.label,
            count: tenderFixtures.filter((t) => t.categories.some((c) => c.slug === category.slug)).length,
          });
        }
      }
      if (normalize(tender.organization.name).includes(term) && !seen.has(`o:${tender.organization.id}`)) {
        seen.add(`o:${tender.organization.id}`);
        out.push({ type: 'organization', value: tender.organization.id, label: tender.organization.name, count: null });
      }
      if (normalize(tender.title).includes(term) && !seen.has(`t:${tender.title}`)) {
        seen.add(`t:${tender.title}`);
        out.push({ type: 'term', value: tender.title, label: tender.title, count: null });
      }
    }
    return { suggestions: out.slice(0, limit) };
  },
};
