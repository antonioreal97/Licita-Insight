import { Link } from 'wouter';
import { ArrowRight, Check, Clock3, Search, Target } from 'lucide-react';
import { useTenderSearch } from '@/features/search/hooks/use-tender-search';
import { formatCurrency } from '@/lib/format';
import { statusLabels } from '@/lib/tender-labels';

// DS-DEBT: marketing page uses raw hex colors instead of tokens.
export default function LandingPage() {
  const preview = useTenderSearch({ pageSize: 3, status: ['open'], facets: false });
  const previewTenders = preview.data?.data ?? [];
  return (
    <div className="min-h-[100dvh] bg-[#f5f7f6] text-[#172625]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" data-testid="link-logo" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#152c2c] text-xs font-bold text-[#6ad4b4]">LI</span>
          <span className="font-semibold tracking-[-0.03em]">
            Licita <span className="text-[#278f73]">Insight</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-[#61716f] md:flex">
          <a href="#como-funciona" className="hover:text-[#172625]">
            Como funciona
          </a>
          <a href="#instrumento" className="hover:text-[#172625]">
            O instrumento
          </a>
          <Link href="/login" data-testid="link-landing-login" className="font-semibold text-[#278f73]">
            Entrar
          </Link>
          <Link
            href="/register"
            data-testid="link-landing-register"
            className="rounded-lg bg-[#172f2e] px-4 py-2.5 font-semibold text-white hover:bg-[#234a47]"
          >
            Começar agora
          </Link>
        </nav>
        <Link href="/login" className="text-sm font-semibold text-[#278f73] md:hidden">
          Entrar
        </Link>
      </header>
      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:pb-32 lg:pt-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#b8d7cc] bg-[#e7f4ef] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#227d64]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#39ad87]" />
              Inteligência para compras públicas
            </div>
            <h1 className="max-w-2xl text-[48px] font-semibold leading-[0.98] tracking-[-0.065em] sm:text-[72px]">
              Encontre o edital certo. <span className="text-[#258d72]">Antes do prazo.</span>
            </h1>
            <p className="mt-7 max-w-lg text-[17px] leading-8 text-[#61716f]">
              Uma forma mais clara de descobrir, avaliar e acompanhar oportunidades públicas que fazem sentido para a sua empresa.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/register"
                data-testid="link-hero-start"
                className="inline-flex items-center gap-2 rounded-lg bg-[#172f2e] px-5 py-3 text-sm font-semibold text-white hover:bg-[#234a47]"
              >
                Explorar o radar <ArrowRight size={16} />
              </Link>
              <Link
                href="/search"
                data-testid="link-hero-demo"
                className="inline-flex items-center gap-2 rounded-lg border border-[#cbd8d4] px-5 py-3 text-sm font-semibold text-[#35504b] hover:bg-white"
              >
                Ver demonstração
              </Link>
            </div>
            <div className="mt-10 flex items-center gap-5 text-xs text-[#71807d]">
              <span className="flex items-center gap-1.5">
                <Check size={14} className="text-[#278f73]" />
                Dados organizados
              </span>
              <span className="flex items-center gap-1.5">
                <Check size={14} className="text-[#278f73]" />
                Alertas no seu ritmo
              </span>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-6 rounded-[30px] bg-[#dcece6]/50" />
            <div className="relative overflow-hidden rounded-2xl border border-[#cbdcd6] bg-white shadow-[0_18px_60px_rgba(35,72,63,.1)]">
              <div className="flex items-center justify-between border-b border-[#e4ebe8] px-5 py-4">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="grid h-6 w-6 place-items-center rounded bg-[#e4f2ed] text-[9px] font-bold text-[#258d72]">LI</span>Seu radar
                </div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#879692]">atualizado agora</span>
              </div>
              <div className="p-5">
                <div className="mb-4 flex gap-2">
                  <div className="h-9 flex-1 rounded-md bg-[#f0f5f3] px-3 py-2 text-xs text-[#879692]">tecnologia educacional</div>
                  <div className="grid h-9 w-9 place-items-center rounded-md bg-[#258d72] text-white">
                    <Search size={15} />
                  </div>
                </div>
                {previewTenders.map((t, i) => (
                  <div key={t.id} className={`border-b border-[#edf1ef] py-4 ${i === 2 ? 'border-0 pb-1' : ''}`}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full bg-[#e4f4ee] px-2 py-0.5 text-[9px] font-bold text-[#258d72]">{statusLabels[t.status]}</span>
                      <span className="font-mono text-[9px] text-[#9aa8a4]">{t.location.state}</span>
                    </div>
                    <div className="text-xs font-semibold leading-5 text-[#273b38]">{t.title}</div>
                    <div className="mt-2 flex justify-between text-[10px] text-[#81908c]">
                      <span>{t.organization.name}</span>
                      <span className="font-mono font-bold text-[#258d72]">{formatCurrency(t.estimatedValue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section id="como-funciona" className="border-y border-[#dce6e2] bg-white py-20">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#278f73]">O método</div>
                <h2 className="mt-4 max-w-sm text-4xl font-semibold leading-[1.05] tracking-[-0.05em]">Menos ruído. Mais convicção.</h2>
              </div>
              <div className="grid gap-8 sm:grid-cols-3">
                {[
                  ['01', 'Descubra', 'Uma busca feita para falar a língua das oportunidades, não dos portais.'],
                  ['02', 'Entenda', 'Contexto, documentos e prazos organizados para uma leitura segura.'],
                  ['03', 'Acompanhe', 'Alertas sobre o que mudou, até a hora de decidir.'],
                ].map(([number, title, text]) => (
                  <div key={number} className="border-t-2 border-[#b8d7cc] pt-4">
                    <div className="font-mono text-[11px] text-[#278f73]">{number}</div>
                    <h3 className="mt-7 text-lg font-semibold">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#71807d]">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section id="instrumento" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[.95fr_1.05fr] lg:items-center">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#278f73]">Feito para decidir</div>
              <h2 className="mt-4 max-w-lg text-4xl font-semibold leading-[1.05] tracking-[-0.05em]">
                Um instrumento de pesquisa para quem não pode perder tempo.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-[#71807d]">
                Salve o que merece atenção, compare o que importa e mantenha o contexto por perto. Sem planilhas espalhadas, sem voltar ao portal toda manhã.
              </p>
              <Link href="/search" data-testid="link-landing-search" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[#278f73]">
                Conhecer a experiência <ArrowRight size={15} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#cbdcd6] bg-white p-5">
                <Target size={19} className="text-[#278f73]" />
                <div className="mt-10 text-2xl font-semibold tracking-[-.04em]">96%</div>
                <div className="mt-1 text-xs text-[#71807d]">aderência visível</div>
              </div>
              <div className="mt-8 rounded-xl bg-[#172f2e] p-5 text-white">
                <Clock3 size={19} className="text-[#6ad4b4]" />
                <div className="mt-10 text-2xl font-semibold tracking-[-.04em]">1 tela</div>
                <div className="mt-1 text-xs text-[#b0c8c0]">para o essencial</div>
              </div>
              <div className="col-span-2 rounded-xl border border-[#cbdcd6] bg-[#e9f4ef] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Seu próximo movimento</div>
                    <div className="mt-1 text-xs text-[#71807d]">PE 042/2024 abre em 13 dias</div>
                  </div>
                  <ArrowRight size={18} className="text-[#278f73]" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#dce6e2] px-5 py-7 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 text-xs text-[#71807d] sm:flex-row">
          <span>© 2024 Licita Insight · ambiente demonstrativo</span>
          <span>Feito para equipes que leem antes de agir.</span>
        </div>
      </footer>
    </div>
  );
}
