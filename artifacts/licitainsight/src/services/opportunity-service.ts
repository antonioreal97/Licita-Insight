import {
  opportunityAdapter,
  type OpportunityArea,
  type OpportunityProgram,
  type OpportunityKind,
  type OpportunitySource,
  type OpportunitySearchParams,
  type OpportunityStatus,
} from '@/api';

export const OPPORTUNITY_PAGE_SIZE = 20;

const STATUSES: OpportunityStatus[] = ['open', 'upcoming', 'closed', 'undated'];
const PROGRAMS: OpportunityProgram[] = ['audiovisual', 'lpg', 'fac', 'fsa'];
const KINDS: OpportunityKind[] = ['culture', 'funding', 'innovation', 'partnership'];
const SOURCES: OpportunitySource[] = ['mapas', 'finep', 'cnpq', 'capes', 'transferegov', 'funarte', 'minc', 'salic'];
export const OPPORTUNITY_AREAS: OpportunityArea[] = [
  'audiovisual',
  'musica',
  'teatro',
  'danca',
  'circo',
  'artes-visuais',
  'literatura',
  'patrimonio',
  'culturas-populares',
  'artesanato',
  'cultura-digital',
  'gastronomia',
  'gestao-producao',
  'formacao',
  'diversidade',
  'outras',
];
const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
];

const list = (params: URLSearchParams, key: string) => params.getAll(key).filter(Boolean);

const keep = <T extends string>(values: string[], allowed: readonly T[]): T[] | undefined => {
  const picked = values.filter((value): value is T => (allowed as readonly string[]).includes(value));
  return picked.length > 0 ? picked : undefined;
};

/** Names typed by the source (municipality, institution): trimmed, capped at what the API accepts. */
const names = (values: string[]): string[] | undefined => {
  const picked = [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0 && value.length <= 200))].slice(0, 20);
  return picked.length > 0 ? picked : undefined;
};

const date = (value: string | null): string | undefined => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);

export function opportunityParamsFromUrl(search: string): OpportunitySearchParams {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const page = Number(params.get('page'));
  const q = params.get('q')?.trim();
  return {
    q: q || undefined,
    state: keep(
      list(params, 'state').map((uf) => uf.toUpperCase()),
      UFS,
    ),
    installation: list(params, 'installation').length > 0 ? list(params, 'installation') : undefined,
    status: keep(list(params, 'status'), STATUSES),
    program: keep(list(params, 'program'), PROGRAMS),
    kind: keep(list(params, 'kind'), KINDS),
    source: keep(list(params, 'source'), SOURCES),
    area: keep(list(params, 'area'), OPPORTUNITY_AREAS),
    city: names(list(params, 'city')),
    organization: names(list(params, 'organization')),
    deadlineFrom: date(params.get('deadlineFrom')),
    deadlineTo: date(params.get('deadlineTo')),
    includeIndividual: params.get('individual') === '1' ? true : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
}

export function opportunityParamsToUrl(params: OpportunitySearchParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  params.state?.forEach((state) => search.append('state', state));
  params.installation?.forEach((installation) => search.append('installation', installation));
  params.status?.forEach((status) => search.append('status', status));
  params.program?.forEach((program) => search.append('program', program));
  params.kind?.forEach((kind) => search.append('kind', kind));
  params.source?.forEach((source) => search.append('source', source));
  params.area?.forEach((area) => search.append('area', area));
  params.city?.forEach((city) => search.append('city', city));
  params.organization?.forEach((organization) => search.append('organization', organization));
  if (params.deadlineFrom) search.set('deadlineFrom', params.deadlineFrom);
  if (params.deadlineTo) search.set('deadlineTo', params.deadlineTo);
  if (params.includeIndividual) search.set('individual', '1');
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const opportunityService = {
  search: (params: OpportunitySearchParams, signal?: AbortSignal) =>
    opportunityAdapter.searchOpportunities({ ...params, pageSize: OPPORTUNITY_PAGE_SIZE, facets: true }, signal),
  get: (id: string, signal?: AbortSignal) => opportunityAdapter.getOpportunity(id, signal),
};
