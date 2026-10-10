import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';

// three.js só é baixado quando o globo 3D é exibido.
const RadarGlobe3D = lazy(() =>
  import('@/features/landing/components/radar-globe-3d').then((module) => ({ default: module.RadarGlobe3D })),
);
import {
  ArrowRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  Clapperboard,
  Clock,
  Compass,
  FileCheck2,
  FileSearch,
  Filter,
  Globe2,
  Landmark,
  Layers,
  Lock,
  Mail,
  Quote,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand-icon';
import { useSession } from '@/features/auth/hooks/use-session';
import { usePublicPlan } from '@/features/billing/hooks/use-public-plan';
import { BILLING_HREF } from '@/features/billing/lib/trial';
import { useTenderSearch } from '@/features/search/hooks/use-tender-search';
import { ValueDisplay } from '@/features/tenders/components/value-display';
import { formatCurrency, formatCurrencyPrecise, formatDateTime, formatNumber } from '@/lib/format';
import { statusLabels } from '@/lib/tender-labels';
import { cn } from '@/lib/utils';
import { buttonClass } from '@/components/common/action-button';
import { LegalLinks } from '@/features/legal/legal-content';
import { OPPORTUNITY_MAP_ID, OpportunityMapSection } from '@/features/landing/components/opportunity-map-section';
import { PardalClip } from '@/features/landing/components/pardal-clip';
import { useOpenTendersByState } from '@/features/landing/hooks/use-open-tenders-by-state';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const navLink = 'font-semibold text-primary transition-colors duration-fast hover:underline';
const primaryCta = buttonClass('dark', 'lg');
const heroCta = cn(buttonClass('primary', 'lg'), 'h-13 px-7');
const secondaryCta = cn(buttonClass('outline', 'lg'), 'h-13 px-7');
const eyebrow = 'type-eyebrow font-bold text-primary tracking-eyebrow uppercase';
const sectionTitle = 'mt-4 type-titulo-2 lg:type-titulo-1';

// Same as the globe: three.js only downloads when the flying pardal is shown.
const PardalFlight3D = lazy(() =>
  import('@/features/landing/components/pardal-flight-3d').then((m) => ({ default: m.PardalFlight3D })),
);

// Below this width the side gutters of `max-w-7xl` are too narrow for the bird to rest in without covering text;
// it then shows only during the cover transition between sections.
const PARDAL_FLIGHT_MEDIA = '(min-width: 1360px)';
const REDUCED_MOTION_MEDIA = '(prefers-reduced-motion: reduce)';

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
function PardalFlight() {
  const wide = useMediaQuery(PARDAL_FLIGHT_MEDIA);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_MEDIA);
  // Reduced motion keeps only the perched gutter bird, which needs a wide screen.
  if (reducedMotion && !wide) return null;
  return (
    <Suspense fallback={null}>
      <PardalFlight3D reducedMotion={reducedMotion} wide={wide} />
    </Suspense>
  );
}

// Owner decision: 7-day trial. The API (`/billing/plan`) wins when it answers; 7 only while it loads or if it fails.
const useTrialDays = () => usePublicPlan().data?.trialDays ?? 7;

function SessionPlaceholder() {
  return <span role="status" aria-label="Carregando conta" className="inline-block h-9 w-28 animate-pulse rounded-lg bg-muted" />;
}

function LandingNavActions({ mobile = false }: { mobile?: boolean }) {
  const { status } = useSession();
  const trialDays = useTrialDays();
  if (status === 'loading') return <SessionPlaceholder />;
  if (status === 'authenticated') {
    return (
      <Link
        href="/dashboard"
        data-testid={mobile ? 'link-landing-dashboard-mobile' : 'link-landing-dashboard'}
        className={mobile ? 'text-sm font-semibold text-primary' : primaryCta}
      >
        Visão geral
      </Link>
    );
  }
  if (mobile) {
    return (
      <Link href="/login" data-testid="link-landing-login-mobile" className="text-sm font-semibold text-primary">
        Entrar
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <Link href="/login" data-testid="link-landing-login" className={navLink}>
        Entrar
      </Link>
      <Link href="/login" data-testid="link-landing-register" className={primaryCta}>
        Testar {trialDays} dias grátis
      </Link>
    </div>
  );
}

function StartCta({ testId, className }: { testId: string; className?: string }) {
  const { status } = useSession();
  const trialDays = useTrialDays();
  if (status === 'loading') return <SessionPlaceholder />;
  const signedIn = status === 'authenticated';
  return (
    <Link href={signedIn ? '/dashboard' : '/login'} data-testid={testId} className={cn(heroCta, className)}>
      {signedIn ? 'Ir para a visão geral' : `Comece com ${trialDays} dias grátis`} <ArrowRight size={16} aria-hidden />
    </Link>
  );
}

/** Telemetry metrics: live index facts displayed with engineering precision. */
function LiveIndexFacts() {
  const catalog = useTenderSearch({ pageSize: 1, sort: 'published_desc', facets: false });
  const open = useTenderSearch({ pageSize: 1, status: ['open'], facets: false });
  if (!catalog.isSuccess) return null;
  const total = catalog.data.pagination.total;
  const updated = catalog.data.meta.indexUpdatedAt;
  return (
    <dl
      data-testid="landing-live-facts"
      className="mt-12 grid max-w-2xl grid-cols-2 gap-3 border-t border-border pt-7 sm:grid-cols-3 sm:gap-4"
    >
      <div className="rounded-xl border border-border bg-surface p-4">
        <dt className="type-label text-muted-foreground">Índice Nacional</dt>
        <dd className="mt-1.5 type-titulo-3 text-foreground sm:type-titulo-2">
          {formatNumber(total)}
        </dd>
        <p className="mt-1 type-meta text-muted-foreground">editais catalogados</p>
      </div>
      {open.isSuccess && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <dt className="type-label text-muted-foreground">Disputas Abertas</dt>
          <dd className="mt-1.5 type-titulo-3 text-foreground sm:type-titulo-2">
            {formatNumber(open.data.pagination.total)}
          </dd>
          <p className="mt-1 type-meta text-muted-foreground">oportunidades ativas</p>
        </div>
      )}
      {updated && (
        <div className="col-span-2 rounded-xl border border-border bg-surface p-4 sm:col-span-1">
          <dt className="type-label text-muted-foreground">Sincronização PNCP</dt>
          <dd className="mt-1.5 type-data text-xs font-bold leading-5 text-foreground sm:text-sm">
            {formatDateTime(updated)}
          </dd>
          <p className="mt-1 type-meta text-muted-foreground">atualização diária</p>
        </div>
      )}
    </dl>
  );
}

