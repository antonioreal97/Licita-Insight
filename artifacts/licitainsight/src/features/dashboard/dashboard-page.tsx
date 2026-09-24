import { useMemo } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Bell, RefreshCw, Search, Target } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { signInWithGoogle, useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { useUnreadCount } from '@/features/monitoring/hooks/use-notifications';
import { IncludedInAccessHint } from '@/features/opportunities/components/access-gate';
import { useOpportunityAccess } from '@/features/opportunities/hooks/use-opportunities';
import { useTenderSearch } from '@/features/search/hooks/use-tender-search';
import { useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { useSavedTendersList } from '@/features/saved-tenders/hooks/use-saved-tenders-list';
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

function MiniMetric({ label, value, detail, attention = false }: { label: string; value: string; detail: string; attention?: boolean }) {
  return (
    <div className="min-w-0 sm:px-7">
      <div className="type-label text-muted-foreground">{label}</div>
      <div className="mt-2 type-title type-data text-foreground sm:type-display-sm">{value}</div>
      <div className={`mt-1 type-meta ${attention ? 'font-medium text-status-under-review-foreground' : 'text-muted-foreground'}`}>{detail}</div>
    </div>
  );
}

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date()));
  if (hour < 12) return 'Bom dia';
  return hour < 18 ? 'Boa tarde' : 'Boa noite';
}

function metricValue(total: number | undefined, pending: boolean, failed: boolean) {
  if (pending) return '…';
  if (failed || total === undefined) return '—';
  return formatNumber(total);
}

function countLine(query: { data?: number; isPending: boolean; isError: boolean }, one: string, many: string, none: string) {
  if (query.isError) return 'não foi possível carregar';
  if (query.isPending || query.data === undefined) return '…';
  if (query.data === 0) return none;
  return `${formatNumber(query.data)} ${query.data === 1 ? one : many}`;
}

/** Signed in: unread notifications + monitored tenders, from the API. Signed out: invitation to sign in. Nothing while the session loads. */
function MonitoringCard() {
  const session = useSession();
  const billing = useBilling();
  const unread = useUnreadCount();
  const monitored = useSavedTendersList({ monitored: true, page: 1, pageSize: 1 });
  if (session.status === 'anonymous')
    return (
      <div className="rounded-xl border border-border bg-card p-5" data-testid="card-dashboard-sign-in">
        <h2 className="type-section text-foreground">Salve e monitore editais</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Entre com Google para salvar editais e buscas e ser avisado aqui no app quando prazo, status, valor ou documentos mudarem.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => signInWithGoogle()} data-testid="button-dashboard-sign-in">
          Entrar com Google
        </Button>
      </div>
    );
  if (session.status !== 'authenticated') return null;
  if (billing.isSuccess && !billing.data.entitled)
    return (
      <div className="rounded-xl border border-border bg-card p-5" data-testid="card-dashboard-subscribe">
        <h2 className="type-section text-foreground">Salve e monitore editais</h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          A busca continua aberta. Assine para salvar editais, guardar buscas e receber alertas aqui no app.
        </p>
        <Link
          href="/settings?billing=required"
          data-testid="link-dashboard-subscribe"
          className="mt-4 inline-flex rounded-sm text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
        >
          Ver assinatura <ArrowRight size={13} strokeWidth={1.75} className="ml-1 inline" />
        </Link>
      </div>
    );
  const unreadQuery = { data: unread.data, isPending: unread.isPending, isError: unread.isError };
  const monitoredQuery = { data: monitored.data?.pagination.total, isPending: monitored.isPending, isError: monitored.isError };
  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="card-dashboard-monitoring">
      <h2 className="type-section text-foreground">Monitoramento</h2>
      <ul className="mt-3 space-y-2 type-ui text-foreground">
        <li className="flex items-center gap-2" data-testid="text-dashboard-unread">
          <Bell size={14} aria-hidden className="text-foreground-subtle" />
          {countLine(unreadQuery, 'notificação não lida', 'notificações não lidas', 'Nenhuma notificação não lida')}
        </li>
        <li className="flex items-center gap-2" data-testid="text-dashboard-monitored">
          <Target size={14} aria-hidden className="text-foreground-subtle" />
          {countLine(monitoredQuery, 'edital monitorado', 'editais monitorados', 'Nenhum edital monitorado')}
        </li>
      </ul>
      <Link
        href="/monitoring"
        data-testid="link-dashboard-monitoring"
        className="mt-4 inline-flex rounded-sm text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
      >
        Abrir monitoramento <ArrowRight size={13} strokeWidth={1.75} className="ml-1 inline" />
      </Link>
    </div>
  );
}

