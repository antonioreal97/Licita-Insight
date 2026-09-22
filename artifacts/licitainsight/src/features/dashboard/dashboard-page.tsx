import { useMemo } from 'react';
import { Link } from 'wouter';
import { ArrowRight, RefreshCw, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { useTenderSearch } from '@/features/search/hooks/use-tender-search';
import { useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { TenderRow } from '@/features/tenders/components/tender-row';
import { formatNumber } from '@/lib/format';

function saoPauloDate(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offsetDays)).toISOString().slice(0, 10);
}

function MiniMetric({ label, value, detail, tone = 'green' }: { label: string; value: string; detail: string; tone?: 'green' | 'amber' | 'blue' }) {
  const toneClass = tone === 'amber' ? 'text-status-under-review-foreground' : 'text-primary';
  return (
    <div className="border-l border-primary/40 pl-4">
      <div className="type-label text-muted-foreground">{label}</div>
      <div className="mt-2 type-display-sm tabular-nums text-foreground">{value}</div>
      <div className={`mt-1 text-xs font-medium ${toneClass}`}>{detail}</div>
    </div>
  );
}

function metricValue(total: number | undefined, pending: boolean, failed: boolean) {
  if (pending) return '…';
  if (failed || total === undefined) return '—';
  return formatNumber(total);
}

export default function DashboardPage() {
  const { isSaved, toggle } = useSavedTenders();
  const today = useMemo(() => saoPauloDate(0), []);
  const weekAgo = useMemo(() => saoPauloDate(-6), []);
  const weekAhead = useMemo(() => saoPauloDate(7), []);
  const eyebrow = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        timeZone: 'America/Sao_Paulo',
      })
        .format(new Date())
        .replace('.', ''),
    [],
  );
  const catalog = useTenderSearch({ pageSize: 1, sort: 'published_desc', facets: false });
  const recent = useTenderSearch({ pageSize: 1, sort: 'published_desc', facets: false, publishedFrom: weekAgo });
  const soon = useTenderSearch({
    pageSize: 1,
    sort: 'deadline_asc',
    facets: false,
    status: ['open'],
    deadlineFrom: today,
    deadlineTo: weekAhead,
  });
  const priority = useTenderSearch({ pageSize: 4, sort: 'deadline_asc', status: ['open'], facets: false });
  const refresh = () => {
    void catalog.refetch();
    void recent.refetch();
    void soon.refetch();
    void priority.refetch();
  };

  return (
    <>
      <PageTitle
        eyebrow={eyebrow}
        title="Bom dia, Marina."
        description="Uma leitura rápida das publicações do PNCP que estão no banco."
        action={
          <Link href="/search" data-testid="link-dashboard-search">
            <Button>
              <Search size={15} />
              Explorar editais
            </Button>
          </Link>
        }
      />
      <div className="mb-8 grid gap-6 border-y border-border bg-card px-5 py-6 sm:grid-cols-3 sm:px-7">
        <MiniMetric
          label="Editais no banco"
          value={metricValue(catalog.data?.pagination.total, catalog.isPending, catalog.isError)}
          detail="publicações coletadas"
        />
        <MiniMetric
          label="Publicados em 7 dias"
          value={metricValue(recent.data?.pagination.total, recent.isPending, recent.isError)}
          detail="contados a partir de hoje"
          tone="amber"
        />
        <MiniMetric
          label="Aberturas próximas"
          value={metricValue(soon.data?.pagination.total, soon.isPending, soon.isError)}
          detail="em aberto, prazo nos próximos 7 dias"
          tone="blue"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="type-section text-foreground">Prazos mais próximos</h2>
              <p className="mt-1 text-xs text-muted-foreground">Editais em aberto, ordenados pelo prazo de proposta</p>
            </div>
            <Link href="/search" data-testid="link-dashboard-all" className="text-xs font-semibold text-primary hover:underline">
              Ver todos <ArrowRight size={13} className="ml-1 inline" />
            </Link>
          </div>
          {priority.isPending ? (
            <RowsSkeleton rows={4} />
          ) : priority.isError ? (
            <ErrorState error={priority.error} onRetry={() => priority.refetch()} />
          ) : priority.data.data.length === 0 ? (
            <p className="rounded-xl border border-border bg-card px-5 py-8 text-sm text-muted-foreground">
              Nenhum edital em aberto no banco.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {priority.data.data.map((tender) => (
                <TenderRow key={tender.id} tender={tender} saved={isSaved(tender.id)} onSave={() => toggle(tender.id)} />
              ))}
            </div>
          )}
        </section>
        <aside className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="type-section text-foreground">Coleta</h2>
              <button
                data-testid="button-refresh-activity"
                aria-label="Atualizar leitura"
                onClick={refresh}
                className="rounded-md p-1 text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-primary"
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              A API atualiza as publicações novas todo dia e revisa os editais que ainda estão em aberto. O histórico que já entrou no banco permanece.
            </p>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary-subtle/50 p-5">
            <div className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
              <Sparkles size={16} />
            </div>
            <h3 className="text-sm font-semibold">Seu radar está aprendendo</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Salve editais relevantes para calibrar as próximas recomendações.</p>
            <Link href="/settings" data-testid="link-dashboard-preferences" className="mt-4 inline-block text-xs font-semibold text-primary">
              Revisar preferências <ArrowRight size={13} className="ml-1 inline" />
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
