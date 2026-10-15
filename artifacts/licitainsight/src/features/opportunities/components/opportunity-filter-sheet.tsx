import { useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, SlidersHorizontal, X } from 'lucide-react';
import type { OpportunitySearchParams, OpportunitySearchResponse } from '@/api';
import { Button } from '@/components/common/action-button';
import { SheetOverlay, SheetPortal } from '@/components/ui/sheet';
import { formatNumber } from '@/lib/format';
import { opportunityChipShowsGroup, opportunityFilterChips } from '../lib/opportunity-filters';
import { CLEAR_NATIONAL_FILTERS, OpportunityFilters } from './opportunity-filters';

type Props = {
  params: OpportunitySearchParams;
  facets: OpportunitySearchResponse['facets'];
  hiddenIndividualListings: number;
  onChange: (patch: Partial<OpportunitySearchParams>) => void;
  /** Calls under the current filters; undefined while loading or on error. */
  total: number | undefined;
  fetching: boolean;
};

const callsText = (total: number) => `${formatNumber(total)} ${total === 1 ? 'chamada' : 'chamadas'}`;

/** Removable chips above the list, labeled so each reads on its own ("CE", "Inscrições encerram em até 7 dias"). */
export function ActiveOpportunityFilters({ params, onChange }: Pick<Props, 'params' | 'onChange'>) {
  const chips = opportunityFilterChips(params);
  if (chips.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="region" aria-label="Filtros ativos" data-testid="opportunity-active-filters">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onChange(chip.remove)}
          aria-label={`Remover filtro ${chip.group}: ${chip.label}`}
          data-testid={`chip-opportunity-${chip.id}`}
          className="group inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-pill border border-border-subtle bg-surface py-1 pr-1.5 pl-2.5 text-xs text-foreground transition-colors duration-fast ease-standard hover:border-border-strong hover:bg-surface-sunken focus-visible:focus-ring"
        >
          {opportunityChipShowsGroup(chip) && <span className="text-muted-foreground">{chip.group}:</span>}
          <span className="truncate font-medium">{chip.label}</span>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard group-hover:text-foreground">
            <X size={12} aria-hidden />
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(CLEAR_NATIONAL_FILTERS)}
        data-testid="button-opportunity-clear-all"
        className="min-h-8 rounded-lg px-2 text-xs font-semibold text-primary hover:underline focus-visible:focus-ring"
      >
        Limpar tudo
      </button>
    </div>
  );
}

/**
 * National filters: inline above the list from `sm` up; on phones a "Filtros" button opens them in a sheet.
 * Choices apply as they are made (the list behind updates); "Ver N chamadas" closes the sheet.
 */
export function OpportunityFiltersBar(props: Props) {
  const { params, onChange, total, fetching } = props;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = opportunityFilterChips(params).length;

  return (
    <>
      <div className="hidden sm:block">
        <OpportunityFilters {...props} />
      </div>
      <div className="mb-3 sm:hidden">
        <Button
          ref={triggerRef}
          variant="outline"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid="button-opportunity-filters"
          onClick={() => setOpen(true)}
          className="h-10"
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
      </div>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <SheetPortal>
          <SheetOverlay />
          <DialogPrimitive.Content
            data-testid="sheet-opportunity-filters"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              triggerRef.current?.focus();
            }}
            className="fixed inset-y-0 right-0 z-modal flex h-full w-full flex-col border-l border-border bg-background duration-slow ease-emphasized data-[state=closed]:duration-base data-[state=closed]:ease-exit data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right motion-reduce:animate-none sm:max-w-md"
          >
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div>
                <DialogPrimitive.Title className="type-section">Filtros</DialogPrimitive.Title>
                <DialogPrimitive.Description className="type-meta text-muted-foreground">
                  Responda só o que importa. O resto pode ficar em branco.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                aria-label="Fechar filtros"
                className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:focus-ring"
              >
                <X size={18} aria-hidden />
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4">
              <OpportunityFilters {...props} density="comfortable" />
            </div>
            <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
              {fetching || total === undefined ? '' : `${callsText(total)} com estes filtros`}
            </p>
            <div className="flex items-center gap-3 border-t border-border-subtle bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                data-testid="button-opportunity-sheet-clear"
                disabled={active === 0}
                onClick={() => onChange(CLEAR_NATIONAL_FILTERS)}
                className="min-h-11 rounded-lg px-2 type-ui font-semibold text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                Limpar
              </button>
              <Button data-testid="button-opportunity-sheet-apply" className="h-11 flex-1" onClick={() => setOpen(false)}>
                {fetching && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {total === undefined ? 'Ver chamadas' : `Ver ${callsText(total)}`}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </SheetPortal>
      </DialogPrimitive.Root>
    </>
  );
}
