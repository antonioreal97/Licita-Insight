import { Link } from 'wouter';
import { ArrowRight, Check, Clock3, Search, Target } from 'lucide-react';
import { useSession } from '@/features/auth/hooks/use-session';
import { usePublicPlan } from '@/features/billing/hooks/use-public-plan';
import { BILLING_HREF } from '@/features/billing/lib/trial';
import { useTenderSearch } from '@/features/search/hooks/use-tender-search';
import { formatCurrency, formatCurrencyPrecise } from '@/lib/format';
import { statusLabels } from '@/lib/tender-labels';

const navLink = 'font-semibold text-primary hover:underline';
const primaryCta = 'rounded-lg bg-inverse px-4 py-2.5 font-semibold text-inverse-foreground shadow-xs transition-colors duration-fast hover:bg-inverse-hover';
const heroCta =
  'inline-flex items-center gap-2 rounded-lg bg-inverse px-5 py-3 text-sm font-semibold text-inverse-foreground shadow-xs transition-colors duration-fast hover:bg-inverse-hover';

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

function LandingHeroStart() {
  const { status } = useSession();
  const trialDays = useTrialDays();
  if (status === 'loading') return <SessionPlaceholder />;
  const signedIn = status === 'authenticated';
  return (
    <Link href={signedIn ? '/dashboard' : '/login'} data-testid="link-hero-start" className={heroCta}>
      {signedIn ? 'Ir para a visão geral' : `Comece com ${trialDays} dias grátis`} <ArrowRight size={16} />
    </Link>
  );
}

const planIncludes = [
  'Busca de editais do PNCP com filtros',
  'Salvar e monitorar editais',
  'Buscas salvas com alertas no app',
  'Oportunidades de fomento cultural',
];

/** Single plan. The price comes only from `/billing/plan`: none configured (`null`) or a failed request shows no price. */
function PlanSection() {
  const plan = usePublicPlan();
  const trialDays = plan.data?.trialDays ?? 7;
  const price = plan.data?.monthlyBrl ?? null;
  const signedIn = useSession().status === 'authenticated';
  return (
    <section id="plano" data-testid="section-plan" aria-labelledby="plano-titulo" className="border-t border-border py-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[.95fr_1.05fr] lg:items-center">
        <div>
          <div className="type-eyebrow font-bold text-primary">Plano</div>
          <h2 id="plano-titulo" className="mt-4 max-w-lg text-4xl font-semibold leading-[1.05] tracking-display">
            Um plano. Acesso completo.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">
            O teste começa quando você entra com o Google pela primeira vez e libera tudo o que o LicitAI faz. Depois, a assinatura é mensal.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
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
              <li key={item} className="flex items-center gap-2.5">
                <Check size={15} aria-hidden className="shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
          <Link href={signedIn ? BILLING_HREF : '/login'} data-testid="link-plan-start" className={`${heroCta} mt-8`}>
            {signedIn ? 'Ver minha assinatura' : `Comece com ${trialDays} dias grátis`} <ArrowRight size={16} />
          </Link>
          <p className="mt-3 type-meta text-muted-foreground">O teste vale uma vez por conta Google.</p>
        </div>
      </div>
    </section>
  );
}

