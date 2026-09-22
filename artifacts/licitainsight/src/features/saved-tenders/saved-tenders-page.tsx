import { Download } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { useTenderSearch } from '@/features/search/hooks/use-tender-search';
import { TenderRow } from '@/features/tenders/components/tender-row';
import { useSavedTenders } from './hooks/use-saved-tenders';

// Saved ids live in the browser. The rows themselves come from the search API.
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
