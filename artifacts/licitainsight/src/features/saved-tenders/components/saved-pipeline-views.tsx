import { Link } from 'wouter';
import { Bookmark } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { useSavedTenders } from '../hooks/use-saved-tenders';
import { useAllSavedTenders } from '../hooks/use-saved-tenders-list';
import { DeadlineCalendar } from './deadline-calendar';
import { PipelineBoard } from './pipeline-board';

const linkClass = 'type-meta font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring rounded-lg';

export function EmptySaved() {
  return (
    <EmptyState icon={Bookmark} title="Nenhum edital salvo ainda" testId="empty-saved">
      Salve um edital na busca ou no detalhe para acompanhar prazo e preparo aqui.{' '}
      <Link href="/search" className={linkClass}>
        Explorar editais
      </Link>
    </EmptyState>
  );
}

/** The mural (Visão geral) and the calendar need every saved tender at once (≤ 500, fetched page by page). */
function AllSaved({ view }: { view: 'board' | 'calendar' }) {
  const all = useAllSavedTenders();
  const { isSaved, status } = useSavedTenders();
  // Removed tenders disappear at once (optimistic ids), as in the list.
  const items = (all.data ?? []).filter((item) => status !== 'ready' || isSaved(item.tender.id));

  if (all.isPending) return <RowsSkeleton />;
  if (all.isError) return <ErrorState error={all.error} onRetry={() => all.refetch()} />;
  if (items.length === 0) return <EmptySaved />;
  return (
    <>
      <p aria-live="polite" className="mb-3 type-meta text-muted-foreground" data-testid="text-saved-count">
        {items.length} {items.length === 1 ? 'edital salvo' : 'editais salvos'}
        {view === 'calendar' && ' · sem os marcados como “Não vou participar”'}
        {all.isFetching && ' · atualizando…'}
      </p>
      {view === 'board' ? <PipelineBoard items={items} /> : <DeadlineCalendar items={items} />}
    </>
  );
}

export const SavedBoardView = () => <AllSaved view="board" />;
export const SavedCalendarView = () => <AllSaved view="calendar" />;