/** Cockpit Radar: real PNCP telemetry, 3D WebGL globe visualization and audit-grade citation card. */
function HeroRadar() {
  const [viewMode, setViewMode] = useState<'tenders' | 'globe'>('tenders');
  const preview = useTenderSearch({ pageSize: 3, status: ['open'], facets: false });
  const tenders = preview.data?.data ?? [];
  // Same query as the map section, so this costs no extra request. The link only exists when the section does.
  const mapAvailable = (useOpenTendersByState().data?.meta.totalOpenTenders ?? 0) > 0;
  return (
    <div className="relative min-w-0">
      {/* Precision telemetry frame */}
      <div aria-hidden className="absolute -inset-3 rounded-2xl border border-border bg-primary-subtle/30 sm:-inset-5" />

      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface">
        {/* Cockpit telemetry header with view toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-open opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-status-open" />
            </span>
            <div className="space-y-0.5">
              <p className="type-label font-bold text-foreground">Cockpit Pardal · Telemetria PNCP</p>
              <p className="type-meta text-muted-foreground">Cobertura nacional contínua · 27 UFs</p>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-pill border border-border bg-surface-sunken p-1">
            <button
              type="button"
              onClick={() => setViewMode('tenders')}
              className={cn(
                'rounded-pill px-3 py-1 text-xs font-semibold transition-colors duration-fast focus-visible:focus-ring',
                viewMode === 'tenders'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Editais ({preview.isSuccess ? tenders.length : '…'})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('globe')}
              className={cn(
                'flex items-center gap-1 rounded-pill px-3 py-1 text-xs font-semibold transition-colors duration-fast focus-visible:focus-ring',
                viewMode === 'globe'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Globe2 size={11} /> Rede 3D
            </button>
          </div>
        </div>

        {/* View Mode: Three.js 3D WebGL Globe Telemetry */}
        {viewMode === 'globe' && (
          <div className="relative flex flex-col items-center justify-center p-6 pb-36 sm:pb-40">
            <div className="relative w-full">
              <Suspense fallback={<div className="h-[290px] w-full sm:h-[330px]" aria-hidden="true" />}>
                <RadarGlobe3D className="h-[290px] w-full sm:h-[330px]" />
              </Suspense>
              <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <span className="size-1.5 rounded-full bg-primary" /> 27 UFs monitoradas
                  {mapAvailable && (
                    <a href={`#${OPPORTUNITY_MAP_ID}`} data-testid="link-globe-map" className="text-primary underline underline-offset-2">
                      ver no mapa
                    </a>
                  )}
                </span>
                <span className="italic">Gire o cursor para interagir em 3D</span>
              </div>
            </div>
          </div>
        )}

        {/* View Mode: Live tenders feed */}
        {viewMode === 'tenders' && (
          <div className="p-5 pb-36 sm:pb-40">
            <div className="mb-4 flex h-9 items-center justify-between rounded-lg border border-border-subtle bg-surface-sunken px-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Search size={14} aria-hidden className="shrink-0 text-primary" />
                <span className="truncate font-medium">Editais abertos mais recentes para propostas</span>
              </div>
              <span className="type-meta hidden shrink-0 font-semibold text-foreground sm:inline">ordenado por prazo</span>
            </div>

            {preview.isPending && (
              <div className="space-y-3 py-6">
                <div className="h-4 w-3/4 animate-pulse rounded-lg bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded-lg bg-muted" />
              </div>
            )}

            {preview.isError && (
              <p role="alert" className="py-4 text-xs text-destructive">
                Não foi possível carregar os editais agora.
              </p>
            )}

            {preview.isSuccess && tenders.length === 0 && (
              <p className="py-4 text-xs text-muted-foreground">Nenhum edital aberto no momento.</p>
            )}

            {tenders.map((t, i) => (
              <div
                key={t.id}
                className={cn(
                  'group relative rounded-xl border border-transparent p-3.5 transition-colors duration-fast hover:border-border hover:bg-surface-sunken',
                  i < tenders.length - 1 && 'border-b border-border-subtle'
                )}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-pill bg-status-open px-2.5 py-0.5 text-xs font-bold text-status-open-foreground">
                      {statusLabels[t.status]}
                    </span>
                    <span className="rounded-lg border border-border bg-surface px-1.5 py-0.5 type-data text-xs font-bold text-muted-foreground">
                      {t.location.state}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-pill bg-primary-subtle px-2.5 py-0.5 text-xs font-semibold text-primary-subtle-foreground">
                    <Target size={10} /> Alta aderência
                  </span>
                </div>
                <div className="line-clamp-2 text-xs font-semibold leading-5 text-foreground group-hover:text-primary">
                  {t.title}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="truncate">{t.organization.name}</span>
                  {t.estimatedValueFlag ? (
                    <ValueDisplay value={t.estimatedValue} flag={t.estimatedValueFlag} flagVariant="icon" className="type-data text-xs" />
                  ) : (
                    <span className="shrink-0 type-data text-xs font-bold text-primary">{formatCurrency(t.estimatedValue)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating high-precision AI Evidence Card (Tesla/SpaceX Telemetry overlay) */}
      <div
        aria-hidden
        className="relative -mt-20 ml-4 max-w-sm rounded-2xl border border-border-strong bg-surface-raised p-4 sm:absolute sm:-bottom-8 sm:-left-8 sm:mt-0 sm:ml-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <FileSearch size={14} className="text-primary" />
            Raio-X de Edital por IA
          </div>
          <span className="rounded-pill bg-primary-subtle px-2.5 py-0.5 text-xs font-bold text-primary-subtle-foreground">
            Página citada
          </span>
        </div>

        <div className="mt-2.5">
          <p className="text-xs font-bold text-foreground">Pergunta: Exige visita técnica presencial obrigatória?</p>
          <div className="mt-2 rounded-xl border-l-2 border-primary bg-surface-sunken p-2.5">
            <p className="text-xs italic leading-relaxed text-muted-foreground">
              «A visita técnica possui caráter facultativo, facultando-se ao licitante a apresentação de declaração formal de pleno conhecimento das condições locais.»
            </p>
            <p className="mt-1.5 font-semibold text-primary text-xs">
              Termo de Referência · Pág. 34, Cláusula 8.1
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border-subtle pt-2 text-xs">
          <span className="inline-flex items-center gap-1 font-semibold text-primary">
            <Check size={12} /> Visita facultativa com declaração
          </span>
          <span className="text-muted-foreground">Fonte oficial auditável</span>
        </div>
      </div>
    </div>
  );
}

function PerformanceComparisonSection() {
  const comparisonItems = [
    {
      metric: 'Tempo de análise por edital',
      traditional: '4 horas por edital',
      pardal: 'Menos de 60 segundos',
      traditionalSub: 'Lendo PDFs pesados e anexos',
      pardalSub: 'Ficha técnica pronta e citada',
    },
    {
      metric: 'Segurança contra pegadinhas',
      traditional: 'Risco de desclassificação',
      pardal: '100% auditável com página',
      traditionalSub: 'Exigências perdidas nas entrelinhas',
      pardalSub: 'Cada regra com trecho e número de página',
    },
    {
      metric: 'Monitoramento de retificações',
      traditional: 'Descoberta tardia na sessão',
      pardal: 'Alerta instantâneo no sino e e-mail',
      traditionalSub: 'Prazos e datas alterados sem aviso',
      pardalSub: 'Vigilância contínua sobre editais salvos',
    },
    {
      metric: 'Capacidade de varredura',
      traditional: 'Busca manual limitada',
      pardal: 'Varredura integral do PNCP',
      traditionalSub: 'Palavras-chave exatas que falham',
      pardalSub: 'Busca semântica inteligente por contexto',
    },
  ];

  return (
    <section aria-labelledby="performance-titulo" className="border-t border-border bg-surface-sunken py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className={eyebrow}>Eficiência e Engenharia</div>
          <h2 id="performance-titulo" className={sectionTitle}>
            Em compras públicas, velocidade com precisão decide contratos.
          </h2>
          <p className="mt-4 type-corpo text-muted-foreground sm:type-corpo-grande">
            O segundo colocado em uma licitação é apenas o primeiro a perder. Veja a diferença mensurável entre o método manual tradicional e o Pardal Digital.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {comparisonItems.map((c) => (
            <div key={c.metric} className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-6">
              <div>
                <p className="type-label text-muted-foreground">{c.metric}</p>
                <div className="mt-4 rounded-xl border border-border/70 bg-surface-sunken p-3.5">
                  <p className="type-meta text-muted-foreground">Método manual</p>
                  <p className="mt-1 text-sm font-semibold text-muted-foreground">{c.traditional}</p>
                  <p className="mt-0.5 type-meta text-muted-foreground">{c.traditionalSub}</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border-strong bg-surface-raised p-3.5">
                <p className="type-meta font-bold text-primary">Com Pardal Digital</p>
                <p className="mt-1 text-base font-bold text-foreground">{c.pardal}</p>
                <p className="mt-0.5 type-meta text-muted-foreground">{c.pardalSub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type BentoFeature = {
  icon: LucideIcon;
  badge?: string;
  title: string;
  desc: string;
  points: string[];
  href?: string;
  cta?: string;
  large?: boolean;
};

const bentoFeatures: BentoFeature[] = [
  {
    icon: Search,
    badge: 'Varredura Semântica',
    title: 'Busca Semântica no PNCP. Entende o seu negócio.',
    desc: 'O PNCP usa termos como “fornecimento de gêneros estocáveis”, “insumos nutricionais” ou “merenda escolar”. O Pardal cruza o sentido técnico do seu nicho de atuação e encontra editais milionários que buscas por palavras-chave exatas deixam passar.',
    points: [
      'Cruzamento semântico que entende sinônimos do setor público',
      'Filtros por Estado, Município, modalidade e faixas de valores',
      'Visualização rápida em lista ou tabela com prazos em destaque',
    ],
    href: '/search',
    cta: 'Explorar busca de editais',
    large: true,
  },
  {
    icon: Target,
    badge: 'Match de Perfil',
    title: 'Algoritmo de Aderência. Foque onde suas chances são reais.',
    desc: 'Cadastre o nicho e os diferenciais da sua empresa. Cada edital recebe uma classificação (Alta, Média ou Fora de Perfil) com a justificativa técnica explicada.',
    points: [
      'Cruza segmento, porte e região de atuação',
      'Descarte o que não combina antes de perder horas lendo',
      'Priorização automática para o seu time comercial',
    ],
  },
  {
    icon: Bell,
    badge: 'Sentinela 24/7',
    title: 'Vigilância Contínua sobre Prazos e Retificações.',
    desc: 'Salve qualquer edital com um clique e receba aviso imediato no sino do app quando houver retificação de prazo, impugnação, alteração de valor ou novos anexos.',
    points: [
      'Alerta imediato para mudanças críticas em andamento',
      'Buscas salvas avisam novos editais publicados no perfil',
      'Histórico completo de alterações e retificações registradas',
    ],
  },
  {
    icon: Mail,
    badge: 'Briefing Matinal',
    title: 'Resumo Diário às 07:00 diretamente no seu E-mail.',
    desc: 'Comece o dia de trabalho sabendo exatamente o que abriu no mercado. Receba um compilado conciso com as melhores oportunidades selecionadas para você.',
    points: [
      'Disparado pontualmente às 07h da manhã',
      'Apenas oportunidades qualificadas e relevantes',
      'Descadastro em 1 clique em qualquer momento',
    ],
  },
];

function ServicesSection() {
  return (
    <section id="servicos" aria-labelledby="servicos-titulo" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-28">
      <div className="max-w-2xl">
        <div className={eyebrow}>Engenharia de Produto</div>
        <h2 id="servicos-titulo" className={sectionTitle}>
          Tudo o que sua equipe precisa para vencer licitações.
        </h2>
        <p className="mt-4 type-corpo text-muted-foreground sm:type-corpo-grande">
          Do edital publicado no PNCP à decisão fundamentada de participar. Ferramentas construídas com foco em clareza, velocidade e segurança jurídica.
        </p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {bentoFeatures.map((f) => {
          const Icon = f.icon;
          return (
            <article
              key={f.title}
              className={cn(
                'flex flex-col justify-between rounded-2xl border border-border bg-surface p-7 sm:p-8 transition-colors duration-fast hover:border-border-strong',
                f.large && 'md:col-span-2 lg:col-span-2 border-border-strong bg-surface-raised'
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary-subtle text-primary">
                    <Icon size={22} aria-hidden />
                  </span>
                  {f.badge && (
                    <span className="rounded-pill border border-border bg-surface-sunken px-3 py-1 text-xs font-semibold text-muted-foreground">
                      {f.badge}
                    </span>
                  )}
                </div>

                <h3 className="mt-6 type-titulo-3 text-foreground">{f.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{f.desc}</p>

                <ul className="mt-6 space-y-2.5 border-t border-border-subtle pt-6 text-xs text-foreground">
                  {f.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2.5">
                      <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {f.href && (
                <Link
                  href={f.href}
                  className="mt-7 inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:underline"
                >
                  {f.cta} <ArrowRight size={13} aria-hidden />
                </Link>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** The signature dark surface: verifiable citations and audit-grade AI. */
function EvidenceSection() {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_MEDIA);
  const pillars = [
    {
      title: 'Visita técnica & Vistoria prévia',
      desc: 'Descubra na hora se a vistoria é obrigatória, facultativa ou substituível por declaração formal de conhecimento do local.',
      tag: 'Eliminatória',
    },
    {
      title: 'Tratamento ME / EPP e LC 123',
      desc: 'Cotas reservadas, itens exclusivos ou ampla concorrência de acordo com a Lei Complementar 123/2006.',
      tag: 'Estratégico',
    },
    {
      title: 'Consórcio & Subcontratação',
      desc: 'Verifique se o edital autoriza consórcio de empresas e quais os limites percentuais admitidos para subcontratação.',
      tag: 'Qualificação',
    },
    {
      title: 'Garantias & Prazos de Vigência',
      desc: 'Exigência de caução, seguro-garantia, prazos de entrega e critérios objetivos de reajuste contratual.',
      tag: 'Financeiro',
    },
  ];

  return (
    <section id="ia" data-pardal-momento aria-labelledby="ia-titulo" className="bg-superficie-inversa py-24 sm:py-32 text-texto-inverso">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-14 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
          <div className="lg:sticky lg:top-12">
            <div className="inline-flex items-center gap-2 rounded-pill border border-texto-inverso/20 bg-texto-inverso/10 px-3.5 py-1 text-xs font-semibold text-texto-inverso">
              <Sparkles size={13} /> Engenharia Anti-Alucinação
            </div>
            <h2 id="ia-titulo" className="mt-4 type-titulo-2 text-texto-inverso lg:type-titulo-1">
              A IA encontra o trecho. Quem valida a regra é você.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-texto-inverso/90 sm:text-base">
              O Pardal Digital não inventa resumos nem deduz exigências. Nossa tecnologia vasculha os PDFs e anexos oficiais, localiza a cláusula exata que responde à sua dúvida e aponta documento e número de página.
            </p>
            <p className="mt-3 max-w-md text-sm leading-7 text-texto-inverso/90 sm:text-base">
              Se o edital não trata do assunto, o sistema afirma categoricamente: <strong className="font-semibold text-texto-inverso">“Não encontrado no edital”</strong>.
            </p>

            <ul className="mt-8 space-y-3.5 border-t border-texto-inverso/20 pt-6 text-sm text-texto-inverso">
              <li className="flex items-center gap-3">
                <FileCheck2 size={17} aria-hidden className="shrink-0 text-texto-inverso" />
                <span>Cada resposta cita documento oficial e página</span>
              </li>
              <li className="flex items-center gap-3">
                <Quote size={17} aria-hidden className="shrink-0 text-texto-inverso" />
                <span>Ausência de exigência nunca vira um falso “não exige”</span>
              </li>
              <li className="flex items-center gap-3">
                <Lock size={17} aria-hidden className="shrink-0 text-texto-inverso" />
                <span>Leitura profunda em PDFs e documentos compactados (.ZIP)</span>
              </li>
            </ul>

            <PardalClip clip="pardal-raio-x" reducedMotion={reducedMotion} className="mt-8 max-w-sm" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {pillars.map((p) => (
              <article
                key={p.title}
                className="flex flex-col justify-between rounded-2xl border border-texto-inverso/20 bg-texto-inverso/10 p-6 sm:p-7 transition-colors duration-fast hover:bg-texto-inverso/15"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-pill border border-texto-inverso/30 px-2.5 py-0.5 text-xs font-bold text-texto-inverso">
                      {p.tag}
                    </span>
                    <FileSearch size={16} className="text-texto-inverso/80" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-texto-inverso">{p.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-texto-inverso/80">{p.desc}</p>
                </div>
                <div className="mt-6 border-t border-texto-inverso/20 pt-3 text-xs font-semibold text-texto-inverso">
                  Auditado com número de página
                </div>
              </article>
            ))}

            <div className="sm:col-span-2 rounded-2xl border border-texto-inverso/25 bg-texto-inverso/5 p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck size={19} aria-hidden className="mt-0.5 shrink-0 text-texto-inverso" />
                <p className="text-xs leading-5 text-texto-inverso/90">
                  <strong>Compromisso de Transparência:</strong> Os trechos são extraídos automaticamente para orientar e acelerar a tomada de decisão. Sempre confira o documento oficial indicado antes de formalizar propostas.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      step: '01',
      title: 'Defina o perfil do seu negócio',
      desc: 'Informe as áreas de atuação da sua empresa, estados de interesse, faixa de valores e porte (ME, EPP ou demais portes).',
      icon: Compass,
    },
    {
      step: '02',
      title: 'Receba editais com ficha técnica pronta',
      desc: 'Acesse diariamente o radar com as oportunidades de maior aderência já pré-qualificadas com as regras críticas citadas.',
      icon: Layers,
    },
    {
      step: '03',
      title: 'Decida e dispute com segurança',
      desc: 'Faça perguntas diretas ao edital, confira as páginas oficiais e elabore propostas vencedoras sem medo de desclassificação.',
      icon: Trophy,
    },
  ];

  return (
    <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="border-b border-border bg-surface py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className={eyebrow}>Fluxo de Trabalho</div>
          <h2 id="como-funciona-titulo" className={sectionTitle}>
            Em 3 passos simples, o controle total das suas oportunidades.
          </h2>
          <p className="mt-4 type-corpo text-muted-foreground sm:type-corpo-grande">
            Sem processos complexos de implantação. Em menos de 2 minutos sua conta está configurada e monitorando o mercado.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((st) => {
            const Icon = st.icon;
            return (
              <div key={st.step} className="relative rounded-2xl border border-border bg-background p-8">
                <div className="flex items-center justify-between">
                  <span className="type-titulo-2 text-primary">{st.step}</span>
                  <span className="grid size-11 place-items-center rounded-xl bg-primary-subtle text-primary">
                    <Icon size={21} />
                  </span>
                </div>
                <h3 className="mt-6 type-titulo-3 text-foreground">{st.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{st.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TransparencySection() {
  const rows = [
    { label: 'Empresa vencedora', value: 'Nome e CNPJ oficial homologado' },
    { label: 'Valor homologado', value: 'Proposta vencedora e desconto ofertado' },
    { label: 'Órgão contratante', value: 'Prefeitura, autarquia ou ministério comprador' },
  ];
  const points = [
    'Histórico de contratos para entender concorrentes do mesmo nicho',
    'Dados exibidos estritamente a partir das publicações oficiais homologadas',
    'Link direto para o termo de homologação e ata de realização',
  ];
  return (
    <section id="transparencia" aria-labelledby="transparencia-titulo" className="border-b border-border bg-surface-sunken py-24 sm:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[.95fr_1.05fr] lg:items-center">
        <div>
          <div className={eyebrow}>Inteligência de Mercado</div>
          <h2 id="transparencia-titulo" className={cn(sectionTitle, 'max-w-xl')}>
            Saiba quem venceu, por quanto e em quais órgãos.
          </h2>
          <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">
            Depois da disputa, o Pardal Digital mapeia o rastro das contratações públicas: quem foi a empresa vencedora, qual o valor homologado e qual o edital de origem. Inteligência de preços para suas próximas propostas.
          </p>
          <ul className="mt-8 space-y-3.5 text-sm">
            {points.map((point) => (
              <li key={point} className="flex gap-2.5">
                <Check size={16} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <Link href="/transparencia" className={cn(secondaryCta, 'mt-8')} data-testid="link-transparency-browse">
            Consultar contratos publicados <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        <div className="relative">
          <div aria-hidden className="absolute -inset-3 rounded-2xl border border-border bg-primary-subtle/30 sm:-inset-5" />
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Trophy size={16} aria-hidden className="text-primary" />
                Inteligência de Concorrência
              </div>
              <span className="type-label text-muted-foreground">dados homologados</span>
            </div>
            <div className="grid gap-4 p-5 sm:p-6">
              <div className="rounded-xl border border-border bg-surface-raised p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="type-label text-muted-foreground">Contrato homologado</p>
                    <h3 className="mt-1.5 max-w-md text-base font-semibold leading-6">Serviços técnicos especializados em TI</h3>
                  </div>
                  <span className="rounded-pill bg-status-open px-2.5 py-1 text-xs font-bold text-status-open-foreground">homologado</span>
                </div>
                <dl className="mt-4 grid gap-2.5">
                  {rows.map((row) => (
                    <div key={row.label} className="grid gap-1 border-t border-border-subtle pt-2.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
                      <dt className="type-label text-muted-foreground">{row.label}</dt>
                      <dd className="text-xs font-semibold text-foreground">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface-raised p-4">
                  <Building2 size={17} aria-hidden className="text-primary" />
                  <p className="mt-2 text-sm font-semibold">Mapa de concorrentes</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Veja quais fornecedores ganham com frequência por região ou categoria.</p>
                </div>
                <div className="rounded-xl border border-border bg-surface-raised p-4">
                  <Landmark size={17} aria-hidden className="text-primary" />
                  <p className="mt-2 text-sm font-semibold">Rastreabilidade total</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Do aviso de publicação ao resultado oficial, sempre com link de origem.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExtrasSection() {
  const items: { icon: LucideIcon; title: string; text: ReactNode }[] = [
    {
      icon: Clapperboard,
      title: 'Chamadas culturais & audiovisual',
      text: 'Editais de fomento audiovisual publicados no Mapas Culturais em seção dedicada, separada das compras públicas comuns.',
    },
    {
      icon: Mail,
      title: 'Comunicação objetiva sem ruído',
      text: 'Um resumo diário no início da manhã e alertas imediatos apenas para eventos críticos (prazos alterados ou suspensões).',
    },
    {
      icon: ShieldCheck,
      title: 'Segurança e soberania dos dados',
      text: 'Autenticação segura via Google OAuth, sessão criptografada e opção de exportar ou excluir seus dados a qualquer momento.',
    },
  ];
  return (
    <section id="instrumento" aria-labelledby="instrumento-titulo" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <div className="max-w-xl">
        <div className={eyebrow}>Mais Diferenciais</div>
        <h2 id="instrumento-titulo" className={cn(sectionTitle, 'max-w-lg')}>
          Construído para quem leva compras públicas a sério.
        </h2>
      </div>
      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-4 rounded-2xl border border-border bg-surface p-6 sm:p-7">
            <Icon size={20} aria-hidden className="mt-0.5 shrink-0 text-primary" />
            <div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const planIncludes = [
  'Varredura diária de todo o PNCP com filtros avançados e busca semântica',
  'Salvar e monitorar ilimitados editais com notificações em tempo real',
  'Ficha do edital instantânea com citação exata de página oficial',
  'Ferramenta “Perguntar ao edital” para tirar dúvidas com o trecho da lei',
  'Cálculo de aderência personalizado ao perfil da sua empresa',
  'Resumo diário por e-mail pontualmente às 07:00 com novos editais',
  'Histórico de empresas vencedoras e transparência de valores homologados',
  'Acesso completo às chamadas de fomento audiovisual (Mapas Culturais)',
];

/** Single plan. The price comes only from `/billing/plan`: none configured (`null`) or a failed request shows no price. */
function PlanSection() {
  const plan = usePublicPlan();
  const trialDays = plan.data?.trialDays ?? 7;
  const price = plan.data?.monthlyBrl ?? null;
  const signedIn = useSession().status === 'authenticated';
  return (
    <section id="plano" data-pardal-momento data-testid="section-plan" aria-labelledby="plano-titulo" className="border-t border-border bg-surface-sunken py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
        <div>
          <div className={eyebrow}>Assinatura Transparente</div>
          <h2 id="plano-titulo" className={cn(sectionTitle, 'max-w-lg')}>
            Um único plano. Acesso completo a todas as ferramentas.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground sm:text-base">
            O teste gratuito começa no seu primeiro acesso com a conta Google e desbloqueia imediatamente todas as funcionalidades do Pardal Digital.
          </p>
          <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground sm:text-base">
            Sem fidelidade contratual e sem taxas ocultas: você pode cancelar a qualquer momento diretamente na aba de Configurações.
          </p>

          <div className="mt-8 space-y-3.5">
            <div className="flex items-center gap-2.5 text-xs font-semibold text-foreground sm:text-sm">
              <CheckCircle2 size={16} className="text-primary" />
              <span>Sem cobrança antecipada no período de teste</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs font-semibold text-foreground sm:text-sm">
              <CheckCircle2 size={16} className="text-primary" />
              <span>Cancele com 1 clique a qualquer momento</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs font-semibold text-foreground sm:text-sm">
              <CheckCircle2 size={16} className="text-primary" />
              <span>Suporte técnico via e-mail e canal direto</span>
            </div>
          </div>
        </div>

        <div className="relative">
          <div aria-hidden className="absolute -inset-3 rounded-2xl border border-border bg-primary-subtle/40 sm:-inset-5" />
          <div className="relative rounded-2xl border border-border-strong bg-surface p-7 sm:p-10">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-6">
              <div>
                <span className="type-label font-bold text-primary">Plano Profissional</span>
                <p className="mt-1 text-sm font-semibold text-foreground">Acesso ilimitado e individual</p>
              </div>
              <span className="rounded-pill bg-action px-3.5 py-1 text-xs font-bold text-action-foreground">
                {trialDays} dias grátis
              </span>
            </div>

            <div className="mt-7">
              {plan.isPending && (
                <span role="status" aria-label="Carregando plano" className="block h-12 w-48 animate-pulse rounded-lg bg-muted" />
              )}
              {price !== null && (
                <div data-testid="text-plan-price" className="flex items-baseline gap-2">
                  <span className="type-titulo-1 text-foreground sm:type-display">
                    {formatCurrencyPrecise(price)}
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">/ mês</span>
                </div>
              )}
              {plan.isError && (
                <p role="alert" className="text-xs text-destructive">
                  Não foi possível carregar o valor da assinatura agora.
                </p>
              )}
              <p className="mt-2 text-sm font-semibold text-foreground">
                {trialDays} dias grátis, sem cartão de crédito para começar.
              </p>
            </div>

            <ul className="mt-8 space-y-3.5 border-t border-border-subtle pt-6 text-xs sm:text-sm">
              {planIncludes.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check size={16} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                  <span className="leading-5 text-foreground">{item}</span>
                </li>
              ))}
            </ul>

            <Link href={signedIn ? BILLING_HREF : '/login'} data-testid="link-plan-start" className={cn(heroCta, 'mt-8 w-full justify-center')}>
              {signedIn ? 'Ver minha assinatura' : `Comece com ${trialDays} dias grátis`} <ArrowRight size={16} aria-hidden />
            </Link>

            <p className="mt-4 text-center type-meta text-muted-foreground">
              O teste vale uma vez por conta Google. Renovação mensal sem carência.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const faqs = [
  {
    q: 'De onde vêm os editais e com qual frequência são atualizados?',
    a: 'Todos os editais são coletados diretamente do PNCP (Portal Nacional de Contratações Públicas). A sincronização ocorre diariamente na madrugada e monitora editais abertos continuamente para capturar retificações, novos anexos e alterações de prazos.',
  },
  {
    q: 'Como a IA do Pardal Digital garante que não há alucinação nas regras?',
    a: 'Nossa inteligência artificial não gera respostas livres. Ela extrai os trechos literais dos documentos oficiais do edital e aponta expressamente o documento e o número da página de onde a informação saiu. Quando um edital não trata do assunto, o sistema classifica como “Não encontrado no edital”.',
  },
  {
    q: 'Preciso cadastrar cartão de crédito para iniciar o período de teste?',
    a: 'Não. Você não precisa fornecer nenhum dado de cartão ou pagamento para começar o teste. Basta fazer login com a sua conta Google corporativa ou pessoal e todo o sistema é liberado imediatamente pelos dias de teste informados.',
  },
  {
    q: 'O Pardal Digital atende a editais de todo o Brasil?',
    a: 'Sim. Coletamos compras públicas de órgãos federais, estaduais e municipais de todos os 26 estados e do Distrito Federal que publicam no PNCP, abrangendo modalidades como Pregão Eletrônico, Concorrência, Dispensa de Licitação e Chamamento Público.',
  },
  {
    q: 'Como funciona o cancelamento da assinatura?',
    a: 'O cancelamento é 100% digital e sem burocracia. Você pode cancelar a qualquer momento nas Configurações da sua conta, sem cobrança de multa ou aviso prévio. Ao cancelar, você mantém o acesso até o final do período já pago.',
  },
  {
    q: 'Como funcionam os alertas diários por e-mail?',
    a: 'Todos os dias, pontualmente às 07:00 da manhã, enviamos um resumo conciso com os editais abertos recentemente que combinam com o perfil cadastrado da sua empresa. Editais com alterações críticas de prazo em andamento disparam avisos imediatos.',
  },
];

function FaqSection() {
  return (
    <section id="duvidas" aria-labelledby="duvidas-titulo" className="mx-auto max-w-4xl px-5 py-24 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-2xl text-center">
        <div className={eyebrow}>Dúvidas Frequentes</div>
        <h2 id="duvidas-titulo" className={sectionTitle}>
          Tudo o que você precisa saber antes de começar.
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          Transparência em cada detalhe do nosso serviço e da nossa tecnologia.
        </p>
      </div>

      <div className="mt-14 rounded-2xl border border-border bg-surface p-6 sm:p-9">
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, idx) => (
            <AccordionItem key={faq.q} value={`item-${idx}`} className={cn('border-border-subtle', idx === faqs.length - 1 && 'border-0')}>
              <AccordionTrigger className="text-left text-sm font-semibold text-foreground hover:no-underline hover:text-primary sm:text-base">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-xs sm:text-sm leading-6 text-muted-foreground">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function FinalCta() {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_MEDIA);
  return (
    <section aria-labelledby="cta-titulo" className="px-5 pb-24 sm:px-8 sm:pb-28">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 rounded-2xl bg-superficie-inversa px-8 py-16 sm:px-14 lg:flex-row lg:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-texto-inverso/20 bg-texto-inverso/10 px-3.5 py-1 text-xs font-semibold text-texto-inverso">
            <Sparkles size={13} /> Oportunidades abertas agora
          </span>
          <h2 id="cta-titulo" className="mt-4 max-w-xl type-titulo-2 text-texto-inverso lg:type-titulo-1">
            O próximo grande contrato da sua empresa já pode estar publicado.
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-texto-inverso/90 sm:text-base">
            Cadastre-se com o Google em menos de 1 minuto, explore os editais em aberto e teste todos os recursos sem custo inicial.
          </p>
        </div>
        <div className="flex w-full flex-col items-start gap-6 sm:w-auto lg:items-center">
          <PardalClip clip="pardal-assinatura" reducedMotion={reducedMotion} className="w-40 sm:w-48" />
          <StartCta testId="link-final-start" className="w-full justify-center sm:w-auto" />
        </div>
      </div>
    </section>
  );
}

// Marketing page. Hero sizes sit above the product type scale on purpose; every color is a design system token.
export default function LandingPage() {
  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground">
      <PardalFlight />
      <header className="sticky top-0 z-sticky border-b border-border-subtle bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" data-testid="link-logo" className="flex items-center gap-2.5">
            <BrandLogo className="h-11 sm:h-12" />
          </Link>
          <nav aria-label="Seções" className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#servicos" className="transition-colors duration-fast hover:text-foreground">
              Recursos
            </a>
            <a href="#ia" className="transition-colors duration-fast hover:text-foreground">
              IA com fonte
            </a>
            <a href="#como-funciona" className="transition-colors duration-fast hover:text-foreground">
              Como funciona
            </a>
            <a href="#transparencia" className="transition-colors duration-fast hover:text-foreground">
              Transparência
            </a>
            <a href="#plano" className="transition-colors duration-fast hover:text-foreground">
              Plano
            </a>
            <a href="#duvidas" className="transition-colors duration-fast hover:text-foreground">
              Dúvidas
            </a>
            <LandingNavActions />
          </nav>
          <div className="md:hidden">
            <LandingNavActions mobile />
          </div>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1} className="outline-none">
        {/* Hero Section: Apple/SpaceX style monumental typography & live telemetry */}
        <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:pb-36 lg:pt-20">
          <div className="min-w-0">
            {/* Live radar badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-primary">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-open opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-status-open" />
              </span>
              <span>Telemetria PNCP ao vivo · Todas as 27 Unidades da Federação</span>
            </div>

            {/* Main Headline (Apple/Nike Style) */}
            <h1 className="max-w-2xl type-titulo-1 lg:type-display">
              <span className="block text-hero-lead">Decida em minutos.</span>
              <span className="block text-hero-highlight">Dispute para vencer.</span>
            </h1>

            {/* Subheadline with high commercial appeal */}
            <p className="mt-6 max-w-xl type-corpo text-muted-foreground sm:type-corpo-grande">
              A plataforma de inteligência que analisa editais do PNCP em tempo real, calcula a aderência exata da sua empresa e cita a página oficial de cada exigência. Sem respostas inventadas.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <StartCta testId="link-hero-start" />
              <Link href="/search" data-testid="link-hero-demo" className={secondaryCta}>
                <Search size={16} aria-hidden /> Ver os editais abertos
              </Link>
            </div>

            {/* Immediate trust pillars */}
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-primary" /> Sem cartão para começar
              </span>
              <span className="flex items-center gap-1.5">
                <FileSearch size={14} className="text-primary" /> Citação oficial com página
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-primary" /> Cancele quando quiser
              </span>
            </div>

            {/* Live numbers */}
            <LiveIndexFacts />
          </div>

          <HeroRadar />
        </section>

        <OpportunityMapSection />
        <PerformanceComparisonSection />
        <ServicesSection />
        <EvidenceSection />
        <HowItWorksSection />
        <TransparencySection />
        <ExtrasSection />
        <PlanSection />
        <FaqSection />
        <FinalCta />
      </main>

      <footer className="border-t border-border bg-surface px-5 py-12 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Pardal Digital · Inteligência para Compras Públicas</p>
            <p>© 2026 Pardal Digital · Dados oficiais extraídos do PNCP e do Mapas Culturais.</p>
            <p className="text-muted-foreground">Feito para equipes que leem antes de agir e decidem para vencer.</p>
          </div>
          <LegalLinks className="sm:justify-end" />
        </div>
      </footer>
    </div>
  );
}
