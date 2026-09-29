import { useEffect, useState, type RefObject } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';
import type { TenderSearchParams } from '@/api';
import { Button } from '@/components/common/action-button';
import { SheetOverlay, SheetPortal } from '@/components/ui/sheet';
import { formatNumber } from '@/lib/format';
import { countActiveFilters } from '@/services/search-service';
import { useTenderSearch } from '../hooks/use-tender-search';
import { searchDefaultsToUrl, withoutFilters } from '../lib/search-defaults';
import { FacetPanel } from './facet-panel';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  params: TenderSearchParams;
  onApply: (next: TenderSearchParams) => void;
  /** The "Filtros" button. The sheet is opened from state, not a Radix Trigger, so focus is returned here by hand. */
  triggerRef: RefObject<HTMLButtonElement | null>;
};

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
  const total = preview.data?.pagination.total;
  const draftCount = countActiveFilters(searchDefaultsToUrl(draft));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetOverlay />
        <DialogPrimitive.Content
          data-testid="sheet-filters"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          className="fixed inset-y-0 right-0 z-modal flex h-full w-full flex-col border-l border-border bg-background shadow-xl duration-slow ease-emphasized data-[state=closed]:duration-base data-[state=closed]:ease-exit data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-md"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <DialogPrimitive.Title className="type-section">Filtros</DialogPrimitive.Title>
              <DialogPrimitive.Description className="type-meta text-muted-foreground">
                {draftCount > 0 ? `${draftCount} ${draftCount === 1 ? 'filtro selecionado' : 'filtros selecionados'}` : 'Refine as oportunidades exibidas'}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Fechar filtros"
              className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:focus-ring"
            >
              <X size={18} aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4">
            <FacetPanel
              params={draft}
              facets={preview.data?.facets}
              loading={preview.isPending}
              density="comfortable"
              onChange={(patch) => setDraft((current) => ({ ...current, ...patch, page: 1 }))}
            />
          </div>
          <div className="flex gap-2 border-t border-border bg-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              variant="outline"
              data-testid="button-sheet-clear"
              className="h-11 flex-1"
              disabled={draftCount === 0}
              onClick={() => setDraft(withoutFilters(draft))}
            >
              Limpar
            </Button>
            <Button
              data-testid="button-sheet-apply"
              className="h-11 flex-[2]"
              onClick={() => {
                onApply(draft);
                onOpenChange(false);
              }}
            >
              {preview.isFetching && <Loader2 size={14} className="animate-spin" aria-hidden />}
              Aplicar
              {total !== undefined && !preview.isError && (
                <span className="font-normal opacity-90">
                  · {formatNumber(total)} {total === 1 ? 'resultado' : 'resultados'}
                </span>
              )}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </SheetPortal>
    </DialogPrimitive.Root>
  );
}
