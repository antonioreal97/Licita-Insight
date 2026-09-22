import type { TenderSearchParams } from '@/api';
import { formatDate } from '@/lib/format';
import { FACET_GROUPS, labelFor, selectedValues } from './facet-config';

export type FilterChip = { id: string; group: string; label: string; remove: Partial<TenderSearchParams> };

const compactCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
export const formatCompactCurrency = (value: number) => compactCurrency.format(value);

function rangeLabel(from: string | undefined, to: string | undefined, format: (value: string) => string) {
  if (from && to) return `${format(from)} – ${format(to)}`;
  if (from) return `a partir de ${format(from)}`;
  return `até ${format(to!)}`;
}

/** One chip per selected value, plus one per range. `remove` is the patch that drops it. */
export function buildFilterChips(params: TenderSearchParams): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const group of FACET_GROUPS) {
    const values = selectedValues(params, group.param);
    for (const value of values) {
      chips.push({
        id: `${group.param}:${value}`,
        group: group.title,
        label: labelFor(group.param, value),
        remove: { [group.param]: values.filter((item) => item !== value) },
      });
    }
  }
  for (const city of params.city ?? []) {
    chips.push({ id: `city:${city}`, group: 'Cidade', label: city, remove: { city: params.city!.filter((item) => item !== city) } });
  }
  if (params.valueMin !== undefined || params.valueMax !== undefined) {
    chips.push({
      id: 'value',
      group: 'Valor',
      label: rangeLabel(params.valueMin?.toString(), params.valueMax?.toString(), (value) => formatCompactCurrency(Number(value))),
      remove: { valueMin: undefined, valueMax: undefined },
    });
  }
  if (params.deadlineFrom || params.deadlineTo) {
    chips.push({
      id: 'deadline',
      group: 'Prazo',
      label: rangeLabel(params.deadlineFrom, params.deadlineTo, (value) => formatDate(value)),
      remove: { deadlineFrom: undefined, deadlineTo: undefined },
    });
  }
  if (params.publishedFrom || params.publishedTo) {
    chips.push({
      id: 'published',
      group: 'Publicação',
      label: rangeLabel(params.publishedFrom, params.publishedTo, (value) => formatDate(value)),
      remove: { publishedFrom: undefined, publishedTo: undefined },
    });
  }
  return chips;
}
