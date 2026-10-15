import { useEffect, useState, type RefObject } from 'react';
import type { TenderSearchParams } from '@/api';
import { FilterSheetShell } from '@/components/filters/filter-sheet-shell';
import { formatNumber } from '@/lib/format';
import { countActiveFilters } from '@/services/search-service';
import { useTenderSearch } from '../hooks/use-tender-search';
import { searchDefaultsToUrl, withoutFilters } from '../lib/search-defaults';
import { FacetPanel } from './facet-panel';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  params: TenderSearchParams;
  /** `total` is the previewed count, so the page can announce it once the sheet closes. */
  onApply: (next: TenderSearchParams, total: number | undefined) => void;
  /** The "Filtros" button. The sheet is opened from state, not a Radix Trigger, so focus is returned here by hand. */
  triggerRef: RefObject<HTMLButtonElement | null>;
};

const countText = (total: number, estimate = false) => `${estimate ? 'aprox. ' : ''}${formatNumber(total)} ${total === 1 ? 'edital' : 'editais'}`;

/** "Ver 12 editais" / "Ver 1 edital": the primary action says what the person gets. */
export const applyLabel = (total: number | undefined, estimate = false) => (total === undefined ? 'Ver editais' : `Ver ${countText(total, estimate)}`);

/** What a screen reader hears once the sheet closes. */
export const appliedMessage = (total: number | undefined) => (total === undefined ? 'Filtros aplicados.' : `Filtros aplicados: ${countText(total)}.`);

/**
 * Mobile/tablet filters. Edits are a pending draft (not URL state) until "Aplicar", so the user can
 * tweak several facets without the list re-rendering underneath. The draft is previewed with a live
 * count; the preview request uses page 1 with the same page size, so applying hits the cache.
 */
export function FiltersSheet({ open, onOpenChange, params, onApply, triggerRef }: Props) {
  const [draft, setDraft] = useState<TenderSearchParams>(params);
  useEffect(() => {
    if (open) setDraft({ ...params, page: 1 });
  }, [open, params]);

  const preview = useTenderSearch({ ...draft, page: 1 }, { enabled: open });
  const total = preview.isError ? undefined : preview.data?.pagination.total;
  const estimate = preview.data?.pagination.totalIsEstimate === true;
  const draftCount = countActiveFilters(searchDefaultsToUrl(draft));

  return (
    <FilterSheetShell
      open={open}
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
      description={
        draftCount > 0
          ? `${draftCount} ${draftCount === 1 ? 'filtro selecionado' : 'filtros selecionados'}`
          : 'Responda só o que importa. O resto pode ficar em branco.'
      }
      statusText={preview.isFetching || total === undefined ? '' : `${countText(total, estimate)} com estes filtros`}
      clearDisabled={draftCount === 0}
      onClear={() => setDraft(withoutFilters(draft))}
      applyLabel={applyLabel(total, estimate)}
      applyLoading={preview.isFetching}
      onApply={() => {
        onApply(draft, total);
        onOpenChange(false);
      }}
    >
      <FacetPanel
        params={draft}
        facets={preview.data?.facets}
        loading={preview.isPending}
        density="comfortable"
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch, page: 1 }))}
      />
    </FilterSheetShell>
  );
}
