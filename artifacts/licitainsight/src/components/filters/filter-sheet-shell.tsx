import type { ReactNode, RefObject } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { SheetOverlay, SheetPortal } from '@/components/ui/sheet';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  description: ReactNode;
  children: ReactNode;
  statusText: string;
  clearDisabled: boolean;
  onClear: () => void;
  applyLabel: string;
  applyLoading?: boolean;
  onApply: () => void;
  testId?: string;
  testIdPrefix?: string;
};

/** Shared mobile filter sheet: identical focus return, motion, footer actions and live count across result pages. */
export function FilterSheetShell({
  open,
  onOpenChange,
  triggerRef,
  description,
  children,
  statusText,
  clearDisabled,
  onClear,
  applyLabel,
  applyLoading = false,
  onApply,
  testId = 'sheet-filters',
  testIdPrefix = '',
}: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetOverlay />
        <DialogPrimitive.Content
          data-testid={testId}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          className="fixed inset-y-0 right-0 z-modal motion-reduce:animate-none flex h-full w-full flex-col border-l border-border bg-background duration-slow ease-emphasized data-[state=closed]:duration-base data-[state=closed]:ease-exit data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-md"
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div>
              <DialogPrimitive.Title className="type-section">Filtros</DialogPrimitive.Title>
              <DialogPrimitive.Description className="type-meta text-muted-foreground">{description}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Fechar filtros"
              className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:focus-ring"
            >
              <X size={18} aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4">{children}</div>
          <p role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid={`${testIdPrefix}text-sheet-preview-count`}>
            {statusText}
          </p>
          <div className="flex items-center gap-3 border-t border-border-subtle bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              data-testid={`${testIdPrefix}button-sheet-clear`}
              disabled={clearDisabled}
              onClick={onClear}
              className="min-h-11 rounded-lg px-2 type-ui font-semibold text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpar
            </button>
            <Button data-testid={`${testIdPrefix}button-sheet-apply`} className="h-11 flex-1" onClick={onApply}>
              {applyLoading && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {applyLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </SheetPortal>
    </DialogPrimitive.Root>
  );
}
