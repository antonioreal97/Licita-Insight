import type { TenderSearchParams, TenderSearchResponse } from '@/api';
import { formatDate, formatNumber } from '@/lib/format';
import { FACET_GROUPS, labelFor, selectedValues } from './facet-config';
import { activeDeadlinePreset } from './filter-presets';
import { DEFAULT_STATUS, isDefaultStatus } from './search-defaults';

export type FilterChip = { id: string; group: string; label: string; remove: Partial<TenderSearchParams> };

const compactCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
export const formatCompactCurrency = (value: number) => compactCurrency.format(value);

/** "Até R$ 50 mil", "A partir de R$ 500 mil", "R$ 50 mil a R$ 500 mil": the value chip reads on its own. */
export function valueRangeLabel(min: number | undefined, max: number | undefined) {
  if (min !== undefined && max !== undefined) return `${formatCompactCurrency(min)} a ${formatCompactCurrency(max)}`;
  if (min !== undefined) return `A partir de ${formatCompactCurrency(min)}`;
  return `Até ${formatCompactCurrency(max!)}`;
}

function dateRangeLabel(verb: string, from: string | undefined, to: string | undefined) {
  if (from && to) return `${verb} entre ${formatDate(from)} e ${formatDate(to)}`;
  if (from) return `${verb} a partir de ${formatDate(from)}`;
  return `${verb} até ${formatDate(to!)}`;
}

/** "Encerra em até 7 dias" for a shortcut, otherwise the dates. */
export function deadlineRangeLabel(from: string | undefined, to: string | undefined, now = new Date()) {
  const preset = activeDeadlinePreset({ deadlineFrom: from, deadlineTo: to }, now);
  return preset ? `Encerra em até ${preset} dias` : dateRangeLabel('Encerra', from, to);
}

/**
 * Chips whose label says what it filters ("SP", "Encerra em até 7 dias") show only the label; the others
 * (an organization, a platform, a source) keep the group name in front so a bare "Licitanet" is not a riddle.
 */
const SELF_EXPLANATORY = /^(?:status|state|city|category|modality):|^(?:value|deadline|published|newOnly)$/;
export const chipShowsGroup = (chip: { id: string }) => !SELF_EXPLANATORY.test(chip.id);

/**
 * One chip per selected value, plus one per range. `remove` is the patch that drops it.
 * `statusDefault` (search page): the default status is labeled as such and no status shows as "Todos", which removes back to the default.
 */
export function buildFilterChips(
  params: TenderSearchParams,
  {
    statusDefault = false,
    notification,
    now = new Date(),
  }: { statusDefault?: boolean; notification?: NonNullable<TenderSearchResponse['meta']['notification']> | null; now?: Date } = {},
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (statusDefault && !params.status?.length) chips.push({ id: 'status:all', group: 'Situação', label: 'Todas as situações', remove: { status: DEFAULT_STATUS } });
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
      label: valueRangeLabel(params.valueMin, params.valueMax),
      remove: { valueMin: undefined, valueMax: undefined },
    });
  }
  if (params.deadlineFrom || params.deadlineTo) {
    chips.push({
      id: 'deadline',
      group: 'Prazo',
      label: deadlineRangeLabel(params.deadlineFrom, params.deadlineTo, now),
      remove: { deadlineFrom: undefined, deadlineTo: undefined },
    });
  }
  if (params.publishedFrom || params.publishedTo) {
    chips.push({
      id: 'published',
      group: 'Publicação',
      label: dateRangeLabel('Publicado', params.publishedFrom, params.publishedTo),
      remove: { publishedFrom: undefined, publishedTo: undefined },
    });
  }
  if (params.newOnly) {
    chips.push({ id: 'newOnly', group: 'Novidades', label: 'Entraram nas últimas 24 h', remove: { newOnly: undefined } });
  }
  if (params.notification) {
    const label = notification
      ? `${formatNumber(notification.matchCount)} ${notification.matchCount === 1 ? 'edital' : 'editais'} de ${formatDate(notification.createdAt)}`
      : 'Editais salvos';
    chips.push({ id: 'notification', group: 'Notificação', label, remove: { notification: undefined } });
  }
  return chips;
}
