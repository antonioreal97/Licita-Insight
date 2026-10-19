import React, { useEffect, useId, useState } from 'react';
import { ArrowUpRight, BookOpen, Info, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  FIRST_STEPS,
  GLOSSARY,
  GLOSSARY_DISCLAIMER,
  glossaryById,
  type GlossaryCategory,
  type GlossaryEntry,
} from './glossary';
import { glossaryAnchor } from './components/glossary-term';
import { GlossaryScope, GlossaryText } from './components/glossary-text';
import { searchGlossary } from './lib/glossary-search';
import { HELP_FAQ, HELP_PATHS, PROCESS_TRACKS, SOURCE_GUIDES, type SourceGuide } from './guide-data';

export const HELP_TITLE = 'Ajuda para vender ao governo e captar recursos · Pardal Digital';
export const HELP_DESCRIPTION =
  'Aprenda a participar de pregões, dispensas e chamadas de fomento. Consulte termos do PNCP, Mapas Culturais, FINEP, CNPq, CAPES e fontes internacionais.';

/** SPA route: sets the description while the page is open and puts the previous one back on the way out. */
function useMetaDescription(content: string) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) return;
    const previous = meta.content;
    meta.content = content;
    return () => {
      meta.content = previous;
    };
  }, [content]);
}

/** Opens and focuses a glossary entry reached from another part of the app. */
function useHashFocus() {
  useEffect(() => {
    const focusHash = () => {
      if (!window.location.hash) return;
      const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (!target) return;
      if (target instanceof HTMLDetailsElement) target.open = true;
      target.scrollIntoView({ block: 'start' });
      const focusTarget = target.querySelector<HTMLElement>('summary') ?? target;
      focusTarget.focus({ preventScroll: true });
    };
    const timer = window.setTimeout(focusHash, 0);
    window.addEventListener('hashchange', focusHash);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('hashchange', focusHash);
    };
  }, []);
}

const linkClass = 'inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring';

