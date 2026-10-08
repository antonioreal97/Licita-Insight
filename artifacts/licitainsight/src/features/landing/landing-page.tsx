import type { ReactNode } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight,
  Bell,
  Building2,
  Check,
  ClipboardList,
  Clapperboard,
  FileSearch,
  Landmark,
  Mail,
  Quote,
  Search,
  ShieldCheck,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand-icon';
import { useSession } from '@/features/auth/hooks/use-session';
import { usePublicPlan } from '@/features/billing/hooks/use-public-plan';
import { BILLING_HREF } from '@/features/billing/lib/trial';
import { useTenderSearch } from '@/features/search/hooks/use-tender-search';
import { formatCurrency, formatCurrencyPrecise, formatDateTime, formatNumber } from '@/lib/format';
import { statusLabels } from '@/lib/tender-labels';
import { cn } from '@/lib/utils';

const navLink = 'font-semibold text-primary hover:underline';
const primaryCta = 'rounded-pill bg-action px-4 py-2.5 font-semibold text-action-foreground shadow-xs transition-colors duration-fast hover:bg-action-hover';
const heroCta =
  'inline-flex items-center gap-2 rounded-pill bg-action px-5 py-3 text-sm font-semibold text-action-foreground shadow-xs transition-colors duration-fast hover:bg-action-hover focus-visible:focus-ring';
const secondaryCta =
  'inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-5 py-3 text-sm font-semibold text-foreground shadow-2xs transition-colors duration-fast hover:border-border-strong hover:bg-surface-sunken focus-visible:focus-ring';
const eyebrow = 'type-eyebrow font-bold text-primary';
const sectionTitle = 'mt-4 text-4xl font-semibold leading-[1.05] tracking-display sm:text-[44px]';

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
    <>
      <Link href="/login" data-testid="link-landing-login" className={navLink}>
        Entrar
      </Link>
      <Link href="/login" data-testid="link-landing-register" className={primaryCta}>
        Testar {trialDays} dias grátis
      </Link>
    </>
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

/** Real numbers only: size of the index and when it was last refreshed. Nothing renders until the API answers. */
function LiveIndexFacts() {
  const catalog = useTenderSearch({ pageSize: 1, sort: 'published_desc', facets: false });
  const open = useTenderSearch({ pageSize: 1, status: ['open'], facets: false });
  if (!catalog.isSuccess) return null;
  const total = catalog.data.pagination.total;
  const updated = catalog.data.meta.indexUpdatedAt;
  return (
    <dl data-testid="landing-live-facts" className="mt-10 grid max-w-lg grid-cols-2 gap-x-8 gap-y-4 border-t border-border pt-6 sm:grid-cols-3">
      <div>
        <dt className="type-label text-muted-foreground">Editais disponíveis</dt>
        <dd className="mt-1 type-data text-xl font-bold text-foreground">{formatNumber(total)}</dd>
      </div>
      {open.isSuccess && (
        <div>
          <dt className="type-label text-muted-foreground">Em aberto agora</dt>
          <dd className="mt-1 type-data text-xl font-bold text-foreground">{formatNumber(open.data.pagination.total)}</dd>
        </div>
      )}
      {updated && (
        <div className="col-span-2 sm:col-span-1">
          <dt className="type-label text-muted-foreground">Atualizado em</dt>
          <dd className="mt-1 type-data text-sm font-bold text-foreground">{formatDateTime(updated)}</dd>
        </div>
      )}
    </dl>
  );
}

