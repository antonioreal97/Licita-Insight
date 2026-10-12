import type { BrazilEligibility, InternationalOpportunity, OpportunityScope, OpportunitySearchParams, OpportunitySearchResponse } from '@/api';
import { formatNumber } from '@/lib/format';
import { BRAZIL_ELIGIBILITIES } from '@/services/opportunity-service';
import type { FilterOption } from './opportunity-filters';

type Facets = OpportunitySearchResponse['facets'];

const BRASILIA = 'America/Sao_Paulo';

export const brazilEligibilityLabels: Record<BrazilEligibility, string> = {
  yes: 'Aberto a brasileiros',
  conditional: 'Condicional',
  no: 'Fechado a brasileiros',
  unknown: 'Elegibilidade a confirmar',
};

/** Whether the funder pays a participant from Brazil: a second answer, shown next to the first. */
export const brazilFundingLabels: Record<BrazilEligibility, string> = {
  yes: 'Financia participante do Brasil',
  conditional: 'Financiamento condicional',
  no: 'Sem financiamento direto',
  unknown: 'Financiamento a confirmar',
};

/** Shown wherever an eligibility answer is: the badge is a reading of the notice, not the notice. */
export const OFFICIAL_NOTICE_PREVAILS =
  'A elegibilidade é uma leitura automática do aviso, com valores e prazos convertidos para facilitar. O edital oficial prevalece.';

const brasiliaDateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** `2026-10-27` → `27/10/2026`, with no time zone involved: the day is the one the source wrote. */
const writtenDay = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

/** `GMT+3`, `GMT-5`. `null` for a zone the browser does not know. */
const offsetLabel = (instant: Date, timeZone: string): string | null => {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(instant)
      .find((item) => item.type === 'timeZoneName');
    return part ? (part.value === 'GMT' ? 'GMT+0' : part.value) : null;
  } catch {
    return null;
  }
};

/** Zones whose city has a Portuguese name worth using. The others keep the IANA spelling. */
const ZONE_CITIES: Record<string, string> = { 'Europe/Brussels': 'Bruxelas' };

/** `Africa/Kampala` → `Kampala`; `America/Argentina/Buenos_Aires` → `Buenos Aires`. */
const zoneCity = (timeZone: string): string => ZONE_CITIES[timeZone] ?? timeZone.split('/').at(-1)!.replaceAll('_', ' ');

export type DeadlineTexts = {
  /** The deadline in Brasília time, or the day alone when the hour could not be converted. */
  brasilia: string;
  /** The deadline as the source wrote it, with its zone when it is known. */
  original: string | null;
  /** Why there is no hour in `brasilia`, when there is none. */
  note: string | null;
};

/**
 * The deadline always in Brasília time, with the original next to it. When the source gives an hour but no
 * resolvable zone (a country with several zones), the hour is shown as written and is not converted.
 */
export function deadlineTexts(deadline: InternationalOpportunity['deadline']): DeadlineTexts {
  const match = /^(\d{4}-\d{2}-\d{2})(?: (\d{1,2}:\d{2}))?/.exec(deadline.original ?? '');
  const instant = deadline.at ? new Date(deadline.at) : null;
  if (!match || !instant || Number.isNaN(instant.getTime())) {
    return { brasilia: 'Prazo não informado', original: null, note: null };
  }
  const [, day, clock] = match;
  const zone = deadline.timeZone;
  const where = zone ? [offsetLabel(instant, zone), zoneCity(zone)].filter(Boolean).join(', ') : null;

  if (deadline.precision === 'datetime' && clock && zone) {
    return {
      brasilia: `${brasiliaDateTime.format(instant).replace(',', ' às')} (horário de Brasília)`,
      original: `${writtenDay(day!)} às ${clock} (${where})`,
      note: null,
    };
  }
  if (clock) {
    return {
      brasilia: writtenDay(day!),
      original: `${writtenDay(day!)} às ${clock}, hora local do comprador`,
      note: 'A fonte não informa o fuso: a hora não foi convertida para Brasília.',
    };
  }
  return {
    brasilia: writtenDay(day!),
    original: zone ? `${writtenDay(day!)} (dia em ${zoneCity(zone)})` : writtenDay(day!),
    note: 'A fonte ainda não informa a hora do encerramento.',
  };
}

const money = (amount: number, currency: string, compact: boolean): string => {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      ...(compact ? { notation: 'compact' as const, maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }),
    }).format(amount);
  } catch {
    return `${formatNumber(amount)} ${currency}`;
  }
};

