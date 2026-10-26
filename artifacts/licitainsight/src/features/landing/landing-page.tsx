import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ArrowRight,
  Bell,
  Check,
  Clapperboard,
  FileSearch,
  Globe2,
  Landmark,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand-icon';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useSession } from '@/features/auth/hooks/use-session';
import { usePublicPlan } from '@/features/billing/hooks/use-public-plan';
import { BILLING_HREF } from '@/features/billing/lib/trial';
import { LandingMotionPlaylist } from '@/features/landing/components/landing-motion-playlist';
import { OpportunityMapSection } from '@/features/landing/components/opportunity-map-section';
import { LegalLinks } from '@/features/legal/legal-content';
import { formatCurrencyPrecise } from '@/lib/format';
import { cn } from '@/lib/utils';

const primaryAction =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-action px-5 text-sm font-bold text-action-foreground transition-[transform,background-color] duration-fast hover:bg-action-hover active:translate-y-px';
const inverseAction =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-superficie-inversa px-5 text-sm font-bold text-texto-inverso transition-[transform,background-color] duration-fast hover:bg-inverse-hover active:translate-y-px';
// The plan offer card is gelo in both themes, so its button stays petróleo instead of following the inverse tokens.
const brandAction =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-petroleo px-5 text-sm font-bold text-gelo transition-[transform,background-color] duration-fast hover:bg-petroleo-hover active:translate-y-px';

const useTrialDays = () => usePublicPlan().data?.trialDays ?? 7;

function SessionPlaceholder({ inverse = false }: { inverse?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Carregando conta"
      className={cn('inline-block h-11 w-28 animate-pulse rounded-lg', inverse ? 'bg-texto-inverso/20' : 'bg-muted')}
    />
  );
}

function AccountAction({ compact = false }: { compact?: boolean }) {
  const { status } = useSession();
  const trialDays = useTrialDays();
  if (status === 'loading') return <SessionPlaceholder />;
  if (status === 'authenticated') {
    return (
      <Link href="/dashboard" data-testid="link-landing-dashboard" className={compact ? 'text-sm font-bold' : inverseAction}>
        Visão geral {!compact && <ArrowRight size={16} aria-hidden />}
      </Link>
    );
  }
  if (compact) {
    return (
      <Link href="/login" data-testid="link-landing-login-mobile" className="text-sm font-bold">
        Entrar
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <Link href="/login" data-testid="link-landing-login" className="text-sm font-bold hover:underline">
        Entrar
      </Link>
      <Link href="/login" data-testid="link-landing-register" className={inverseAction}>
        Testar {trialDays} dias grátis
      </Link>
    </div>
  );
}

function AccountCta({ className, testId, label }: { className: string; testId: string; label: string }) {
  const { status } = useSession();
  if (status === 'loading') return <SessionPlaceholder inverse />;
  const signedIn = status === 'authenticated';
  return (
    <Link href={signedIn ? '/dashboard' : '/login'} data-testid={testId} className={className}>
      {signedIn ? 'Ir para a visão geral' : label} <ArrowRight size={16} aria-hidden />
    </Link>
  );
}

function LandingHeader() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: '#descobrir', label: 'Descobrir' },
    { href: '#como-funciona', label: 'Como funciona' },
    { href: '#mapa', label: 'Mapa' },
    { href: '#plano', label: 'Plano' },
    { href: '#duvidas', label: 'Dúvidas' },
  ];

  return (
    <header className="landing-header">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-6 px-5 md:px-8 lg:px-12 xl:px-20">
        <Link href="/" data-testid="link-logo" aria-label="Pardal Digital, início">
          <BrandLogo className="h-10 sm:h-11" />
        </Link>
        <nav aria-label="Seções" className="hidden items-center gap-6 lg:flex">
          {links.map((item) => (
            <a key={item.href} href={item.href} className="landing-nav-link">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="hidden lg:block"><AccountAction /></div>
        <div className="flex items-center gap-4 lg:hidden">
          <AccountAction compact />
          <button
            type="button"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="grid size-11 place-items-center rounded-lg border border-border-strong"
          >
            {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label="Menu móvel" className="landing-mobile-menu lg:hidden">
          {links.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</a>
          ))}
          <Link href="/search" onClick={() => setOpen(false)} className={primaryAction}>
            Ver editais <ArrowRight size={16} aria-hidden />
          </Link>
        </nav>
      )}
    </header>
  );
}

