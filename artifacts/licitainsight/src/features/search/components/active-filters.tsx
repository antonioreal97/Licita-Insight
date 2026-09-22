import { X } from 'lucide-react';
import type { TenderSearchParams } from '@/api';
import { buildFilterChips } from '../lib/filter-chips';

type Props = { params: TenderSearchParams; onRemove: (patch: Partial<TenderSearchParams>) => void; onClearAll: () => void };

/** One removable chip per selected value/range. Labels come from the facet label cache (see facet-config). */
export function ActiveFilters({ params, onRemove, onClearAll }: Props) {
  const chips = buildFilterChips(params);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="region" aria-label="Filtros ativos" data-testid="active-filters">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onRemove(chip.remove)}
          aria-label={`Remover filtro ${chip.group}: ${chip.label}`}
          data-testid={`chip-${chip.id}`}
          className="group inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2.5 pr-1.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span className="text-muted-foreground">{chip.group}:</span>
          <span className="truncate font-medium">{chip.label}</span>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground group-hover:bg-background group-hover:text-foreground">
            <X size={12} aria-hidden />
          </span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        data-testid="button-clear-all-filters"
        className="min-h-8 rounded-md px-2 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        Limpar tudo
      </button>
    </div>
  );
}
