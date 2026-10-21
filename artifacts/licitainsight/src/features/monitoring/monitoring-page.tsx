import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { BellOff, CheckCheck, Target } from 'lucide-react';
import { isApiError, type Notification } from '@/api';
import { Button } from '@/components/common/action-button';
import { EmptyState } from '@/components/common/empty-state';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/hooks/use-toast';
import { ProvenanceLabel } from '@/features/participation/components/provenance-label';
import { STAGE_LABELS } from '@/features/participation/lib/stages';
import { useMarkSavedSearchSeen } from '@/features/saved-searches/hooks/use-saved-searches';
import { useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { useSavedTendersList } from '@/features/saved-tenders/hooks/use-saved-tenders-list';
import { SearchPagination } from '@/features/search/components/search-pagination';
import { TenderRow } from '@/features/tenders/components/tender-row';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NotificationItem } from './components/notification-item';
import { useMarkNotificationsRead, useNotifications, useUnreadCount } from './hooks/use-notifications';

const PAGE_SIZE = 20;

const linkClass = 'type-meta font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring rounded-lg';

/** Returns to the last page when the current one empties (after marking read or stopping monitoring). */
function useClampPage(page: number, totalPages: number | undefined, setPage: (page: number) => void) {
  useEffect(() => {
    if (totalPages !== undefined && page > 1 && page > totalPages) setPage(Math.max(1, totalPages));
  }, [page, totalPages, setPage]);
}

