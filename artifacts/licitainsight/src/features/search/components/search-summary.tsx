import type { TenderSearchParams } from '@/api';
import { sortLabels } from '@/lib/tender-labels';
import { cn } from '@/lib/utils';
import { buildFilterChips } from '../lib/filter-chips';
import { SEARCH_MODE_ENABLED } from '../lib/search-defaults';

/** Read-only summary of a search (term, filters, mode, sort) as small pills. Used by "Salvar busca" and /saved-searches. */
export function SearchSummary({ params, className }: { params: TenderSearchParams; className?: string }) {
  const items = [
    ...(params.q ? [{ id: 'q', group: 'Termo', label: `“${params.q}”` }] : []),
    ...buildFilterChips(params),
    ...(SEARCH_MODE_ENABLED && params.mode && params.mode !== 'keyword' ? [{ id: 'mode', group: 'Modo', label: 'Semântica' }] : []),
    ...(params.sort ? [{ id: 'sort', group: 'Ordem', label: sortLabels[params.sort] }] : []),
  ];
  if (items.length === 0) return <p className={cn('type-meta text-muted-foreground', className)}>Sem termo nem filtros: todos os editais do banco.</p>;
  return (
    <ul aria-label="Filtros da busca" className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((item) => (
        <li
          key={item.id}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border-subtle bg-surface-sunken px-2 py-0.5 type-meta"
        >
          <span className="shrink-0 text-muted-foreground">{item.group}:</span>
          <span className="truncate font-medium text-foreground">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
