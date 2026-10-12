import {
  opportunityAdapter,
  type BrazilEligibility,
  type InternationalRegion,
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
const KINDS: OpportunityKind[] = ['culture', 'funding', 'innovation', 'partnership', 'procurement'];
const SOURCES: OpportunitySource[] = ['mapas', 'finep', 'cnpq', 'capes', 'transferegov', 'funarte', 'minc', 'salic', 'worldbank', 'eu_ft'];
export const INTERNATIONAL_REGIONS: InternationalRegion[] = ['america-latina', 'africa', 'europa', 'asia', 'oriente-medio', 'global'];
export const BRAZIL_ELIGIBILITIES: BrazilEligibility[] = ['yes', 'conditional', 'no', 'unknown'];
/** What the international tab lists when the URL says nothing about eligibility. */
export const DEFAULT_ELIGIBILITY: BrazilEligibility[] = ['yes', 'conditional'];
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

/** Two-letter codes (`country`, `language`), in the case the API stores. */
const codes = (values: string[], normalize: (code: string) => string): string[] | undefined => {
  const picked = [...new Set(values.filter((value) => /^[A-Za-z]{2}$/.test(value)).map(normalize))].slice(0, 20);
  return picked.length > 0 ? picked : undefined;
};

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
    scope: params.get('scope') === 'international' ? 'international' : undefined,
    agency: names(list(params, 'agency')),
    region: keep(list(params, 'region'), INTERNATIONAL_REGIONS),
    country: codes(list(params, 'country'), (code) => code.toUpperCase()),
    language: codes(list(params, 'language'), (code) => code.toLowerCase()),
    opportunityType: names(list(params, 'opportunityType')),
    eligibility: list(params, 'eligibility').includes('all') ? 'all' : keep(list(params, 'eligibility'), BRAZIL_ELIGIBILITIES),
    funding: keep(list(params, 'funding'), BRAZIL_ELIGIBILITIES),
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
  if (params.scope === 'international') search.set('scope', 'international');
  params.agency?.forEach((agency) => search.append('agency', agency));
  params.region?.forEach((region) => search.append('region', region));
  params.country?.forEach((country) => search.append('country', country));
  params.language?.forEach((language) => search.append('language', language));
  params.opportunityType?.forEach((type) => search.append('opportunityType', type));
  if (params.eligibility === 'all') search.set('eligibility', 'all');
  else params.eligibility?.forEach((eligibility) => search.append('eligibility', eligibility));
  params.funding?.forEach((funding) => search.append('funding', funding));
  if (params.page && params.page > 1) search.set('page', String(params.page));
  const text = search.toString();
  return text ? `?${text}` : '';
}

/**
 * What goes to the API. The international tab opens on calls a Brazilian can go after ("yes" and
 * "conditional"); "all" lifts that and is a URL-only value. Outside that tab the international filters are
 * dropped, so a leftover in the URL never empties the national list.
 */
export function opportunityApiParams(params: OpportunitySearchParams): OpportunitySearchParams {
  if (params.scope !== 'international') {
    return {
      ...params,
      scope: undefined,
      agency: undefined,
      region: undefined,
      country: undefined,
      language: undefined,
      opportunityType: undefined,
      eligibility: undefined,
      funding: undefined,
    };
  }
  const eligibility = params.eligibility === 'all' ? undefined : (params.eligibility ?? DEFAULT_ELIGIBILITY);
  return {
    ...params,
    eligibility,
    // Filters of the national list: UF, municipality, Mapas installation, cultural area, individual listings.
    state: undefined,
    city: undefined,
    installation: undefined,
    area: undefined,
    program: undefined,
    includeIndividual: undefined,
  };
}

export const opportunityService = {
  search: (params: OpportunitySearchParams, signal?: AbortSignal) =>
    opportunityAdapter.searchOpportunities({ ...opportunityApiParams(params), pageSize: OPPORTUNITY_PAGE_SIZE, facets: true }, signal),
  get: (id: string, signal?: AbortSignal) => opportunityAdapter.getOpportunity(id, signal),
};
