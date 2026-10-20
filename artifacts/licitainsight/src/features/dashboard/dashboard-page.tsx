import { useMemo } from 'react';
import { Link, useSearch } from 'wouter';
import { ArrowRight, Bell, FileCheck2, LayoutDashboard, Search, SquareKanban, Target } from 'lucide-react';
import { Button, buttonClass } from '@/components/common/action-button';
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
import { ProfileInviteCard } from '@/features/company-profile/components/profile-invite-card';
import { useCompanyProfile, useTenderFits } from '@/features/company-profile/hooks/use-company-profile';
import { useTenderHighlights } from '@/features/tenders/hooks/use-tender-highlights';
import { formatNumber } from '@/lib/format';
import { matchingCandidates, nearestSavedDeadlines } from './lib/priorities';
import { RecommendationsSection } from '@/features/recommendations/components/recommendations-section';
import { TriageEntry } from '@/features/recommendations/triage/triage-entry';
import { useCompanyDocuments } from '@/features/bid-readiness/hooks/use-company-documents';
import { SavedBoardView } from '@/features/saved-tenders/components/saved-pipeline-views';
import { MURAL_HREF } from '@/features/saved-tenders/lib/view';
import { parseDashboardTab, type DashboardTab } from './lib/tabs';
import { cn } from '@/lib/utils';

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
      <div className="mt-2 type-title type-data text-foreground sm:type-titulo-3">{value}</div>
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
          href="/settings?billing=required#assinatura"
          data-testid="link-dashboard-subscribe"
          className="mt-4 inline-flex rounded-lg text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
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
        className="mt-4 inline-flex rounded-lg text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
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
        <h2 className="type-section text-foreground">Editais nacionais</h2>
        {locked && <IncludedInAccessHint />}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Oportunidades de cultura, fomento e inovação de todo o Brasil.</p>
      <Link
        href="/oportunidades"
        data-testid="link-dashboard-opportunities"
        className="mt-4 inline-flex rounded-lg text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
      >
        Ver chamadas <ArrowRight size={13} strokeWidth={1.75} className="ml-1 inline" />
      </Link>
    </div>
  );
}

function BidReadinessCard() {
  const session = useSession();
  const documents = useCompanyDocuments();
  if (session.status !== 'authenticated') return null;
  const progress = documents.data?.progress;
  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="card-dashboard-readiness">
      <div className="flex items-center gap-2"><FileCheck2 size={17} className="text-primary" aria-hidden /><h2 className="type-section text-foreground">Prontidão para licitar</h2></div>
      <p className="mt-2 type-ui font-semibold text-foreground">{progress ? `${progress.ready} de ${progress.total} documentos em dia` : documents.isError ? 'Não foi possível carregar o checklist' : 'Carregando checklist…'}</p>
      <p className="mt-1 type-meta text-muted-foreground">Evite perder uma disputa por certidão vencida ou documento faltando.</p>
      <Link href="/readiness" data-testid="link-dashboard-readiness" className="mt-4 inline-flex rounded-lg text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring">Revisar documentos <ArrowRight size={13} strokeWidth={1.75} className="ml-1 inline" /></Link>
    </div>
  );
}

/** Entry to the Mural tab from the summary. */
function MuralCard() {
  const { saved, status } = useSavedTenders();
  return (
    <Link
      href={MURAL_HREF}
      data-testid="card-dashboard-mural"
      className="group block rounded-xl border border-border bg-card p-5 transition-colors duration-fast ease-standard hover:border-border-strong focus-visible:focus-ring"
    >
      <div className="flex items-center gap-2">
        <SquareKanban size={17} className="text-primary" aria-hidden />
        <h2 className="type-section text-foreground">Mural de processos</h2>
      </div>
      <p className="mt-2 type-ui font-semibold text-foreground">
        {status !== 'ready' ? 'Carregando seus editais…' : saved.length === 0 ? 'Nenhum edital salvo ainda' : `${formatNumber(saved.length)} ${saved.length === 1 ? 'edital salvo' : 'editais salvos'} para organizar`}
      </p>
      <p className="mt-1 type-meta text-muted-foreground">Mova cada processo entre as etapas e acompanhe os documentos de cada um.</p>
      <span className="mt-4 inline-flex items-center rounded-lg text-xs font-semibold text-primary underline-offset-4 group-hover:underline">
        Abrir mural <ArrowRight size={13} strokeWidth={1.75} className="ml-1 inline" />
      </span>
    </Link>
  );
}