/** Hero visual: the real list of open tenders, plus a labelled sketch of an evidence card (no invented passage text). */
function HeroRadar() {
  const preview = useTenderSearch({ pageSize: 3, status: ['open'], facets: false });
  const tenders = preview.data?.data ?? [];
  return (
    <div className="relative min-w-0">
      <div aria-hidden className="absolute -inset-3 rounded-[30px] bg-primary-subtle/70 sm:-inset-6" />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold">Seu radar</div>
          <span className="type-label text-muted-foreground">dados do PNCP, ao vivo</span>
        </div>
        {/* Bottom padding on ≥sm leaves room for the evidence card so it never covers a tender. */}
        <div className="p-5 sm:pb-24">
          {/* Caption states exactly what the list below is: the query has no search term. */}
          <div className="mb-4 flex h-9 items-center gap-2 rounded-md bg-surface-sunken px-3 text-xs text-muted-foreground">
            <Search size={14} aria-hidden className="shrink-0" />
            Editais abertos mais recentes
          </div>
          {preview.isPending && <p className="py-4 text-xs text-muted-foreground">Carregando editais…</p>}
          {preview.isError && (
            <p role="alert" className="py-4 text-xs text-destructive">
              Não foi possível carregar os editais agora.
            </p>
          )}
          {preview.isSuccess && tenders.length === 0 && <p className="py-4 text-xs text-muted-foreground">Nenhum edital aberto no momento.</p>}
          {tenders.map((t, i) => (
            <div key={t.id} className={cn('border-b border-border-subtle py-4', i === tenders.length - 1 && 'border-0 pb-1')}>
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full bg-status-open px-2 py-0.5 text-3xs font-bold text-status-open-foreground">{statusLabels[t.status]}</span>
                <span className="type-data text-3xs text-muted-foreground">{t.location.state}</span>
              </div>
              <div className="line-clamp-2 text-xs font-semibold leading-5 text-foreground">{t.title}</div>
              <div className="mt-2 flex justify-between gap-3 text-3xs text-muted-foreground">
                <span className="truncate">{t.organization.name}</span>
                <span className="shrink-0 type-data font-bold text-primary">{formatCurrency(t.estimatedValue)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Illustration of the evidence card. Skeleton lines stand in for the passage: no fabricated edital text. */}
      <div
        aria-hidden
        className="relative -mt-6 ml-6 max-w-[19rem] rounded-xl border border-border bg-surface-raised p-4 shadow-lg sm:absolute sm:-bottom-8 sm:-left-8 sm:mt-0 sm:ml-0"
      >
        <div className="flex items-center gap-2 text-2xs font-semibold text-foreground">
          <FileSearch size={14} className="text-primary" />
          Exige visita técnica?
        </div>
        <div className="mt-3 space-y-1.5 border-l-2 border-primary/50 pl-3">
          <div className="h-1.5 w-full rounded-full bg-muted" />
          <div className="h-1.5 w-11/12 rounded-full bg-muted" />
          <div className="h-1.5 w-2/3 rounded-full bg-primary/25" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-3xs">
          <span className="font-semibold text-primary">Edital · página citada</span>
          <span className="text-muted-foreground">trecho oficial</span>
        </div>
      </div>
    </div>
  );
}

type Service = { icon: LucideIcon; title: string; text: string; points: string[]; href?: string; cta?: string };

const services: Service[] = [
  {
    icon: Search,
    title: 'Busca no PNCP',
    text: 'Todos os editais publicados no Portal Nacional, coletados todo dia e organizados para ler rápido.',
    points: ['Filtros por UF, modalidade, valor e prazo', 'Busca pelo sentido, não só pela palavra', 'Tabela ou lista, com o prazo em destaque'],
    href: '/search',
    cta: 'Explorar editais',
  },
  {
    icon: Bell,
    title: 'Monitoramento e alertas',
    text: 'Salve um edital e saiba quando o prazo, o status, o valor ou os documentos mudarem.',
    points: ['Buscas salvas avisam editais novos', 'Aviso no sino, dentro do app', 'Resumo por e-mail às 07:00 e aviso imediato para o que é crítico'],
  },
  {
    icon: Target,
    title: 'Aderência à sua empresa',
    text: 'Conte o que vocês fornecem e onde atuam. Cada edital recebe um selo de aderência, com o motivo.',
    points: ['Alta, média ou fora do seu perfil', 'Área, faixa de valor e porte levados em conta', 'Alerta diário com os editais que mais combinam'],
  },
];

const aiServices: Service[] = [
  {
    icon: ClipboardList,
    title: 'Ficha do edital',
    text: 'Consórcio, subcontratação, ME/EPP, visita técnica, garantias, habilitação, vigência e reajuste, cada item com a página de onde saiu.',
    points: ['O que não está no edital fica como “não encontrado”', 'Nunca um “não exige” adivinhado'],
  },
  {
    icon: FileSearch,
    title: 'Perguntar ao edital',
    text: 'Pergunte em português, como perguntaria a um colega. A resposta é o trecho oficial que responde, com documento e página.',
    points: ['Lê os PDFs, inclusive os que vêm dentro de ZIP', 'Sem trecho que responda, a resposta é “não encontrei”'],
  },
];

function ServiceCard({ service, className }: { service: Service; className?: string }) {
  const Icon = service.icon;
  return (
    <article className={cn('flex flex-col rounded-2xl border border-border bg-surface p-6 sm:p-7', className)}>
      <span className="grid size-10 place-items-center rounded-xl bg-primary-subtle text-primary-subtle-foreground">
        <Icon size={19} aria-hidden />
      </span>
      <h3 className="mt-6 text-lg font-semibold tracking-heading">{service.title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{service.text}</p>
      <ul className="mt-5 grid gap-2.5 text-sm">
        {service.points.map((point) => (
          <li key={point} className="flex gap-2.5">
            <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-primary" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      {service.href && (
        <Link href={service.href} className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-primary hover:underline">
          {service.cta} <ArrowRight size={14} aria-hidden />
        </Link>
      )}
    </article>
  );
}

function ServicesSection() {
  return (
    <section id="servicos" aria-labelledby="servicos-titulo" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <div className="max-w-2xl">
        <div className={eyebrow}>O que você faz com Pardal Digital</div>
        <h2 id="servicos-titulo" className={sectionTitle}>
          Do edital publicado à decisão de participar.
        </h2>
        <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground">
          Encontrar, filtrar o que combina com a sua empresa, entender as regras e não perder uma mudança. Tudo em um lugar, com a fonte oficial sempre a um
          clique.
        </p>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {services.map((service) => (
          <ServiceCard key={service.title} service={service} />
        ))}
      </div>
    </section>
  );
}

/** The AI band: dark "instrument" surface, the product's signature. Copy states what the model does and does not do. */
function EvidenceSection() {
  return (
    <section id="ia" aria-labelledby="ia-titulo" className="bg-superficie-inversa py-24 text-texto-inverso">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
          <div className="lg:sticky lg:top-10">
            <div className="type-eyebrow font-bold text-texto-inverso">IA que mostra a fonte</div>
            <h2 id="ia-titulo" className="mt-4 text-4xl font-semibold leading-[1.05] tracking-display text-texto-inverso sm:text-[44px]">
              A IA escolhe o trecho. Quem lê a regra é você.
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-7 text-texto-inverso">
              O Pardal Digital não escreve resumos por conta própria. A inteligência artificial procura, nos documentos oficiais, o trecho que responde, e
              mostra a página. Se o edital não diz, o Pardal Digital também não diz.
            </p>
            <ul className="mt-8 grid gap-3 text-sm text-texto-inverso">
              {['Cada resposta aponta documento e página', 'Ausência de trecho nunca vira um “não”', 'A confiança aparece de forma honesta'].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Quote size={15} aria-hidden className="mt-0.5 shrink-0 text-texto-inverso" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {aiServices.map((service) => {
              const Icon = service.icon;
              return (
                <article key={service.title} className="flex flex-col rounded-2xl border border-texto-inverso/25 bg-texto-inverso/10 p-6 sm:p-7">
                  <Icon size={20} aria-hidden className="text-texto-inverso" />
                  <h3 className="mt-6 text-lg font-semibold text-texto-inverso">{service.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-texto-inverso">{service.text}</p>
                  <ul className="mt-5 grid gap-2.5 border-t border-texto-inverso/25 pt-5 text-sm">
                    {service.points.map((point) => (
                      <li key={point} className="flex gap-2.5">
                        <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-texto-inverso" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
            <p className="flex gap-2.5 rounded-2xl border border-texto-inverso/25 p-5 text-xs leading-5 text-texto-inverso sm:col-span-2">
              <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-texto-inverso" />
              Os trechos são escolhidos automaticamente e orientam a leitura, não substituem o edital. Confira sempre o documento original antes de decidir.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TransparencySection() {
  const rows = [
    { label: 'Empresa vencedora', value: 'nome publicado pela fonte oficial' },
    { label: 'Valor homologado', value: 'proposta vencedora, quando disponível' },
    { label: 'Órgão comprador', value: 'quem contratou e em qual modalidade' },
  ];
  const points = [
    'Histórico para entender quem ganhou contratos parecidos',
    'Empresa, CNPJ, órgão e valor aparecem só quando a fonte publica',
    'Link de volta para o resultado oficial, sem dado solto do contexto',
  ];
  return (
    <section id="transparencia" aria-labelledby="transparencia-titulo" className="border-b border-border bg-surface py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[.95fr_1.05fr] lg:items-center">
        <div>
          <div className={eyebrow}>Transparência</div>
          <h2 id="transparencia-titulo" className={cn(sectionTitle, 'max-w-xl')}>
            Veja quais empresas venceram os editais.
          </h2>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-muted-foreground">
            Depois da disputa, o Pardal Digital também quer mostrar o caminho do dinheiro público: quem venceu, por quanto, em qual órgão e com qual edital de
            origem. Resultado publicado vira histórico para consulta, comparação e prospecção.
          </p>
          <ul className="mt-8 grid gap-3 text-sm">
            {points.map((point) => (
              <li key={point} className="flex gap-2.5">
                <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <Link href="/transparencia" className={cn(secondaryCta, 'mt-7')} data-testid="link-transparency-browse">
            Consultar contratos publicados <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        <div className="relative">
          <div aria-hidden className="absolute -inset-3 rounded-[28px] bg-primary-subtle/60" />
          <div className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <Trophy size={16} aria-hidden className="text-primary" />
                Empresas vencedoras
              </div>
              <span className="type-label text-muted-foreground">resultado oficial</span>
            </div>
            <div className="grid gap-4 p-5 sm:p-6">
              <div className="rounded-xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="type-label text-muted-foreground">Contrato identificado</p>
                    <h3 className="mt-2 max-w-md text-base font-semibold leading-6">Serviços compatíveis com o edital pesquisado</h3>
                  </div>
                  <span className="rounded-full bg-status-open px-2.5 py-1 text-3xs font-bold text-status-open-foreground">homologado</span>
                </div>
                <dl className="mt-5 grid gap-3">
                  {rows.map((row) => (
                    <div key={row.label} className="grid gap-1 border-t border-border-subtle pt-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
                      <dt className="type-label text-muted-foreground">{row.label}</dt>
                      <dd className="text-sm font-semibold text-foreground">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-surface p-4">
                  <Building2 size={17} aria-hidden className="text-primary" />
                  <p className="mt-3 text-sm font-semibold">Mapa de fornecedores</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Veja quem aparece com frequência por cidade, órgão ou categoria.</p>
                </div>
                <div className="rounded-xl border border-border bg-surface p-4">
                  <Landmark size={17} aria-hidden className="text-primary" />
                  <p className="mt-3 text-sm font-semibold">Rastro do edital</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Do aviso de contratação ao resultado, sempre com referência à fonte.</p>
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
      title: 'Chamadas culturais',
      text: 'Editais de fomento ao audiovisual publicados no Mapas Culturais, em uma lista separada das compras públicas.',
    },
    {
      icon: Mail,
      title: 'E-mail só quando vale',
      text: 'Um resumo por dia e aviso imediato para prazo alterado ou edital suspenso. Descadastro em um clique.',
    },
    {
      icon: ShieldCheck,
      title: 'Seus dados, suas regras',
      text: 'Entrada com a conta Google, sessão protegida, e seus dados para baixar ou excluir em Configurações.',
    },
  ];
  return (
    <section id="instrumento" aria-labelledby="instrumento-titulo" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
      <h2 id="instrumento-titulo" className={cn(sectionTitle, 'max-w-lg')}>
        Também no Pardal Digital
      </h2>
      <ul className="mt-8 grid gap-3 md:grid-cols-3">
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-4 rounded-2xl border border-border bg-surface p-5">
            <Icon size={19} aria-hidden className="mt-0.5 shrink-0 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const planIncludes = [
  'Busca de editais do PNCP com filtros',
  'Salvar e monitorar editais',
  'Buscas salvas com alertas no app e por e-mail',
  'Ficha do edital e Perguntar ao edital, com a página citada',
  'Aderência ao perfil da empresa e alerta diário',
  'Chamadas culturais de fomento ao audiovisual',
];

/** Single plan. The price comes only from `/billing/plan`: none configured (`null`) or a failed request shows no price. */
function PlanSection() {
  const plan = usePublicPlan();
  const trialDays = plan.data?.trialDays ?? 7;
  const price = plan.data?.monthlyBrl ?? null;
  const signedIn = useSession().status === 'authenticated';
  return (
    <section id="plano" data-testid="section-plan" aria-labelledby="plano-titulo" className="border-t border-border bg-surface py-24">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[.95fr_1.05fr] lg:items-center">
        <div>
          <div className={eyebrow}>Plano</div>
          <h2 id="plano-titulo" className={cn(sectionTitle, 'max-w-lg')}>
            Um plano. Acesso completo.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">
            O teste começa quando você entra com o Google pela primeira vez e libera tudo o que o Pardal Digital oferece. Depois, a assinatura é mensal e pode
            ser cancelada em Configurações.
          </p>
        </div>
        <div className="relative">
          <div aria-hidden className="absolute -inset-3 rounded-[28px] bg-primary-subtle/60" />
          <div className="relative rounded-2xl border border-border bg-surface p-6 shadow-lg sm:p-8">
            {plan.isPending && <span role="status" aria-label="Carregando plano" className="block h-10 w-44 animate-pulse rounded-md bg-muted" />}
            {price !== null && (
              <p data-testid="text-plan-price" className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight tabular-nums">{formatCurrencyPrecise(price)}</span>{' '}
                <span className="text-sm text-muted-foreground">por mês</span>
              </p>
            )}
            {plan.isError && (
              <p role="alert" className="text-xs text-destructive">
                Não foi possível carregar o valor da assinatura agora.
              </p>
            )}
            <p className="mt-3 text-lg font-semibold">{trialDays} dias grátis, sem cartão para começar.</p>
            <ul className="mt-6 grid gap-3 border-t border-border-subtle pt-6 text-sm">
              {planIncludes.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check size={15} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
            <Link href={signedIn ? BILLING_HREF : '/login'} data-testid="link-plan-start" className={cn(heroCta, 'mt-8')}>
              {signedIn ? 'Ver minha assinatura' : `Comece com ${trialDays} dias grátis`} <ArrowRight size={16} aria-hidden />
            </Link>
            <p className="mt-3 type-meta text-muted-foreground">O teste vale uma vez por conta Google.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const faqs: [string, string][] = [
  [
    'De onde vêm os editais?',
    'Do PNCP, o Portal Nacional de Contratações Públicas. A coleta roda todo dia e revisita os editais em aberto para pegar retificações.',
  ],
  [
    'A IA pode inventar uma regra do edital?',
    'Não mostramos texto gerado. A ficha e as respostas são trechos oficiais com a página; quando o edital não trata do assunto, o campo fica como “não encontrado”.',
  ],
  ['Preciso de cartão para testar?', 'Não. Basta entrar com a conta Google. O teste libera todos os recursos pelo período informado acima.'],
  ['Como paro de receber e-mails?', 'Em Configurações, ou pelo link de descadastro no rodapé de qualquer e-mail. Os avisos no sino continuam.'],
];

function FaqSection() {
  return (
    <section id="duvidas" aria-labelledby="duvidas-titulo" className="mx-auto max-w-3xl px-5 py-24 sm:px-8">
      <div className={eyebrow}>Dúvidas</div>
      <h2 id="duvidas-titulo" className={sectionTitle}>
        Antes de começar
      </h2>
      <div className="mt-10 divide-y divide-border border-y border-border">
        {faqs.map(([question, answer]) => (
          <details key={question} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm text-[15px] font-semibold focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
              {question}
              <span aria-hidden className="text-xl leading-none text-muted-foreground transition-transform duration-fast group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section aria-labelledby="cta-titulo" className="px-5 pb-24 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 rounded-3xl bg-superficie-inversa px-7 py-12 sm:px-12 lg:flex-row lg:items-center">
        <div>
          <h2 id="cta-titulo" className="max-w-xl text-3xl font-semibold leading-tight tracking-display text-texto-inverso sm:text-4xl">
            O próximo edital da sua empresa já pode estar publicado.
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-texto-inverso">Entre com o Google e veja o que combina com vocês ainda hoje.</p>
        </div>
        <StartCta testId="link-final-start" />
      </div>
    </section>
  );
}

// Marketing page. Hero sizes (48/72px) sit above the product type scale on purpose; every color is a token.
export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-sticky border-b border-transparent bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" data-testid="link-logo" className="flex items-center gap-2.5">
            <BrandLogo className="h-12" />
          </Link>
          <nav aria-label="Seções" className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#servicos" className="transition-colors duration-fast hover:text-foreground">
              Recursos
            </a>
            <a href="#ia" className="transition-colors duration-fast hover:text-foreground">
              IA com fonte
            </a>
            <a href="#transparencia" className="transition-colors duration-fast hover:text-foreground">
              Transparência
            </a>
            <a href="#plano" className="transition-colors duration-fast hover:text-foreground">
              Plano
            </a>
            <LandingNavActions />
          </nav>
          <div className="md:hidden">
            <LandingNavActions mobile />
          </div>
        </div>
      </header>
      <main id="conteudo" tabIndex={-1} className="outline-none">
        <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-5 pb-24 pt-12 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:pb-36 lg:pt-20">
          <div className="min-w-0">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary-subtle px-3 py-1.5 type-eyebrow font-bold text-primary-subtle-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Inteligência para compras públicas
            </div>
            <h1 className="max-w-2xl text-[42px] font-semibold leading-[1.03] tracking-display sm:text-[52px] xl:text-[56px]">
              <span className="block text-hero-lead">Encontre o edital</span> <span className="block text-hero-highlight">antes do prazo</span>
            </h1>
            <p className="mt-7 max-w-lg text-[17px] leading-8 text-muted-foreground">
              Busca em todo o PNCP, aderência ao perfil da sua empresa, ficha do edital com a página de cada regra e alertas quando algo muda.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <StartCta testId="link-hero-start" />
              <Link href="/search" data-testid="link-hero-demo" className={secondaryCta}>
                Ver os editais abertos
              </Link>
            </div>
            <LiveIndexFacts />
          </div>
          <HeroRadar />
        </section>
        <ServicesSection />
        <EvidenceSection />
        <TransparencySection />
        <ExtrasSection />
        <PlanSection />
        <FaqSection />
        <FinalCta />
      </main>
      <footer className="border-t border-border px-5 py-7 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <span>© 2026 Pardal Digital · publicações do PNCP e do Mapas Culturais</span>
          <span>Feito para equipes que leem antes de agir.</span>
        </div>
      </footer>
    </div>
  );
}