function Hero() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState('');
  const [photoReady, setPhotoReady] = useState(false);
  const photoRef = useRef<HTMLImageElement>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = query.trim();
    navigate(normalized ? `/search?q=${encodeURIComponent(normalized)}` : '/search');
  };
  const baseUrl = import.meta.env.BASE_URL;

  useEffect(() => {
    const photo = photoRef.current;
    if (photo?.complete && photo.naturalWidth > 0) setPhotoReady(true);
  }, []);

  return (
    <section id="topo" aria-labelledby="hero-titulo" className="landing-hero">
      <div className="landing-hero-stage">
        <div className="landing-hero-copy">
          <p className="landing-hero-label">Pardal Digital</p>
          <h1 id="hero-titulo" className="landing-hero-title">
            Seu <strong>radar</strong> de oportunidades,
            <span>
              na palma da <strong>mão</strong>.
            </span>
          </h1>
          <p className="landing-hero-description">Encontre licitações e editais por assunto, região e prazo.</p>
        </div>

        <div
          className={cn('landing-hero-photo', !photoReady && 'landing-hero-photo-loading')}
          aria-busy={!photoReady}
        >
          <img
            ref={photoRef}
            src={`${baseUrl}brand/landing-hero.jpg`}
            alt="Profissional olhando para novos caminhos"
            width={1365}
            height={2048}
            fetchPriority="high"
            className={cn(photoReady && 'is-ready')}
            onLoad={() => setPhotoReady(true)}
          />
          <span className="landing-hero-wing" aria-hidden />
        </div>

        <form onSubmit={submit} role="search" className="landing-hero-search">
          <label htmlFor="home-search">O que você procura?</label>
          <div className="landing-hero-search-row">
            <Search size={20} aria-hidden />
            <input
              id="home-search"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Palavra-chave, órgão ou área de interesse"
            />
            <button type="submit">Buscar <ArrowRight size={16} aria-hidden /></button>
          </div>
          <p>Busca livre com dados oficiais do PNCP.</p>
        </form>
      </div>
    </section>
  );
}

type DiscoveryItem = {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  tone: string;
  testId: string;
};

const discoveryItems: DiscoveryItem[] = [
  { icon: Landmark, title: 'Licitações', description: 'Compras públicas abertas no PNCP para produtos e serviços.', href: '/search', tone: 'bg-salvia', testId: 'link-landing-find-tenders' },
  { icon: Clapperboard, title: 'Editais nacionais', description: 'Chamadas de cultura, fomento e pesquisa em todo o Brasil.', href: '/oportunidades', tone: 'bg-aqua', testId: 'link-landing-find-culture' },
  { icon: Globe2, title: 'Internacionais', description: 'Oportunidades publicadas por organismos internacionais.', href: '/oportunidades?scope=international', tone: 'bg-oliva', testId: 'link-landing-find-international' },
];

