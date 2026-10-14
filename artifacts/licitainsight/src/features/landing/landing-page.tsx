import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Bell, Bookmark, Check, Clapperboard, Globe2, Landmark, Search, type LucideIcon } from 'lucide-react';
import { BrandLogo } from '@/components/brand-icon';
import { buttonClass } from '@/components/common/action-button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useSession } from '@/features/auth/hooks/use-session';
import { usePublicPlan } from '@/features/billing/hooks/use-public-plan';
import { BILLING_HREF } from '@/features/billing/lib/trial';
import { PardalClip } from '@/features/landing/components/pardal-clip';
import { LegalLinks } from '@/features/legal/legal-content';
import { formatCurrencyPrecise } from '@/lib/format';
import { cn } from '@/lib/utils';

const navLink = 'font-semibold text-primary transition-colors duration-fast hover:underline';
const primaryCta = buttonClass('dark', 'lg');
const heroCta = cn(buttonClass('primary', 'lg'), 'h-13 px-7');
const secondaryCta = cn(buttonClass('outline', 'lg'), 'h-13 px-7');
const eyebrow = 'type-eyebrow font-bold text-primary tracking-eyebrow uppercase';
const sectionTitle = 'mt-3 type-titulo-2 lg:type-titulo-1';

// three.js only downloads when the flying pardal is shown.
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

function PardalFlight({ reducedMotion }: { reducedMotion: boolean }) {
  const wide = useMediaQuery(PARDAL_FLIGHT_MEDIA);
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

function SessionPlaceholder({ inverse = false }: { inverse?: boolean }) {
  return <span role="status" aria-label="Carregando conta" className={cn('inline-block h-9 w-28 animate-pulse rounded-lg', inverse ? 'bg-texto-inverso/20' : 'bg-muted')} />;
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

/** Account entry point: sign in (and start the trial) or, when signed in, back to the overview. */
function AccountCta({ testId, className, label, inversePlaceholder = false }: { testId: string; className: string; label: string; inversePlaceholder?: boolean }) {
  const { status } = useSession();
  if (status === 'loading') return <SessionPlaceholder inverse={inversePlaceholder} />;
  const signedIn = status === 'authenticated';
  return (
    <Link href={signedIn ? '/dashboard' : '/login'} data-testid={testId} className={className}>
      {signedIn ? 'Ir para a visão geral' : label} <ArrowRight size={16} aria-hidden />
    </Link>
  );
}

type Kind = {
  icon: LucideIcon;
  label: string;
  /** Palette fill. The ink on it is always `texto-sobre-destaque` (petróleo), ≥ 5.5:1 on all three. */
  fill: string;
};

// One color per kind of opportunity, shared by the hero chips and the "what you find" cards.
const kinds = {
  tenders: { icon: Landmark, label: 'Licitações', fill: 'bg-salvia' },
  culture: { icon: Clapperboard, label: 'Chamadas culturais', fill: 'bg-aqua' },
  international: { icon: Globe2, label: 'Internacionais', fill: 'bg-oliva' },
} satisfies Record<string, Kind>;

function KindChip({ kind, className }: { kind: Kind; className?: string }) {
  const Icon = kind.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-xs font-bold text-texto-sobre-destaque',
        kind.fill,
        className,
      )}
    >
      <Icon size={14} aria-hidden /> {kind.label}
    </span>
  );
}

/**
 * The hero picture: the pardal perched on an edital, three kinds of opportunity around it and the alert it sends.
 * Decorative: the headline already says all of it.
 */
function HeroArt({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-xl lg:mx-0">
      <div className="relative overflow-hidden rounded-2xl bg-superficie-inversa px-4 pb-6 pt-10 sm:px-8">
        {/* Rings behind the edital, drawn in the inverse ink at low alpha. */}
        <svg viewBox="0 0 400 400" className="absolute -right-24 -top-24 size-96 text-texto-inverso/15" fill="none">
          {[60, 110, 160, 198].map((r) => (
            <circle key={r} cx="200" cy="200" r={r} stroke="currentColor" strokeWidth="1.5" />
          ))}
        </svg>
        <PardalClip clip="pardal-raio-x" reducedMotion={reducedMotion} className="relative mx-auto" />
      </div>
      {/* Phones: a row under the picture. From sm up the chips float around its edges. */}
      <div className="mt-5 flex flex-wrap justify-center gap-2 sm:contents">
        <KindChip kind={kinds.tenders} className="-rotate-2 sm:absolute sm:-left-5 sm:top-8 sm:-rotate-3" />
        <KindChip kind={kinds.culture} className="rotate-1 sm:absolute sm:-right-5 sm:bottom-[22%] sm:rotate-2" />
        <KindChip kind={kinds.international} className="-rotate-1 sm:absolute sm:-bottom-4 sm:left-10 sm:-rotate-2" />
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3.5 py-1.5 text-xs font-semibold text-foreground sm:absolute sm:-top-4 sm:right-10">
          <Bell size={14} aria-hidden className="text-primary" /> Novo edital para você
        </span>
      </div>
    </div>
  );
}