function OfficialLinks({ sources, label }: { sources: GlossaryEntry['sources']; label: string }) {
  if (sources.length === 0) return null;
  return (
    <ul aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1 type-meta">
      {sources.map((source) => (
        <li key={`${source.url}-${source.label}`}>
          <a href={source.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {source.label}
            <ArrowUpRight size={13} aria-hidden="true" />
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function EntryArticle({ entry, headingLevel, expanded }: { entry: GlossaryEntry; headingLevel: 'h3' | 'h4'; expanded: boolean }) {
  const Heading = headingLevel;
  return (
    <details
      id={glossaryAnchor(entry.id)}
      open={expanded || undefined}
      className="group scroll-mt-24 border-b border-border-subtle py-1 last:border-0"
      data-testid="glossary-entry"
      data-id={entry.id}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-2 py-3.5 text-left hover:bg-muted focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
        <Heading className="type-ui font-semibold text-foreground">{entry.term}</Heading>
        <span aria-hidden="true" className="shrink-0 type-ui text-muted-foreground group-open:hidden">+</span>
        <span aria-hidden="true" className="hidden shrink-0 type-ui text-muted-foreground group-open:inline">▴</span>
      </summary>
      <div className="max-w-3xl px-2 pb-5">
        <p className="type-body text-foreground/90">{entry.definition}</p>
        <p className="mt-2 type-body text-foreground/90">
          <span className="font-semibold text-foreground">O que fazer: </span>
          {entry.whatToDo}
        </p>
        <div className="mt-3">
          <OfficialLinks sources={entry.sources} label={`Fontes oficiais sobre ${entry.term}`} />
        </div>
      </div>
    </details>
  );
}

function ProcessGuide() {
  const [activeId, setActiveId] = useState(PROCESS_TRACKS[0]!.id);
  const active = PROCESS_TRACKS.find((track) => track.id === activeId) ?? PROCESS_TRACKS[0]!;
  const moveTab = (currentIndex: number, direction: -1 | 1) => {
    const nextIndex = (currentIndex + direction + PROCESS_TRACKS.length) % PROCESS_TRACKS.length;
    const next = PROCESS_TRACKS[nextIndex]!;
    setActiveId(next.id);
    document.getElementById(`processo-${next.id}-tab`)?.focus();
  };
  return (
    <div className="mt-8">
      <h3 className="type-title text-foreground">Veja como cada processo acontece</h3>
      <p className="mt-1 max-w-3xl type-meta text-muted-foreground">A sequência abaixo é uma orientação geral. O edital ou a chamada pode prever etapas diferentes.</p>
      <div className="mt-4 border-b border-border" role="tablist" aria-label="Tipo de oportunidade">
        <div className="flex gap-5 overflow-x-auto">
          {PROCESS_TRACKS.map((track, index) => (
            <button
              key={track.id}
              type="button"
              role="tab"
              id={`processo-${track.id}-tab`}
              aria-selected={track.id === active.id}
              aria-controls={`processo-${track.id}-painel`}
              tabIndex={track.id === active.id ? 0 : -1}
              onClick={() => setActiveId(track.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  moveTab(index, 1);
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  moveTab(index, -1);
                } else if (event.key === 'Home' || event.key === 'End') {
                  event.preventDefault();
                  const next = event.key === 'Home' ? PROCESS_TRACKS[0]! : PROCESS_TRACKS[PROCESS_TRACKS.length - 1]!;
                  setActiveId(next.id);
                  document.getElementById(`processo-${next.id}-tab`)?.focus();
                }
              }}
              className={`shrink-0 border-b-2 px-1 pb-3 type-ui font-semibold focus-visible:focus-ring ${
                track.id === active.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {track.title}
            </button>
          ))}
        </div>
      </div>
      {PROCESS_TRACKS.map((track) => (
        <div
          key={track.id}
          id={`processo-${track.id}-painel`}
          role="tabpanel"
          aria-labelledby={`processo-${track.id}-tab`}
          hidden={track.id !== active.id}
          className="rounded-b-2xl border border-t-0 border-border bg-card p-5 sm:p-6"
        >
          <p className="max-w-3xl type-body text-foreground/90">{track.summary}</p>
          <ol className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {track.stages.map((stage, index) => (
              <li key={stage.title} className="grid grid-cols-[1.75rem_1fr] gap-3">
                <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-pill bg-primary-subtle type-ui font-semibold text-primary-subtle-foreground">
                  {index + 1}
                </span>
                <div>
                  <h4 className="type-ui font-semibold text-foreground">{stage.title}</h4>
                  <p className="mt-1 type-meta text-foreground/90">{stage.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <p role="note" className="mt-6 border-l-4 border-primary bg-muted px-4 py-3 type-meta text-foreground">
            <span className="font-semibold">Preste atenção: </span>
            {track.attention}
          </p>
        </div>
      ))}
    </div>
  );
}

function SourceTerms({ guide }: { guide: SourceGuide }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 type-meta">
      {guide.termIds.map((termId) => {
        const entry = glossaryById.get(termId);
        if (!entry) return null;
        return (
          <li key={termId}>
            <a href={`#${glossaryAnchor(termId)}`} className="font-semibold text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:focus-ring">
              {entry.term}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function SourceGuideSection({ scope }: { scope: 'national' | 'international' }) {
  const national = scope === 'national';
  const guides = SOURCE_GUIDES.filter((guide) => guide.scope === scope);
  return (
    <section id={national ? 'fontes-nacionais' : 'fontes-internacionais'} aria-labelledby={`${scope}-titulo`} className="scroll-mt-24">
      <h2 id={`${scope}-titulo`} className="type-section text-foreground">
        {national ? 'Termos das fontes nacionais' : 'Termos das fontes internacionais'}
      </h2>
      <p className="mt-2 max-w-3xl type-body text-muted-foreground">
        {national
          ? 'Cada portal chama pessoas, etapas e recursos de um jeito. Use este mapa para saber o que você está vendo e onde a inscrição acontece.'
          : 'Nas fontes internacionais, o idioma e as siglas mudam. A página original do aviso define elegibilidade, documentos e canal de envio.'}
      </p>
      <div className="mt-5 overflow-hidden rounded-xl border border-border bg-card">
        {guides.map((guide) => (
          <article key={guide.id} className="grid gap-4 border-b border-border-subtle p-5 last:border-0 sm:p-6 md:grid-cols-[minmax(11rem,0.7fr)_minmax(0,1.8fr)] md:gap-8">
            <div>
              <h3 className="type-title text-foreground">{guide.sources}</h3>
              <div className="mt-3">
                <OfficialLinks sources={guide.officialLinks} label={`Fontes oficiais de ${guide.sources}`} />
              </div>
            </div>
            <div>
              <p className="type-body text-foreground/90">{guide.purpose}</p>
              <p className="mt-2 type-meta text-foreground/90">
                <span className="font-semibold text-foreground">Como participar: </span>
                {guide.howToApply}
              </p>
              <p className="mt-3 type-meta text-muted-foreground">
                <span className="font-semibold text-foreground">Palavras que aparecem: </span>
                {guide.vocabulary.join(', ')}.
              </p>
              <SourceTerms guide={guide} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Public learning page for procurement, funding calls and the searchable glossary. */
export default function HelpPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | GlossaryCategory>('all');
  const inputId = useId();
  const categoryId = useId();
  const resultsId = useId();
  const searching = query.trim().length > 0;
  const searched = searchGlossary(query);
  const results = category === 'all' ? searched : searched.filter((entry) => entry.category === category);
  const primaryPath = HELP_PATHS[0]!;
  useMetaDescription(HELP_DESCRIPTION);
  useHashFocus();

  const clearGlossaryFilters = () => {
    setQuery('');
    setCategory('all');
  };

  return (
    <div className="space-y-14 sm:space-y-16">
      <header className="border-b border-border pb-8">
        <div className="flex items-center gap-2 type-eyebrow text-primary">
          <BookOpen size={15} aria-hidden="true" /> Central de ajuda
        </div>
        <h1 className="mt-3 max-w-4xl type-titulo-3 text-foreground">Ajuda para participar de oportunidades públicas</h1>
        <p className="mt-3 max-w-3xl type-body text-muted-foreground">
          Entenda o caminho para vender ao governo, inscrever projetos de fomento e interpretar os termos de cada fonte acompanhada pelo Pardal Digital.
        </p>
        <p role="note" className="mt-5 flex max-w-4xl gap-2.5 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-foreground" data-testid="text-help-disclaimer">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          {GLOSSARY_DISCLAIMER}
        </p>
      </header>

      <section aria-labelledby="objetivo-titulo">
        <h2 id="objetivo-titulo" className="type-section text-foreground">Por onde você quer começar?</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-[1.25fr_1fr]">
          <a href={primaryPath.href} className="group flex min-h-52 flex-col justify-between rounded-2xl bg-inverse p-6 text-inverse-foreground focus-visible:focus-ring sm:p-7">
            <div>
              <h3 className="type-titulo-3">{primaryPath.title}</h3>
              <p className="mt-3 max-w-xl type-body text-inverse-foreground/90">{primaryPath.description}</p>
            </div>
            <span className="mt-8 inline-flex items-center gap-1.5 type-ui font-semibold underline-offset-4 group-hover:underline">
              {primaryPath.linkLabel}
              <span aria-hidden="true">→</span>
            </span>
          </a>
          <div className="grid gap-4">
            {HELP_PATHS.slice(1).map((path) => (
              <a key={path.href} href={path.href} className="group rounded-xl border border-border bg-card p-5 hover:bg-muted focus-visible:focus-ring sm:p-6">
                <h3 className="type-title text-foreground">{path.title}</h3>
                <p className="mt-2 type-meta text-foreground/90">{path.description}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 type-meta font-semibold text-primary underline-offset-4 group-hover:underline">
                  {path.linkLabel}
                  <span aria-hidden="true">→</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <GlossaryScope>
        <section id="como-vender" aria-labelledby="como-vender-titulo" className="scroll-mt-24" data-testid="section-first-steps">
          <h2 id="como-vender-titulo" className="type-section text-foreground">Como vender ao governo</h2>
          <p className="mt-2 max-w-3xl type-body text-muted-foreground">
            A preparação é quase a mesma em qualquer portal. Organize a empresa primeiro e depois siga as regras da oportunidade escolhida.
          </p>
          <h3 className="mt-7 type-title text-foreground">Prepare sua base</h3>
          <ol className="mt-4 grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-2">
            {FIRST_STEPS.map((step, index) => (
              <li
                key={step.title}
                className={`flex gap-3 border-b border-border-subtle p-4 last:border-0 sm:p-5 ${index % 2 === 0 ? 'sm:border-r' : ''} ${index >= FIRST_STEPS.length - 2 ? 'sm:border-b-0' : ''}`}
              >
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-primary-subtle type-ui font-semibold text-primary-subtle-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h4 className="type-ui font-semibold text-foreground">{step.title}</h4>
                  <p className="mt-1 type-meta text-foreground/90">
                    <GlossaryText>{step.text}</GlossaryText>
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 type-meta text-muted-foreground">Selecione os termos sublinhados para ver uma explicação rápida.</p>
          <ProcessGuide />
        </section>
      </GlossaryScope>

      <SourceGuideSection scope="national" />
      <SourceGuideSection scope="international" />

      <section aria-labelledby="duvidas-titulo">
        <h2 id="duvidas-titulo" className="type-section text-foreground">Dúvidas comuns</h2>
        <div className="mt-4 max-w-4xl rounded-xl border border-border bg-card px-4 sm:px-6">
          {HELP_FAQ.map((item) => (
            <details key={item.question} className="group border-b border-border-subtle py-1 last:border-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-1 py-4 type-ui font-semibold text-foreground hover:text-primary focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
                {item.question}
                <span aria-hidden="true" className="shrink-0 text-muted-foreground group-open:hidden">+</span>
                <span aria-hidden="true" className="hidden shrink-0 text-muted-foreground group-open:inline">▴</span>
              </summary>
              <p className="max-w-3xl px-1 pb-5 type-body text-foreground/90">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="glossario" aria-labelledby="glossario-titulo" className="scroll-mt-24" data-testid="section-glossary">
        <h2 id="glossario-titulo" className="type-section text-foreground">Glossário</h2>
        <p className="mt-2 max-w-3xl type-body text-muted-foreground">Busque uma sigla, uma palavra do edital ou o nome de uma fonte. Abra só os termos que quiser consultar.</p>
        <form role="search" onSubmit={(event) => event.preventDefault()} className="mt-5 grid max-w-4xl gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(14rem,1fr)]">
          <div>
            <label htmlFor={inputId} className="mb-1.5 block type-meta font-semibold text-foreground">Buscar termo</label>
            <div className="relative">
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={inputId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ex.: SICAF, captação, EOI ou recurso"
                aria-controls={resultsId}
                className="h-10 pl-9"
                data-testid="input-glossary-search"
              />
            </div>
          </div>
          <div>
            <label htmlFor={categoryId} className="mb-1.5 block type-meta font-semibold text-foreground">Filtrar por assunto</label>
            <select
              id={categoryId}
              value={category}
              onChange={(event) => setCategory(event.target.value as 'all' | GlossaryCategory)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 type-ui text-foreground focus-visible:focus-ring"
              data-testid="select-glossary-category"
            >
              <option value="all">Todos os assuntos</option>
              {CATEGORY_ORDER.map((item) => <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>)}
            </select>
          </div>
        </form>
        <p aria-live="polite" className="mt-3 type-meta text-muted-foreground" data-testid="text-glossary-count">
          {results.length === 0
            ? `Nenhum termo encontrado${query.trim() ? ` para “${query.trim()}”` : ' neste assunto'}.`
            : `${results.length} ${results.length === 1 ? 'termo encontrado' : 'termos encontrados'}.`}
        </p>

        <div id={resultsId} className="mt-2 max-w-4xl">
          {searching || category !== 'all' ? (
            results.map((entry) => <EntryArticle key={entry.id} entry={entry} headingLevel="h3" expanded={searching} />)
          ) : (
            CATEGORY_ORDER.map((item) => {
              const entries = GLOSSARY.filter((entry) => entry.category === item);
              if (entries.length === 0) return null;
              return (
                <section key={item} aria-labelledby={`categoria-${item}`} className="mt-7 first:mt-4">
                  <h3 id={`categoria-${item}`} className="type-eyebrow text-muted-foreground">{CATEGORY_LABELS[item]}</h3>
                  <div className="mt-1">
                    {entries.map((entry) => <EntryArticle key={entry.id} entry={entry} headingLevel="h4" expanded={false} />)}
                  </div>
                </section>
              );
            })
          )}
        </div>
        {results.length === 0 && (
          <button type="button" onClick={clearGlossaryFilters} className="mt-3 type-meta font-semibold text-primary hover:underline focus-visible:focus-ring">
            Limpar busca e filtro
          </button>
        )}
      </section>
    </div>
  );
}
