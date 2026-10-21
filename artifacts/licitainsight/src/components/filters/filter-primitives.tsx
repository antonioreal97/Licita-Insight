import * as React from 'react';
import { ChevronDown, X } from 'lucide-react';
import { GlossaryTerm } from '@/features/help/components/glossary-term';
import { cn } from '@/lib/utils';

type ReactNode = React.ReactNode;
const useId = React.useId;

export type FilterDensity = 'compact' | 'comfortable';

/** Shared control chrome: same border/focus/height language on sidebar and sheet. */
export const filterControlClass = (density: FilterDensity = 'compact') =>
  cn(
    'w-full min-w-0 rounded-lg border border-input bg-background text-base text-foreground transition-[border-color,box-shadow] duration-fast ease-standard',
    'placeholder:text-muted-foreground focus:border-ring focus-visible:outline-none aria-[invalid=true]:border-destructive sm:type-ui',
    density === 'comfortable' ? 'h-10 px-3' : 'h-8 px-2.5',
  );

export const filterLinkButtonClass = (density: FilterDensity) =>
  cn(
    'rounded-lg px-1.5 text-left text-xs font-semibold text-primary hover:underline focus-visible:focus-ring',
    density === 'comfortable' ? 'min-h-11' : 'min-h-7',
  );

export const filterPresetClass = (active: boolean, density: FilterDensity) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-pill border px-3 type-meta font-semibold transition-colors duration-fast ease-standard focus-visible:focus-ring',
    density === 'comfortable' ? 'min-h-11' : 'min-h-8',
    active
      ? 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground'
      : 'border-border bg-transparent text-foreground hover:border-border-strong hover:bg-surface-sunken',
  );

export const filterRowClass = (density: FilterDensity) => (density === 'comfortable' ? 'min-h-11' : 'min-h-8');

/** Visible label above a select/input inside a question group. */
export function FilterFieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1 block type-meta font-semibold text-foreground">{children}</span>;
}

/** One plain-language question (Onde? O quê? …): title, help, then controls. */
export function FilterQuestion({
  title,
  help,
  termId,
  children,
  testId = 'filter-question',
  className,
}: {
  title: string;
  help: ReactNode;
  termId?: string;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn('min-w-0 border-b border-border-subtle py-4 last:border-b-0', className)} data-testid={testId}>
      <div className="flex items-center gap-1">
        <h3 id={titleId} className="type-ui font-semibold text-foreground">
          {title}
        </h3>
        {termId && <GlossaryTerm termId={termId} variant="icon" className="-my-1" />}
      </div>
      <p className="mt-0.5 mb-2.5 type-meta text-muted-foreground">{help}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/** Nested group inside "Mais filtros". */
export function FilterSubGroup({ title, help, termId, children }: { title: string; help?: string; termId?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="border-b border-border-subtle py-3 last:border-b-0">
      <div className="flex items-center gap-1">
        <h4 id={titleId} className="type-meta font-semibold text-foreground">
          {title}
        </h4>
        {termId && <GlossaryTerm termId={termId} variant="icon" className="-my-1" />}
      </div>
      {help && <p className="mt-0.5 mb-1.5 type-meta text-muted-foreground">{help}</p>}
      {children}
    </section>
  );
}

/** Folded free-form fields ("Escolher datas", "Outro valor"). */
export function FilterDisclosure({
  label,
  open,
  onToggle,
  density,
  testId,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  density: FilterDensity;
  testId: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="mt-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        data-testid={testId}
        onClick={onToggle}
        className={cn('-mx-1.5 inline-flex items-center gap-1', filterLinkButtonClass(density))}
      >
        {label}
        <ChevronDown size={13} aria-hidden className={cn('transition-transform duration-fast ease-standard', open && 'rotate-180')} />
      </button>
      <div id={id} hidden={!open} className="pt-1.5">
        {children}
      </div>
    </div>
  );
}

/** Collapsible "Mais filtros" block shared by every results page. */
export function FilterMoreSection({
  open,
  onOpenChange,
  count,
  density,
  sectionTestId,
  buttonTestId,
  panelTestId,
  badgeTestId,
  summary,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  density: FilterDensity;
  sectionTestId?: string;
  buttonTestId: string;
  panelTestId: string;
  badgeTestId: string;
  summary: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="py-3" data-testid={sectionTestId}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          data-testid={buttonTestId}
          onClick={() => onOpenChange(!open)}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg text-left type-ui font-semibold text-foreground transition-colors duration-fast ease-standard hover:text-primary focus-visible:focus-ring',
            density === 'comfortable' ? 'min-h-11' : 'min-h-8',
          )}
        >
          <span className="flex-1">
            Mais filtros
            {count > 0 && (
              <span data-testid={badgeTestId} className="ml-1.5 rounded-pill bg-primary px-1.5 py-0.5 type-data text-xs leading-none font-bold text-primary-foreground">
                {count}
                <span className="sr-only"> {count === 1 ? 'ativo' : 'ativos'}</span>
              </span>
            )}
          </span>
          <ChevronDown size={15} aria-hidden className={cn('transition-transform duration-fast ease-standard', open && 'rotate-180')} />
        </button>
      </h3>
      {!open && <p className="type-meta text-muted-foreground">{summary}</p>}
      <div id={id} hidden={!open} data-testid={panelTestId} className="pt-1">
        {children}
      </div>
    </section>
  );
}

export type ActiveFilterChipBase = {
  id: string;
  group: string;
  label: string;
};

/** Removable chips above every results list. */
export function ActiveFilterChips<T extends ActiveFilterChipBase>({
  chips,
  showGroup,
  onRemove,
  onClearAll,
  canClear = true,
  regionTestId,
  clearTestId,
  chipTestId,
}: {
  chips: T[];
  showGroup: (chip: T) => boolean;
  onRemove: (chip: T) => void;
  onClearAll: () => void;
  canClear?: boolean;
  regionTestId: string;
  clearTestId: string;
  chipTestId: (chip: T) => string;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="region" aria-label="Filtros ativos" data-testid={regionTestId}>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onRemove(chip)}
          aria-label={`Remover filtro ${chip.group}: ${chip.label}`}
          data-testid={chipTestId(chip)}
          className="group inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-pill border border-border-subtle bg-surface py-1 pr-1.5 pl-2.5 text-xs text-foreground transition-colors duration-fast ease-standard hover:border-border-strong hover:bg-surface-sunken focus-visible:focus-ring"
        >
          {showGroup(chip) && <span className="text-muted-foreground">{chip.group}:</span>}
          <span className="truncate font-medium">{chip.label}</span>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-standard group-hover:text-foreground">
            <X size={12} aria-hidden />
          </span>
        </button>
      ))}
      {canClear && (
        <button type="button" onClick={onClearAll} data-testid={clearTestId} className="min-h-8 rounded-lg px-2 text-xs font-semibold text-primary hover:underline focus-visible:focus-ring">
          Limpar tudo
        </button>
      )}
    </div>
  );
}