function Hero({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <section
      aria-labelledby="hero-titulo"
      className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-5 pb-20 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:pb-28 lg:pt-20"
    >
      <div className="min-w-0">
        <h1 id="hero-titulo" className="max-w-2xl type-titulo-2 sm:type-titulo-1 lg:type-display">
          <span className="block text-hero-lead">Editais públicos e oportunidades,</span>
          <span className="block text-hero-highlight">num lugar só.</span>
        </h1>
        <p className="mt-6 max-w-xl type-corpo text-muted-foreground sm:type-corpo-grande">
          Licitações do PNCP, chamadas culturais e oportunidades internacionais. Salve o que interessa e o Pardal
          avisa quando surgir algo para você.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/search" data-testid="link-hero-demo" className={heroCta}>
            <Search size={16} aria-hidden /> Ver editais abertos
          </Link>
          <AccountCta testId="link-hero-start" className={secondaryCta} label="Entrar ou criar conta" />
        </div>
        <p className="mt-5 type-meta text-muted-foreground">Pesquisar é livre, sem cadastro. Os alertas vêm com a conta.</p>
      </div>
      <HeroArt reducedMotion={reducedMotion} />
    </section>
  );
}

const steps: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Search, title: 'Busque', text: 'Escreva o que você vende ou produz e filtre por estado, prazo e valor.' },
  { icon: Bookmark, title: 'Salve', text: 'Guarde os editais que interessam e as buscas que você repete.' },
  { icon: Bell, title: 'Receba o aviso', text: 'O Pardal avisa no app e por e-mail quando surge edital novo ou um prazo muda.' },
];

function HowItWorksSection() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="border-y border-border bg-surface py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <div className={eyebrow}>Como funciona</div>
          <h2 id="como-funciona-titulo" className={sectionTitle}>
            Três passos. Nenhum manual.
          </h2>
        </div>
        <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="relative flex gap-5 md:flex-col md:gap-6">
              {index < steps.length - 1 && (
                // The thread to the next step: down on phones (across the 2.5rem gap), sideways from md up (2rem gap).
                <span
                  aria-hidden
                  className="absolute left-6 top-12 h-[calc(100%_-_0.5rem)] border-l-2 border-dashed border-border md:left-12 md:top-6 md:h-0 md:w-[calc(100%_-_1rem)] md:border-l-0 md:border-t-2"
                />
              )}
              <span className="relative grid size-12 shrink-0 place-items-center rounded-pill border-2 border-foreground bg-background text-foreground">
                <Icon size={20} aria-hidden />
              </span>
              <div>
                <h3 className="type-titulo-3">
                  <span className="mr-2 type-data text-muted-foreground">{index + 1}.</span>
                  {title}
                </h3>
                <p className="mt-2 max-w-xs type-corpo text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const finds: { id: string; kind: Kind; source: string; text: string; href: string; cta: string; tilt: string }[] = [
  {
    id: 'tenders',
    kind: kinds.tenders,
    source: 'PNCP',
    text: 'Compras de prefeituras, estados e União, com prazo, valor e documentos do edital.',
    href: '/search',
    cta: 'Explorar licitações',
    tilt: 'lg:-rotate-3 lg:translate-y-6',
  },
  {
    id: 'culture',
    kind: kinds.culture,
    source: 'Mapas Culturais',
    text: 'Fomento ao audiovisual e à cultura, separado das compras públicas.',
    href: '/oportunidades',
    cta: 'Ver chamadas culturais',
    tilt: 'lg:-translate-y-2',
  },
  {
    id: 'international',
    kind: kinds.international,
    source: 'Organismos internacionais',
    text: 'Chamadas e licitações publicadas fora do Brasil, com o edital oficial sempre a um clique.',
    href: '/oportunidades?scope=international',
    cta: 'Ver internacionais',
    tilt: 'lg:rotate-3 lg:translate-y-6',
  },
];

/** A stylized edital: lines instead of text, like the pardal clip. Not data: it only hints at the shape of a card. */
function SketchLines() {
  return (
    <span aria-hidden className="mt-6 block space-y-2">
      <span className="block h-1.5 w-11/12 rounded-pill bg-texto-sobre-destaque/25" />
      <span className="block h-1.5 w-3/4 rounded-pill bg-texto-sobre-destaque/25" />
      <span className="block h-1.5 w-5/6 rounded-pill bg-texto-sobre-destaque/60" />
      <span className="block h-1.5 w-1/2 rounded-pill bg-texto-sobre-destaque/25" />
    </span>
  );
}