const TABS: { value: DashboardTab; label: string; href: string; icon: typeof LayoutDashboard }[] = [
  { value: 'resumo', label: 'Resumo', href: '/dashboard', icon: LayoutDashboard },
  { value: 'mural', label: 'Mural de processos', href: MURAL_HREF, icon: SquareKanban },
];

function DashboardTabs({ active }: { active: DashboardTab }) {
  return (
    <nav aria-label="Seções da visão geral" className="-mx-1 mb-6 overflow-x-auto px-1 pb-1">
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map(({ value, label, href, icon: Icon }) => (
          <Link
            key={value}
            href={href}
            aria-current={active === value ? 'page' : undefined}
            data-testid={`tab-dashboard-${value}`}
            className={cn(
              'inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 type-ui font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring sm:h-8',
              active === value && 'bg-surface text-foreground',
            )}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function MuralTab() {
  return (
    <section aria-labelledby="dashboard-mural-title" data-testid="dashboard-mural">
      <h2 id="dashboard-mural-title" className="type-section text-foreground">Mural de processos</h2>
      <p className="mt-1 mb-4 max-w-3xl type-meta text-muted-foreground">
        Os editais que você está gerenciando e participando, por etapa. Mova um cartão com “Mover para…” (ou arraste, no computador) e use “Organizar documentos” para marcar o que já tem e o que falta em cada edital.
      </p>
      <SavedBoardView />
    </section>
  );
}

function PersonalDeadlines() {
  const analyzing = useSavedTendersList({ page: 1, pageSize: 4, stage: 'analyzing', sort: 'deadline', upcoming: true });
  const preparing = useSavedTendersList({ page: 1, pageSize: 4, stage: 'participating', sort: 'deadline', upcoming: true });
  const { isSaved, toggle } = useSavedTenders();
  const rows = nearestSavedDeadlines(analyzing.data?.data ?? [], preparing.data?.data ?? []);
  const total = (analyzing.data?.pagination.total ?? 0) + (preparing.data?.pagination.total ?? 0);
  const error = analyzing.error ?? preparing.error;
  return (
    <section data-testid="dashboard-personal-deadlines" aria-labelledby="personal-deadlines-title">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="personal-deadlines-title" className="type-section text-foreground">Seus próximos prazos</h2>
          <p className="mt-1 type-meta text-muted-foreground">Editais que você marcou como Analisando ou Preparando documentos, com prazo futuro.</p>
        </div>
        <Link href="/saved-tenders" className="shrink-0 rounded-lg type-meta font-semibold text-primary hover:underline focus-visible:focus-ring">Ver salvos</Link>
      </div>
      {error ? <ErrorState error={error} onRetry={() => { void analyzing.refetch(); void preparing.refetch(); }} />
        : analyzing.isPending || preparing.isPending ? <RowsSkeleton rows={2} />
        : rows.length === 0 ? <p className="rounded-xl border border-border bg-card p-5 type-ui text-muted-foreground">Nenhum prazo futuro nestas etapas. Salve um edital para acompanhar sua preparação aqui.</p>
        : <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {rows.map(({ tender }) => <TenderRow key={tender.id} tender={tender} saved={isSaved(tender.id)} onSave={() => toggle(tender.id)} compact />)}
          </div>
          {total > rows.length && <p className="mt-2 type-meta text-muted-foreground">Mostrando os {rows.length} prazos mais próximos entre {formatNumber(total)} editais nessas etapas.</p>}
        </>}
    </section>
  );
}

export default function DashboardPage() {
  const search = useSearch();
  const { isSaved, toggle } = useSavedTenders();
  const { user } = useSession();
  const billing = useBilling();
  const profile = useCompanyProfile();
  const personal = Boolean(user && billing.data?.entitled);
  // The mural needs saved tenders, so only subscribers see the tabs; others always get the summary.
  const tab = personal ? parseDashboardTab(new URLSearchParams(search).get('aba')) : 'resumo';
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
  const newTenders = useTenderSearch({ pageSize: 1, sort: 'first_seen_desc', facets: false, newOnly: true });
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
  const fits = useTenderFits(priority.data?.data.map((tender) => tender.id) ?? []);
  const highlights = useTenderHighlights(priority.data?.data.map((tender) => tender.id) ?? []);
  const candidates = priority.data?.data ?? [];
  const matches = matchingCandidates(candidates, fits.data?.results ?? {});
  const shown = personal && matches.length > 0 ? matches : candidates;
  const fitsPending = fits.isPending || candidates.some(tender => !fits.data?.results[tender.id] || fits.data.results[tender.id].status === 'pending');
  const metrics = (
    <section aria-label="Métricas nacionais" data-testid="dashboard-national-metrics" className="grid grid-cols-2 gap-5 rounded-xl border border-border bg-card px-4 py-5 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-border-subtle sm:px-0 sm:py-6">
      <Link href="/search?newOnly=true&sort=first_seen_desc" data-testid="link-dashboard-new-tenders" className="rounded-lg focus-visible:focus-ring">
        <MiniMetric label="Novos desde ontem" value={metricValue(newTenders.data?.pagination.total, newTenders.isPending, newTenders.isError)} detail="editais novos no Pardal" attention />
      </Link>
      <MiniMetric label="Prazo nos próximos 7 dias" value={metricValue(soon.data?.pagination.total, soon.isPending, soon.isError)} detail="editais em aberto" attention />
      <MiniMetric label="Publicados na semana" value={metricValue(recent.data?.pagination.total, recent.isPending, recent.isError)} detail="nos últimos 7 dias" />
      <MiniMetric label="Editais disponíveis" value={metricValue(catalog.data?.pagination.total, catalog.isPending, catalog.isError)} detail="de todo o Brasil" />
    </section>
  );

  return (
    <>
      <PageTitle
        eyebrow={eyebrow}
        title={firstName ? `${greeting()}, ${firstName}.` : `${greeting()}.`}
        description="Os prazos que estão chegando e o que merece sua atenção hoje."
        action={
          <Link
            href="/search"
            data-testid="link-dashboard-search"
            className={`${buttonClass()} self-start sm:self-auto`}
          >
            <Search size={15} strokeWidth={1.75} />
            Explorar editais
          </Link>
        }
      />
      {personal && <DashboardTabs active={tab} />}
      {tab === 'mural' ? <MuralTab /> : <>
      {user && <ProfileInviteCard />}
      {!personal && <div className="mb-8">{metrics}</div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
        {personal && <TriageEntry />}
        {personal && <RecommendationsSection />}
        {personal && <PersonalDeadlines />}
        {personal && profile.isPending ? <RowsSkeleton rows={2} />
          : personal && profile.isError ? <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
          : <section data-testid="dashboard-candidates">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="type-section text-foreground">Prazos mais próximos</h2>
              <p className="mt-1 text-xs text-muted-foreground">{personal ? 'Uma visão complementar dos prazos, com a aderência ao perfil quando disponível.' : 'Editais em aberto com prazo de proposta a partir de hoje'}</p>
            </div>
            <Link
              href={`/search?status=open&sort=deadline_asc&deadlineFrom=${today}`}
              data-testid="link-dashboard-all"
              className="shrink-0 rounded-lg text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
            >
              Ver todos com prazo <ArrowRight size={13} strokeWidth={1.75} className="ml-1 inline" />
            </Link>
          </div>
          {personal && candidates.length > 0 && (fits.isError
            ? <ErrorState error={fits.error} onRetry={() => fits.refetch()} />
            : <p className="mb-3 type-meta text-muted-foreground">{fitsPending ? 'A avaliação destes editais ainda está em andamento.' : matches.length > 0 ? `${matches.length} com aderência alta ou média nesta seleção. Compatibilidade não significa habilitação.` : 'Nenhum destes editais tem aderência alta ou média ao seu perfil. Veja os prazos abaixo ou explore outras oportunidades.'}</p>)}
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
              {shown.map((tender) => (
                <TenderRow key={tender.id} tender={tender} saved={isSaved(tender.id)} onSave={() => toggle(tender.id)} compact fit={fits.data?.results[tender.id]} highlights={highlights.data?.results[tender.id]} />
              ))}
            </div>
          )}
        </section>}
        {personal && metrics}
        </div>
        <aside className="space-y-6">
          {personal && <MuralCard />}
          <BidReadinessCard />
          <MonitoringCard />
          <OpportunitiesCard />
        </aside>
      </div>
      </>}
    </>
  );
}