// Marketing page. Hero sizes (48/72px) sit above the product type scale on purpose; every color is a token.
export default function LandingPage() {
  const preview = useTenderSearch({ pageSize: 3, status: ['open'], facets: false });
  const previewTenders = preview.data?.data ?? [];
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" data-testid="link-logo" className="flex items-center gap-2.5">
          <img src="/LicitAI_logo.png" alt="" width={36} height={36} className="h-9 w-9" />
          <span className="font-semibold tracking-heading">
            Licit<span className="text-primary">AI</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#como-funciona" className="transition-colors duration-fast hover:text-foreground">
            Como funciona
          </a>
          <a href="#instrumento" className="transition-colors duration-fast hover:text-foreground">
            O instrumento
          </a>
          <a href="#plano" className="transition-colors duration-fast hover:text-foreground">
            Plano
          </a>
          <LandingNavActions />
        </nav>
        <div className="md:hidden">
          <LandingNavActions mobile />
        </div>
      </header>
      <main id="conteudo" tabIndex={-1} className="outline-none">
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:pb-32 lg:pt-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary-subtle px-3 py-1.5 type-eyebrow font-bold text-primary-subtle-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Inteligência para compras públicas
            </div>
            <h1 className="max-w-2xl text-[48px] font-semibold leading-[0.98] tracking-[-0.065em] sm:text-[72px]">
              Encontre o edital certo. <span className="text-primary">Antes do prazo.</span>
            </h1>
            <p className="mt-7 max-w-lg text-[17px] leading-8 text-muted-foreground">
              Uma forma mais clara de descobrir, avaliar e acompanhar oportunidades públicas que fazem sentido para a sua empresa.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LandingHeroStart />
              <Link
                href="/search"
                data-testid="link-hero-demo"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-3 text-sm font-semibold text-foreground shadow-2xs transition-colors duration-fast hover:border-border-strong hover:bg-surface-sunken"
              >
                Ver demonstração
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Check size={14} className="text-primary" />
                Dados organizados
              </span>
              <span className="flex items-center gap-1.5">
                <Check size={14} className="text-primary" />
                Alertas no seu ritmo
              </span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-3 rounded-[30px] bg-primary-subtle/70 sm:-inset-6" />
            <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
              <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <img src="/LicitAI_logo.png" alt="" width={24} height={24} className="h-6 w-6" />
                  Seu radar
                </div>
                <span className="type-label text-muted-foreground">dados do PNCP</span>
              </div>
              <div className="p-5">
                {/* Caption states exactly what the list below is: the query has no search term. */}
                <div className="mb-4 flex h-9 items-center gap-2 rounded-md bg-surface-sunken px-3 text-xs text-muted-foreground">
                  <Search size={14} aria-hidden="true" className="shrink-0" />
                  Editais abertos mais recentes
                </div>
                {preview.isPending && <p className="py-4 text-xs text-muted-foreground">Carregando editais…</p>}
                {preview.isError && (
                  <p role="alert" className="py-4 text-xs text-destructive">
                    Não foi possível carregar os editais agora.
                  </p>
                )}
                {preview.isSuccess && previewTenders.length === 0 && <p className="py-4 text-xs text-muted-foreground">Nenhum edital aberto no momento.</p>}
                {previewTenders.map((t, i) => (
                  <div key={t.id} className={`border-b border-border-subtle py-4 ${i === previewTenders.length - 1 ? 'border-0 pb-1' : ''}`}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full bg-status-open px-2 py-0.5 text-3xs font-bold text-status-open-foreground">{statusLabels[t.status]}</span>
                      <span className="type-data text-3xs text-muted-foreground">{t.location.state}</span>
                    </div>
                    <div className="text-xs font-semibold leading-5 text-foreground">{t.title}</div>
                    <div className="mt-2 flex justify-between gap-3 text-3xs text-muted-foreground">
                      <span>{t.organization.name}</span>
                      <span className="shrink-0 type-data font-bold text-primary">{formatCurrency(t.estimatedValue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section id="como-funciona" className="border-y border-border bg-surface py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
              <div>
                <div className="type-eyebrow font-bold text-primary">O método</div>
                <h2 className="mt-4 max-w-sm text-4xl font-semibold leading-[1.05] tracking-display">Menos ruído. Mais convicção.</h2>
              </div>
              <div className="grid gap-8 sm:grid-cols-3">
                {[
                  ['01', 'Descubra', 'Uma busca feita para falar a língua das oportunidades, não dos portais.'],
                  ['02', 'Entenda', 'Contexto, documentos e prazos organizados para uma leitura segura.'],
                  ['03', 'Acompanhe', 'Alertas sobre o que mudou, até a hora de decidir.'],
                ].map(([number, title, text]) => (
                  <div key={number} className="border-t border-primary/40 pt-4">
                    <div className="type-data type-meta text-primary">{number}</div>
                    <h3 className="mt-7 text-lg font-semibold">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section id="instrumento" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[.95fr_1.05fr] lg:items-center">
            <div>
              <div className="type-eyebrow font-bold text-primary">Feito para decidir</div>
              <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-[1.05] tracking-display">
                Um instrumento de pesquisa para quem não pode perder tempo.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">
                Salve o que merece atenção, compare o que importa e mantenha o contexto por perto. Sem planilhas espalhadas, sem voltar ao portal toda manhã.
              </p>
              <Link
                href="/search"
                data-testid="link-landing-search"
                className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"
              >
                Conhecer a experiência <ArrowRight size={15} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-surface p-5">
                <Target size={19} className="text-primary" />
                <div className="mt-10 text-2xl font-semibold tracking-display">PNCP</div>
                <div className="mt-1 text-xs text-muted-foreground">fonte das publicações</div>
              </div>
              <div className="mt-8 rounded-xl bg-sidebar p-5 text-sidebar-strong-foreground">
                <Clock3 size={19} className="text-sidebar-primary" />
                <div className="mt-10 text-2xl font-semibold tracking-display">1 tela</div>
                <div className="mt-1 text-xs text-sidebar-muted-foreground">para o essencial</div>
              </div>
              <div className="col-span-2 rounded-xl border border-primary/20 bg-primary-subtle p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Seu próximo movimento</div>
                    <div className="mt-1 text-xs text-muted-foreground">Prazos e publicações lidos do banco</div>
                  </div>
                  <ArrowRight size={18} className="text-primary" />
                </div>
              </div>
            </div>
          </div>
        </section>
        <PlanSection />
      </main>
      <footer className="border-t border-border px-5 py-7 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <span>© 2026 LicitAI · publicações do PNCP</span>
          <span>Feito para equipes que leem antes de agir.</span>
        </div>
      </footer>
    </div>
  );
}