function FindsSection() {
  return (
    <section id="encontra" data-pardal-momento aria-labelledby="encontra-titulo" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className={eyebrow}>O que você encontra</div>
          <h2 id="encontra-titulo" className={sectionTitle}>
            Três tipos de oportunidade, uma busca.
          </h2>
          <p className="mt-4 type-corpo text-muted-foreground sm:type-corpo-grande">
            Tudo vem de fonte oficial e leva ao documento original.
          </p>
        </div>
        <ul className="mt-14 grid gap-6 md:grid-cols-3 lg:mt-16 lg:gap-4">
          {finds.map(({ id, kind, source, text, href, cta, tilt }) => {
            const Icon = kind.icon;
            return (
              <li key={id} className={cn('motion-safe:transition-transform motion-safe:duration-base', tilt, 'lg:hover:translate-y-0 lg:hover:rotate-0 lg:focus-within:translate-y-0 lg:focus-within:rotate-0')}>
                <Link
                  href={href}
                  data-testid={`link-landing-find-${id}`}
                  className={cn('group flex h-full flex-col rounded-2xl p-7 text-texto-sobre-destaque sm:p-8', kind.fill)}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="grid size-12 place-items-center rounded-pill border-2 border-texto-sobre-destaque">
                      <Icon size={22} aria-hidden />
                    </span>
                    <span className="type-rotulo">{source}</span>
                  </span>
                  <SketchLines />
                  <h3 className="mt-8 type-titulo-3">{kind.label}</h3>
                  <p className="mt-2 flex-1 type-legenda">{text}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold group-hover:underline">
                    {cta} <ArrowRight size={15} aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const planIncludes = [
  'Licitações, chamadas culturais e internacionais na mesma busca',
  'Editais salvos e buscas monitoradas, sem limite',
  'Alertas no app e resumo diário por e-mail',
  'Cancele quando quiser, nas Configurações',
];

/** Single plan. The price comes only from `/billing/plan`: none configured (`null`) or a failed request shows no price. */
function PlanSection() {
  const plan = usePublicPlan();
  const trialDays = useTrialDays();
  const price = plan.data?.monthlyBrl ?? null;
  const signedIn = useSession().status === 'authenticated';
  return (
    <section id="plano" data-pardal-momento data-testid="section-plan" aria-labelledby="plano-titulo" className="border-y border-border bg-surface py-20 sm:py-28">
      <div className="mx-auto max-w-xl px-5 text-center sm:px-8">
        <div className={eyebrow}>Plano</div>
        <h2 id="plano-titulo" className={sectionTitle}>
          Um plano, tudo incluído.
        </h2>
        <p className="mt-4 type-corpo text-muted-foreground">
          Pesquisar continua livre. A assinatura libera salvar, monitorar e receber alertas.
        </p>

        <div className="mt-10 rounded-2xl border border-border-strong bg-background p-7 text-left sm:p-10">
          <span className="inline-flex rounded-pill bg-action px-3.5 py-1 text-xs font-bold text-action-foreground">
            {trialDays} dias grátis, sem cartão
          </span>
          <div className="mt-6 min-h-12">
            {plan.isPending && (
              <span role="status" aria-label="Carregando plano" className="block h-12 w-48 animate-pulse rounded-lg bg-muted" />
            )}
            {price !== null && (
              <p data-testid="text-plan-price" className="flex items-baseline gap-2">
                <span className="type-titulo-1 text-foreground sm:type-display">{formatCurrencyPrecise(price)}</span>
                <span className="text-sm font-semibold text-muted-foreground">/ mês</span>
              </p>
            )}
            {plan.isError && (
              <p role="alert" className="text-xs text-destructive">
                Não foi possível carregar o valor da assinatura agora.
              </p>
            )}
          </div>
          <ul className="mt-8 space-y-3 border-t border-border-subtle pt-6 text-sm">
            {planIncludes.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <Check size={16} aria-hidden className="mt-0.5 shrink-0 text-primary" />
                <span className="leading-5 text-foreground">{item}</span>
              </li>
            ))}
          </ul>
          <Link href={signedIn ? BILLING_HREF : '/login'} data-testid="link-plan-start" className={cn(primaryCta, 'mt-8 w-full justify-center')}>
            {signedIn ? 'Ver minha assinatura' : `Começar ${trialDays} dias grátis`} <ArrowRight size={16} aria-hidden />
          </Link>
          <p className="mt-4 text-center type-meta text-muted-foreground">O teste vale uma vez por conta Google.</p>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const trialDays = useTrialDays();
  const faqs = [
    {
      q: 'Preciso pagar para ver os editais?',
      a: 'Não. A busca, o detalhe dos editais e as oportunidades são abertos a todos. A assinatura libera salvar, monitorar e receber alertas.',
    },
    {
      q: 'De onde vêm as oportunidades?',
      a: 'As licitações vêm do PNCP (Portal Nacional de Contratações Públicas) e são atualizadas todos os dias. As chamadas culturais vêm do Mapas Culturais, e as internacionais, de organismos que publicam editais abertos. Cada uma leva ao documento oficial.',
    },
    {
      q: 'Como funciona o teste grátis?',
      a: `Você entra com a conta Google e tem ${trialDays} dias com tudo liberado. Não pedimos cartão para começar.`,
    },
    {
      q: 'Como chegam os alertas?',
      a: 'No sino do app e num resumo diário por e-mail, sobre os editais que você salvou e as buscas que você monitora.',
    },
    {
      q: 'Posso cancelar quando quiser?',
      a: 'Sim, nas Configurações da conta, sem multa. O acesso continua até o fim do período já pago.',
    },
  ];
  return (
    <section id="duvidas" aria-labelledby="duvidas-titulo" className="mx-auto max-w-3xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="text-center">
        <div className={eyebrow}>Dúvidas</div>
        <h2 id="duvidas-titulo" className={sectionTitle}>
          Perguntas rápidas
        </h2>
      </div>
      <Accordion type="single" collapsible className="mt-10 w-full border-t border-border-subtle">
        {faqs.map((faq, idx) => (
          <AccordionItem key={faq.q} value={`item-${idx}`} className="border-border-subtle">
            <AccordionTrigger className="text-left text-base font-semibold text-foreground hover:no-underline hover:text-primary">
              {faq.q}
            </AccordionTrigger>
            <AccordionContent className="type-corpo text-muted-foreground">{faq.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function FinalCta({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <section aria-labelledby="cta-titulo" className="px-5 pb-20 sm:px-8 sm:pb-28">
      {/* On the inverse block the focus ring takes the inverse ink, or it would vanish into the background. */}
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 rounded-2xl bg-superficie-inversa px-6 [--ring:var(--texto-inverso)] py-14 text-center sm:px-14 lg:flex-row lg:justify-between lg:text-left">
        <div className="max-w-xl">
          <h2 id="cta-titulo" className="type-titulo-2 text-texto-inverso lg:type-titulo-1">
            Comece pelos editais abertos hoje.
          </h2>
          <p className="mt-3 type-corpo text-texto-inverso">
            Pesquise sem cadastro. Quando quiser alertas, entre com o Google.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            <Link href="/search" data-testid="link-final-search" className={heroCta}>
              <Search size={16} aria-hidden /> Ver editais abertos
            </Link>
            <AccountCta
              testId="link-final-start"
              className="inline-flex h-13 items-center gap-2 rounded-pill px-4 text-sm font-semibold text-texto-inverso underline-offset-4 hover:underline"
              label="Entrar ou criar conta"
              inversePlaceholder
            />
          </div>
        </div>
        <PardalClip clip="pardal-assinatura" reducedMotion={reducedMotion} className="w-40 shrink-0 sm:w-48" />
      </div>
    </section>
  );
}

// Marketing page. Hero sizes sit above the product type scale on purpose; every color is a design system token.
export default function LandingPage() {
  const reducedMotion = useMediaQuery(REDUCED_MOTION_MEDIA);
  return (
    <div className="relative min-h-[100dvh] overflow-x-clip bg-background text-foreground">
      <PardalFlight reducedMotion={reducedMotion} />
      <header className="sticky top-0 z-sticky border-b border-border-subtle bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" data-testid="link-logo" className="flex items-center gap-2.5">
            <BrandLogo className="h-11 sm:h-12" />
          </Link>
          <nav aria-label="Seções" className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#como-funciona" className="transition-colors duration-fast hover:text-foreground">
              Como funciona
            </a>
            <a href="#encontra" className="transition-colors duration-fast hover:text-foreground">
              O que você encontra
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
        <Hero reducedMotion={reducedMotion} />
        <HowItWorksSection />
        <FindsSection />
        <PlanSection />
        <FaqSection />
        <FinalCta reducedMotion={reducedMotion} />
      </main>

      <footer className="border-t border-border bg-surface px-5 py-12 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Pardal Digital · Editais públicos e oportunidades</p>
            <p>© 2026 Pardal Digital · Dados oficiais do PNCP, do Mapas Culturais e de organismos internacionais.</p>
          </div>
          <LegalLinks className="sm:justify-end" />
        </div>
      </footer>
    </div>
  );
}