export type AmountTexts = {
  /** `€ 3,4 mi`. */
  original: string;
  /** `≈ R$ 19,2 mi`, absent when the currency has no PTAX quote. */
  approx: string | null;
  /** `PTAX de 09/10/2026`. */
  quote: string | null;
};

/** The value in the original currency and, when there is a quote, the approximate value in reais. */
export function amountTexts(international: Pick<InternationalOpportunity, 'amountOriginal' | 'currency' | 'amountBrlApprox' | 'fxDate'>, compact = true): AmountTexts | null {
  if (international.amountOriginal === null || !international.currency) return null;
  const converted = international.amountBrlApprox !== null && international.fxDate !== null;
  return {
    original: money(international.amountOriginal, international.currency, compact),
    approx: converted ? `≈ ${money(international.amountBrlApprox!, 'BRL', compact)}` : null,
    quote: converted ? `PTAX de ${writtenDay(international.fxDate!)}` : null,
  };
}

/** `€ 3,4 mi ≈ R$ 19,2 mi (PTAX de 09/10/2026)`. */
export function amountLine(texts: AmountTexts): string {
  return texts.approx ? `${texts.original} ${texts.approx} (${texts.quote})` : texts.original;
}

/** The original title is shown under the Portuguese one only when they differ. */
export function originalTitle(title: string, international: Pick<InternationalOpportunity, 'titleOriginal'>): string | null {
  const original = international.titleOriginal?.trim();
  return original && original !== title.trim() ? original : null;
}

/** Where the call is executed: the country, or the region when it spans several. */
export function placeLabel(international: Pick<InternationalOpportunity, 'countryName' | 'regionName'>): string {
  return international.countryName ?? international.regionName ?? 'Vários países';
}

export const ELIGIBILITY_DEFAULT = '';
export const ELIGIBILITY_ALL = 'all';

/** The value of the eligibility control: empty is the default view (open or conditional). */
export function selectedEligibility(params: OpportunitySearchParams): string {
  if (params.eligibility === 'all') return ELIGIBILITY_ALL;
  return params.eligibility?.length === 1 ? params.eligibility[0]! : ELIGIBILITY_DEFAULT;
}

export function eligibilityPatch(value: string): Partial<OpportunitySearchParams> {
  if (value === ELIGIBILITY_ALL) return { eligibility: 'all' };
  const picked = BRAZIL_ELIGIBILITIES.find((status) => status === value);
  return { eligibility: picked ? [picked] : undefined };
}

/** One option per answer, with how many calls the other filters leave in it. */
export function eligibilityOptions(facets: Facets): FilterOption[] {
  const counts = new Map((facets?.eligibility ?? []).map((bucket) => [bucket.value, bucket.count]));
  return BRAZIL_ELIGIBILITIES.map((status) => {
    const count = counts.get(status) ?? 0;
    return { value: status, label: `${brazilEligibilityLabels[status]} (${formatNumber(count)})`, count };
  });
}

/** Options of a facet as the API labelled them, most calls first; a selected value never leaves the list. */
export function facetOptions(buckets: { value: string; label: string; count: number }[] | undefined, selected?: string): FilterOption[] {
  const options = [...(buckets ?? [])];
  if (selected && !options.some((bucket) => bucket.value === selected)) options.push({ value: selected, label: selected, count: 0 });
  return options
    .map((bucket) => ({ value: bucket.value, label: `${bucket.label} (${formatNumber(bucket.count)})`, count: bucket.count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'pt-BR'));
}

/**
 * Switching between national and international calls keeps the text and the deadline status and drops the
 * filters that only exist on the other side.
 */
export function scopePatch(scope: OpportunityScope): Partial<OpportunitySearchParams> {
  return {
    scope: scope === 'international' ? 'international' : undefined,
    state: undefined,
    city: undefined,
    installation: undefined,
    organization: undefined,
    area: undefined,
    program: undefined,
    kind: undefined,
    source: undefined,
    includeIndividual: undefined,
    agency: undefined,
    region: undefined,
    country: undefined,
    language: undefined,
    opportunityType: undefined,
    eligibility: undefined,
    funding: undefined,
  };
}

/** Toggles the "projects in Brazil" shortcut. */
export function brazilProjectsPatch(params: OpportunitySearchParams): Partial<OpportunitySearchParams> {
  return { country: params.country?.includes('BR') ? undefined : ['BR'] };
}