/** Entry to cultural calls. Without access (signed out, or no trial/subscription) it says so before the click. */
function OpportunitiesCard() {
  const access = useOpportunityAccess();
  const locked = access.state === 'anonymous' || access.state === 'no-access';
  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="card-dashboard-opportunities">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="type-section text-foreground">Chamadas culturais</h2>
        {locked && <IncludedInAccessHint />}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Fomento audiovisual do Mapa da Cultura e das secretarias que publicam no Mapas Culturais.</p>
      <Link
        href="/oportunidades"
        data-testid="link-dashboard-opportunities"
        className="mt-4 inline-flex rounded-sm text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
      >
        Ver chamadas <ArrowRight size={13} strokeWidth={1.75} className="ml-1 inline" />
      </Link>
    </div>
  );
}

export default function DashboardPage() {
  const { isSaved, toggle } = useSavedTenders();
  const { user } = useSession();
  const firstName = user?.name?.trim().split(/\s+/)[0];
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
  // deadlineFrom=today keeps "open" tenders whose deadline already passed (status lags the source) out of the top.
  const priority = useTenderSearch({ pageSize: 4, sort: 'deadline_asc', status: ['open'], deadlineFrom: today, facets: false });
  const refreshing = catalog.isFetching || recent.isFetching || soon.isFetching || priority.isFetching;
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
        title={firstName ? `${greeting()}, ${firstName}.` : `${greeting()}.`}
        description="Uma leitura rápida das publicações do PNCP que estão no banco."
        action={
          <Link
            href="/search"
            data-testid="link-dashboard-search"
            className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-lg bg-primary px-3.5 type-ui font-semibold text-primary-foreground shadow-xs transition-[background-color,scale] duration-fast ease-standard hover:bg-primary-hover active:scale-[0.98] active:bg-primary-active focus-visible:focus-ring sm:self-auto"
          >
            <Search size={15} strokeWidth={1.75} />
            Explorar editais
          </Link>
        }
      />
      <div className="mb-8 grid grid-cols-3 gap-3 rounded-xl border border-border bg-card px-4 py-5 sm:gap-0 sm:divide-x sm:divide-border-subtle sm:px-0 sm:py-6">
        <MiniMetric
          label="Editais no banco"
          value={metricValue(catalog.data?.pagination.total, catalog.isPending, catalog.isError)}
          detail="publicações coletadas"
        />
        <MiniMetric label="Últimos 7 dias" value={metricValue(recent.data?.pagination.total, recent.isPending, recent.isError)} detail="publicados até hoje" />
        <MiniMetric
          label="Prazos próximos"
          value={metricValue(soon.data?.pagination.total, soon.isPending, soon.isError)}
          detail="em aberto, prazo de proposta em até 7 dias"
          attention
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="type-section text-foreground">Prazos mais próximos</h2>
              <p className="mt-1 text-xs text-muted-foreground">Editais em aberto com prazo de proposta a partir de hoje</p>
            </div>
            <Link
              href={`/search?status=open&sort=deadline_asc&deadlineFrom=${today}`}
              data-testid="link-dashboard-all"
              className="shrink-0 rounded-sm text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
            >
              Ver todos <ArrowRight size={13} strokeWidth={1.75} className="ml-1 inline" />
            </Link>
          </div>
          {priority.isPending ? (
            <RowsSkeleton rows={4} />
          ) : priority.isError ? (
            <ErrorState error={priority.error} onRetry={() => priority.refetch()} />
          ) : priority.data.data.length === 0 ? (
            <p className="rounded-xl border border-border bg-card px-5 py-8 text-sm text-muted-foreground">
              Nenhum edital em aberto com prazo a partir de hoje.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {priority.data.data.map((tender) => (
                <TenderRow key={tender.id} tender={tender} saved={isSaved(tender.id)} onSave={() => toggle(tender.id)} compact />
              ))}
            </div>
          )}
        </section>
        <aside className="space-y-6">
          <MonitoringCard />
          <OpportunitiesCard />
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="type-section text-foreground">Coleta</h2>
              <button
                data-testid="button-refresh-activity"
                aria-label="Atualizar leitura"
                aria-busy={refreshing || undefined}
                onClick={refresh}
                className="rounded-md p-1 text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:focus-ring"
              >
                <RefreshCw size={14} strokeWidth={1.75} className={refreshing ? 'animate-spin' : undefined} />
              </button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              A API atualiza as publicações novas todo dia e revisa os editais que ainda estão em aberto. O histórico que já entrou no banco permanece.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
