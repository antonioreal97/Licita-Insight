import type { TenderSearchParams, TenderSearchResponse } from '@/api';
import { ActiveFilterChips } from '@/components/filters/filter-primitives';
import { buildFilterChips, chipShowsGroup, type FilterChip } from '../lib/filter-chips';

type Props = {
  params: TenderSearchParams;
  notification?: TenderSearchResponse['meta']['notification'];
  onRemove: (patch: Partial<TenderSearchParams>) => void;
  onClearAll: () => void;
  canClear: boolean;
};

/**
 * One removable chip per selected value/range, labeled so it reads on its own ("SP", "Encerra em até 7 dias").
 * Labels come from the facet label cache (see facet-config).
 */
export function ActiveFilters({ params, notification, onRemove, onClearAll, canClear }: Props) {
  const chips = buildFilterChips(params, { statusDefault: true, notification });
  return (
    <ActiveFilterChips<FilterChip>
      chips={chips}
      showGroup={chipShowsGroup}
      onRemove={(chip) => onRemove(chip.remove)}
      onClearAll={onClearAll}
      canClear={canClear}
      regionTestId="active-filters"
      clearTestId="button-clear-all-filters"
      chipTestId={(chip) => `chip-${chip.id}`}
    />
  );
}
