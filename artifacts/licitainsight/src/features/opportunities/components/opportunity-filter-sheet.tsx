import { useEffect, useState, type RefObject } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { OpportunitySearchParams, OpportunitySearchResponse } from '@/api';
import { Button } from '@/components/common/action-button';
import { ActiveFilterChips } from '@/components/filters/filter-primitives';
import { FilterSheetShell } from '@/components/filters/filter-sheet-shell';
import { formatNumber } from '@/lib/format';
import { useOpportunitySearch } from '../hooks/use-opportunities';
import { opportunityChipShowsGroup, opportunityFilterChips, type OpportunityFilterChip } from '../lib/opportunity-filters';
import { CLEAR_INTERNATIONAL_FILTERS, InternationalFilters } from './international';
import { CLEAR_NATIONAL_FILTERS, OpportunityFilters } from './opportunity-filters';

type SharedProps = {
  params: OpportunitySearchParams;
  facets: OpportunitySearchResponse['facets'];
};

type SheetProps = SharedProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (next: OpportunitySearchParams, total: number | undefined) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

const opportunitiesText = (total: number) => `${formatNumber(total)} ${total === 1 ? 'oportunidade' : 'oportunidades'}`;
export const opportunityApplyLabel = (total: number | undefined) => (total === undefined ? 'Ver oportunidades' : `Ver ${opportunitiesText(total)}`);
export const opportunityAppliedMessage = (total: number | undefined) =>
  total === undefined ? 'Filtros aplicados.' : `Filtros aplicados: ${opportunitiesText(total)}.`;

const clearPatch = (params: OpportunitySearchParams) => (params.scope === 'international' ? CLEAR_INTERNATIONAL_FILTERS : CLEAR_NATIONAL_FILTERS);

/** Removable chips above both lists, including old URL parameters and every international filter. */
export function ActiveOpportunityFilters({ params, facets, onChange }: SharedProps & { onChange: (patch: Partial<OpportunitySearchParams>) => void }) {
  const chips = opportunityFilterChips(params, new Date(), facets);
  return (
    <ActiveFilterChips<OpportunityFilterChip>
      chips={chips}
      showGroup={opportunityChipShowsGroup}
      onRemove={(chip) => onChange(chip.remove)}
      onClearAll={() => onChange(clearPatch(params))}
      regionTestId="opportunity-active-filters"
      clearTestId="button-opportunity-clear-all"
      chipTestId={(chip) => `chip-opportunity-${chip.id}`}
    />
  );
}

export function OpportunityFiltersButton({
  params,
  facets,
  open,
  onOpen,
  triggerRef,
}: SharedProps & { open: boolean; onOpen: () => void; triggerRef: RefObject<HTMLButtonElement | null> }) {
  const active = opportunityFilterChips(params, new Date(), facets).length;
  return (
    <Button
      ref={triggerRef}
      variant="outline"
      aria-haspopup="dialog"
      aria-expanded={open}
      data-testid="button-opportunity-filters"
      onClick={onOpen}
      className="h-10 @min-[52rem]/page:hidden"
    >
      <SlidersHorizontal size={14} aria-hidden />
      Filtros
      {active > 0 && (
        <span className="rounded-pill bg-primary px-1.5 py-0.5 type-data text-xs leading-none font-bold text-primary-foreground">
          {active}
          <span className="sr-only"> {active === 1 ? 'ativo' : 'ativos'}</span>
        </span>
      )}
    </Button>
  );
}

/** Mobile draft and preview use the same query contract as the desktop's immediate filters. */
export function OpportunityFilterSheet({ open, onOpenChange, params, onApply, triggerRef }: SheetProps) {
  const [draft, setDraft] = useState<OpportunitySearchParams>(params);
  useEffect(() => {
    if (open) setDraft({ ...params, page: undefined });
  }, [open, params]);

  const preview = useOpportunitySearch({ ...draft, page: undefined }, { enabled: open });
  const total = preview.isError ? undefined : preview.data?.pagination.total;
  const active = opportunityFilterChips(draft, new Date(), preview.data?.facets).length;
  const international = draft.scope === 'international';
  const changeDraft = (patch: Partial<OpportunitySearchParams>) => setDraft((current) => ({ ...current, ...patch, page: undefined }));

  return (
    <FilterSheetShell
      open={open}
      onOpenChange={onOpenChange}
      triggerRef={triggerRef}
      testId="sheet-opportunity-filters"
      testIdPrefix="opportunity-"
      description={
        active > 0 ? `${active} ${active === 1 ? 'filtro selecionado' : 'filtros selecionados'}` : 'Responda só o que importa. O resto pode ficar em branco.'
      }
      statusText={preview.isFetching || total === undefined ? '' : `${opportunitiesText(total)} com estes filtros`}
      clearDisabled={active === 0}
      onClear={() => changeDraft(clearPatch(draft))}
      applyLabel={opportunityApplyLabel(total)}
      applyLoading={preview.isFetching}
      onApply={() => {
        onApply(draft, total);
        onOpenChange(false);
      }}
    >
      {international ? (
        <InternationalFilters params={draft} facets={preview.data?.facets ?? null} onChange={changeDraft} density="comfortable" />
      ) : (
        <OpportunityFilters
          params={draft}
          facets={preview.data?.facets ?? null}
          hiddenIndividualListings={preview.data?.meta.hiddenIndividualListings ?? 0}
          onChange={changeDraft}
          density="comfortable"
        />
      )}
    </FilterSheetShell>
  );
}