function NotificationsSection() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const list = useNotifications({ unreadOnly: unreadOnly || undefined, page, pageSize: PAGE_SIZE });
  const unread = useUnreadCount();
  const markRead = useMarkNotificationsRead();
  const markSeen = useMarkSavedSearchSeen();
  useClampPage(page, list.data?.pagination.totalPages, setPage);

  const unreadCount = unread.data ?? list.data?.unreadCount ?? 0;

  const reportMarkError = (error: unknown) => {
    console.error('[monitoring] Falha ao marcar notificações como lidas.', error);
    toast({
      variant: 'destructive',
      title: 'Não foi possível marcar como lida',
      description: isApiError(error) && error.requestId ? `Tente de novo. ref. ${error.requestId}` : 'Tente de novo.',
    });
  };

  const select = (n: Notification) => {
    if (n.readAt === null) markRead.mutate({ ids: [n.id] }, { onError: reportMarkError });
    // Opening a saved search's alert is a visit: reset its "novos" count.
    if (n.savedSearch) markSeen.mutate(n.savedSearch.id, { onError: (error) => console.error('[monitoring] Falha ao marcar a busca como vista.', error) });
  };

  const filter = (next: boolean) => {
    setUnreadOnly(next);
    setPage(1);
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filtrar notificações" className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {[
            { value: false, label: 'Todas' },
            { value: true, label: `Não lidas${unreadCount > 0 ? ` (${formatNumber(unreadCount)})` : ''}` },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={unreadOnly === option.value}
              data-testid={option.value ? 'filter-notifications-unread' : 'filter-notifications-all'}
              onClick={() => filter(option.value)}
              className={cn(
                'h-7 rounded-lg px-3 type-ui font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring',
                unreadOnly === option.value && 'bg-surface text-foreground ',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={unreadCount === 0}
          loading={markRead.isPending && markRead.variables?.all === true}
          onClick={() => markRead.mutate({ all: true }, { onError: reportMarkError })}
          data-testid="button-mark-all-read"
        >
          <CheckCheck size={14} aria-hidden />
          Marcar todas como lidas
        </Button>
      </div>
      {list.isPending ? (
        <RowsSkeleton rows={4} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.data.length === 0 ? (
        unreadOnly ? (
          <EmptyState icon={CheckCheck} title="Tudo lido">
            Nenhuma notificação não lida.
          </EmptyState>
        ) : (
          <EmptyState icon={BellOff} title="Nenhuma notificação ainda">
            Avisamos aqui quando um edital monitorado muda de prazo, status, valor ou documentos, e quando uma{' '}
            <Link href="/saved-searches" className={linkClass}>
              busca salva
            </Link>{' '}
            com alertas encontra editais novos na coleta diária.
          </EmptyState>
        )
      ) : (
        <div className="@container/results">
          <ul aria-label="Notificações" aria-busy={list.isFetching || undefined} className="overflow-hidden rounded-xl border border-border bg-card">
            {list.data.data.map((n) => (
              <li key={n.id} className="border-b border-border-subtle last:border-0">
                <NotificationItem notification={n} onSelect={select} />
              </li>
            ))}
          </ul>
          {list.data.pagination.totalPages > 1 && (
            <SearchPagination pagination={list.data.pagination} page={page} onPageChange={setPage} noun={['notificação', 'notificações']} />
          )}
        </div>
      )}
    </>
  );
}

function MonitoredSection() {
  const [page, setPage] = useState(1);
  const list = useSavedTendersList({ monitored: true, page, pageSize: PAGE_SIZE });
  const { isSaved, toggle, isMonitored, toggleMonitor, status } = useSavedTenders();
  useClampPage(page, list.data?.pagination.totalPages, setPage);

  // Stopped rows disappear at once (optimistic ids); the list refetches when the change settles.
  const rows = (list.data?.data ?? []).filter((item) => status !== 'ready' || isMonitored(item.tender.id));

  const stop = (id: string) => {
    toggleMonitor(id);
    toast({
      title: 'Edital deixou de ser monitorado',
      description: 'Ele continua em Editais salvos.',
      action: (
        <ToastAction altText="Desfazer" data-testid="button-undo-stop-monitoring" onClick={() => toggleMonitor(id)}>
          Desfazer
        </ToastAction>
      ),
    });
  };

  if (list.isPending) return <RowsSkeleton rows={3} />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  if (list.data.pagination.total === 0 || rows.length === 0)
    return (
      <EmptyState icon={Target} title="Nenhum edital monitorado">
        Abra um edital e use “Monitorar” para ser avisado aqui quando prazo, status ou valor mudarem ou sair um anexo novo.{' '}
        <Link href="/search" className={linkClass}>
          Explorar editais
        </Link>
      </EmptyState>
    );

  return (
    <div className="@container/results">
      <ul aria-label="Editais monitorados" className="overflow-hidden rounded-xl border border-border bg-card">
        {rows.map(({ tender, monitoredAt, stage }) => (
          <li key={tender.id} className="border-b border-border last:border-0 [&>article]:border-0">
            <TenderRow tender={tender} saved={isSaved(tender.id)} onSave={() => toggle(tender.id)} compact />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-surface-sunken/60 px-4 py-2 sm:px-5">
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5 type-meta text-muted-foreground">
                  <Target size={13} aria-hidden className="text-primary" />
                  {monitoredAt ? `Monitorando desde ${formatDate(monitoredAt)}` : 'Monitorando'}
                </span>
                <ProvenanceLabel kind="user">Você marcou: {STAGE_LABELS[stage]}</ProvenanceLabel>
              </span>
              <Button variant="ghost" size="sm" onClick={() => stop(tender.id)} data-testid={`button-stop-monitor-${tender.id}`}>
                Parar de monitorar
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {list.data.pagination.totalPages > 1 && (
        <SearchPagination pagination={list.data.pagination} page={page} onPageChange={setPage} noun={['edital monitorado', 'editais monitorados']} />
      )}
    </div>
  );
}

export default function MonitoringPage() {
  const unread = useUnreadCount();
  const monitoredTotal = useSavedTendersList({ monitored: true, page: 1, pageSize: PAGE_SIZE }).data?.pagination.total;
  const count = (value: number | undefined) =>
    value ? <span className="ml-1.5 rounded-pill bg-accent px-1.5 type-data text-xs font-bold text-accent-foreground">{formatNumber(value)}</span> : null;

  return (
    <>
      <PageTitle
        title="Monitoramento"
        description="Mudanças nos editais que você monitora e editais novos das suas buscas salvas com alertas. Tudo aqui no app."
      />
      <Tabs defaultValue="notifications">
        <TabsList className="mb-4">
          <TabsTrigger value="notifications" data-testid="tab-notifications" className="type-ui">
            Notificações
            {count(unread.data)}
          </TabsTrigger>
          <TabsTrigger value="monitored" data-testid="tab-monitored" className="type-ui">
            Editais monitorados
            {monitoredTotal ? <span className="ml-1.5 type-data text-xs text-muted-foreground">{formatNumber(monitoredTotal)}</span> : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="notifications" className="mt-0">
          <NotificationsSection />
        </TabsContent>
        <TabsContent value="monitored" className="mt-0">
          <MonitoredSection />
        </TabsContent>
      </Tabs>
    </>
  );
}
