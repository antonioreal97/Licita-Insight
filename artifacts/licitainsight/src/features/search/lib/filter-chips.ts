import type { TenderSearchParams } from '@/api';
import { formatDate } from '@/lib/format';
import { FACET_GROUPS, labelFor, selectedValues } from './facet-config';
import { DEFAULT_STATUS, isDefaultStatus } from './search-defaults';

export type FilterChip = { id: string; group: string; label: string; remove: Partial<TenderSearchParams> };

const compactCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
export const formatCompactCurrency = (value: number) => compactCurrency.format(value);

function rangeLabel(from: string | undefined, to: string | undefined, format: (value: string) => string) {
  if (from && to) return `${format(from)} – ${format(to)}`;
  if (from) return `a partir de ${format(from)}`;
  return `até ${format(to!)}`;
}

/**
 * One chip per selected value, plus one per range. `remove` is the patch that drops it.
 * `statusDefault` (search page): the default status is labeled as such and no status shows as "Todos", which removes back to the default.
 */
export function buildFilterChips(params: TenderSearchParams, { statusDefault = false } = {}): FilterChip[] {
  const chips: FilterChip[] = [];
  if (statusDefault && !params.status?.length) chips.push({ id: 'status:all', group: 'Status', label: 'Todos', remove: { status: DEFAULT_STATUS } });
  const markDefault = statusDefault && isDefaultStatus(params.status);
  for (const group of FACET_GROUPS) {
    const values = selectedValues(params, group.param);
    for (const value of values) {
      const label = labelFor(group.param, value);
      chips.push({
        id: `${group.param}:${value}`,
        group: group.title,
        label: markDefault && group.param === 'status' ? `${label} (padrão)` : label,
        remove: { [group.param]: values.filter((item) => item !== value) },
      });
    }
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
  if (params.newOnly) {
    chips.push({ id: 'newOnly', group: 'Entrada no Pardal', label: 'Novos (24 h)', remove: { newOnly: undefined } });
  }
  return chips;
}
