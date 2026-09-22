import { Download } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { useTenderSearch } from '@/features/search/hooks/use-tender-search';
import { TenderRow } from '@/features/tenders/components/tender-row';
import { useSavedTenders } from './hooks/use-saved-tenders';

// TODO(saved-tenders): priority chips are static placeholders.
export default function SavedTendersPage() {
  const { saved, isSaved, toggle } = useSavedTenders();
  // Until a saved-tenders endpoint exists, resolve the saved ids through the search API.
  const results = useTenderSearch({ pageSize: 100, facets: false });
  const items = results.data?.data.filter((t) => saved.includes(t.id)) ?? [];
  return (
    <>
      <PageTitle
        eyebrow="sua shortlist"
        title="Editais salvos"
        description="Organize oportunidades para a próxima conversa comercial."
        action={
          <Button variant="outline" data-testid="button-export-saved">
            <Download size={14} />
            Exportar lista
          </Button>
        }
      />
      <div className="mb-5 flex gap-2 overflow-x-auto">
        <button data-testid="button-priority-all" className="rounded-full bg-inverse px-3 py-1.5 text-xs font-semibold text-inverse-foreground">
          Todos <span className="ml-1 type-data text-3xs text-inverse-foreground/70">{saved.length}</span>
        </button>
        <button
          data-testid="button-priority-high"
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground"
        >
          Alta prioridade <span className="ml-1 type-data text-3xs">1</span>
        </button>
        <button
          data-testid="button-priority-review"
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground"
        >
          Em revisão <span className="ml-1 type-data text-3xs">2</span>
        </button>
      </div>
      {results.isPending ? (
        <RowsSkeleton rows={3} />
      ) : results.isError ? (
        <ErrorState error={results.error} onRetry={() => results.refetch()} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-16 text-center type-body text-muted-foreground">
          Nenhum edital salvo ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {items.map((t) => (
            <TenderRow key={t.id} tender={t} saved={isSaved(t.id)} onSave={() => toggle(t.id)} />
          ))}
        </div>
      )}
    </>
  );
}