function DiscoverySection() {
  return (
    <section id="descobrir" aria-labelledby="descobrir-titulo" className="landing-discovery scroll-mt-20">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="max-w-3xl">
          <p className="landing-section-label">Descubra por interesse</p>
          <h2 id="descobrir-titulo" className="landing-section-title max-w-[13ch]">O que você quer encontrar?</h2>
          <p className="landing-section-copy max-w-2xl">Escolha um caminho. Cada resultado leva ao documento oficial.</p>
        </div>
        <div className="landing-interest-grid">
          {discoveryItems.map(({ icon: Icon, title, description, href, tone, testId }) => (
            <Link key={title} href={href} data-testid={testId} className={cn('landing-interest-card group', tone)}>
              <span className="landing-interest-icon"><Icon size={24} aria-hidden /></span>
              <span className="min-w-0"><strong>{title}</strong><small>{description}</small></span>
              <ArrowRight size={20} aria-hidden className="ml-auto shrink-0 transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const journey = [
  { icon: Search, title: 'Busque do seu jeito', text: 'Escreva o que sua empresa vende ou produz. O Pardal encontra oportunidades relacionadas.' },
  { icon: FileSearch, title: 'Entenda antes de abrir', text: 'Veja órgão, prazo, valor e localização. Depois confira o documento na fonte oficial.' },
  { icon: Bell, title: 'Acompanhe o que importa', text: 'Salve editais e buscas. Receba avisos quando surgir uma oportunidade ou um prazo mudar.' },
];

function HowItWorksSection() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="landing-journey scroll-mt-20">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-28 xl:px-20">
        <div className="landing-journey-heading">
          <div>
            <h2 id="como-funciona-titulo">Da busca ao edital certo.</h2>
            <p>Um caminho curto para encontrar, entender e acompanhar oportunidades.</p>
          </div>
          <LandingMotionPlaylist />
        </div>
        <ol className="landing-journey-list">
          {journey.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <span className="landing-journey-icon"><Icon size={22} aria-hidden /></span>
              <div><h3>{title}</h3><p>{text}</p></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const planIncludes = [
  'Licitações e editais nacionais e internacionais na mesma busca',
  'Editais salvos e buscas monitoradas, sem limite',
  'Alertas no app e resumo diário por e-mail',
  'Cancelamento nas Configurações, quando quiser',
];

function PlanSection() {
  const plan = usePublicPlan();
  const trialDays = useTrialDays();
  const price = plan.data?.monthlyBrl ?? null;
  const signedIn = useSession().status === 'authenticated';
  return (
    <section id="plano" data-testid="section-plan" aria-labelledby="plano-titulo" className="landing-plan scroll-mt-20">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="landing-plan-shell">
          <div className="landing-plan-message">
            <p className="landing-section-label">Plano</p>
            <h2 id="plano-titulo">Um plano, tudo incluído.</h2>
            <p>Pesquisar continua livre. A assinatura libera salvar, monitorar e receber alertas.</p>
            <ul>
              {planIncludes.map((item) => <li key={item}><Check size={18} aria-hidden /><span>{item}</span></li>)}
            </ul>
          </div>
          <div className="landing-plan-offer">
            <span className="landing-plan-trial"><ShieldCheck size={17} aria-hidden /> {trialDays} dias grátis, sem cartão</span>
            <div className="landing-plan-price" aria-live="polite">
              {plan.isPending && <span role="status" aria-label="Carregando plano" className="block h-14 w-52 animate-pulse rounded-lg bg-muted" />}
              {price !== null && <p data-testid="text-plan-price"><strong>{formatCurrencyPrecise(price)}</strong><span>/ mês</span></p>}
              {plan.isError && <p role="alert" className="text-sm">Não foi possível carregar o valor agora.</p>}
            </div>
            <Link href={signedIn ? BILLING_HREF : '/login'} data-testid="link-plan-start" className={brandAction}>
              {signedIn ? 'Ver minha assinatura' : `Testar ${trialDays} dias grátis`} <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/search" className="landing-plan-secondary">Continuar pesquisando</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function EditorialSection() {
  const baseUrl = import.meta.env.BASE_URL;
  return (
    <section aria-labelledby="editorial-titulo" className="landing-editorial">
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <h2 id="editorial-titulo" className="landing-section-title max-w-[12ch]">Informação para decidir melhor.</h2>
        <div className="landing-editorial-grid">
          <Link href="/ajuda" className="landing-editorial-feature group">
            <img src={`${baseUrl}brand/landing-study.jpg`} alt="Profissionais revisando e assinando documentos" width={2048} height={1365} loading="lazy" />
            <span><small>Ajuda e glossário</small><strong>Entenda os termos antes de participar.</strong><em>Consultar guia <ArrowRight size={16} aria-hidden /></em></span>
          </Link>
          <div className="landing-editorial-links">
            <Link href="/transparencia" className="group">
              <span className="landing-editorial-mark"><Sparkles size={28} aria-hidden /></span>
              <span><small>Transparência</small><strong>Compare histórico e resultados de compras públicas.</strong></span>
              <ArrowRight size={20} aria-hidden className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link href="/oportunidades" className="group">
              <span className="landing-editorial-mark landing-editorial-mark-alt"><Globe2 size={28} aria-hidden /></span>
              <span><small>Novos caminhos</small><strong>Veja chamadas nacionais e internacionais.</strong></span>
              <ArrowRight size={20} aria-hidden className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const trialDays = useTrialDays();
  const faqs = [
    { q: 'Preciso pagar para ver os editais?', a: 'Não. A busca, o detalhe dos editais e as oportunidades são públicos. A assinatura libera salvar, monitorar e receber alertas.' },
    { q: 'De onde vêm as oportunidades?', a: 'As licitações vêm do PNCP. Editais nacionais vêm do Mapas Culturais e de órgãos de fomento. Cada resultado leva ao documento oficial.' },
    { q: 'Como funciona o teste grátis?', a: `Você entra com a conta Google e tem ${trialDays} dias com todos os recursos liberados. Não pedimos cartão para começar.` },
    { q: 'Como chegam os alertas?', a: 'No sino do app e em um resumo diário por e-mail, com base nos editais salvos e nas buscas monitoradas.' },
  ];
  return (
    <section id="duvidas" aria-labelledby="duvidas-titulo" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28">
      <h2 id="duvidas-titulo" className="landing-section-title text-center">Perguntas rápidas</h2>
      <Accordion type="single" collapsible className="mt-10 w-full border-t border-border-subtle">
        {faqs.map((faq, index) => (
          <AccordionItem key={faq.q} value={`item-${index}`} className="border-border-subtle">
            <AccordionTrigger className="text-left text-base font-bold hover:no-underline">{faq.q}</AccordionTrigger>
            <AccordionContent className="type-corpo text-muted-foreground">{faq.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function FinalCta() {
  return (
    <section aria-labelledby="cta-titulo" className="px-5 pb-20 sm:px-8 sm:pb-28">
      <div className="landing-final-cta">
        <div><h2 id="cta-titulo">Seu próximo edital pode estar aberto agora.</h2><p>Pesquise sem cadastro. Quando quiser alertas, entre com o Google.</p></div>
        <div className="flex flex-wrap gap-3">
          <Link href="/search" data-testid="link-final-search" className={primaryAction}><Search size={16} aria-hidden /> Ver editais</Link>
          <AccountCta testId="link-final-start" className="landing-final-secondary" label="Entrar ou criar conta" />
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-background text-foreground">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-lg focus:bg-action focus:px-4 focus:py-3 focus:font-bold focus:text-action-foreground">Pular para o conteúdo</a>
      <LandingHeader />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        <Hero />
        <DiscoverySection />
        <HowItWorksSection />
        <OpportunityMapSection />
        <EditorialSection />
        <PlanSection />
        <FaqSection />
        <FinalCta />
      </main>
      <footer className="landing-footer">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-end">
          <div><BrandLogo className="h-10" /><p className="mt-5 max-w-md text-sm text-muted-foreground">Editais públicos e oportunidades em um só lugar.</p><p className="mt-2 text-xs text-muted-foreground">© 2026 Pardal Digital. Dados de fontes oficiais.</p></div>
          <div className="flex flex-col gap-3 text-sm font-semibold md:items-end"><Link href="/ajuda">Ajuda e glossário</Link><LegalLinks className="md:justify-end" /></div>
        </div>
      </footer>
    </div>
  );
}
