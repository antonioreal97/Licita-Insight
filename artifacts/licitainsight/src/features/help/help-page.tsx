import React, { useEffect, useId, useState } from 'react';
import { ArrowUpRight, BookOpen, Info, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CATEGORY_LABELS, CATEGORY_ORDER, FIRST_STEPS, GLOSSARY, GLOSSARY_DISCLAIMER, type GlossaryEntry } from './glossary';
import { glossaryAnchor } from './components/glossary-term';
import { GlossaryScope, GlossaryText } from './components/glossary-text';
import { searchGlossary } from './lib/glossary-search';

export const HELP_TITLE = 'Ajuda e glossário de licitações · Pardal Digital';
export const HELP_DESCRIPTION =
  'Glossário de licitações em linguagem simples (SICAF, certidões, ME/EPP, pregão, dispensa, recurso) e os primeiros passos para vender ao governo.';

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

/**
 * Opening /ajuda#termo-x from a popover elsewhere scrolls to the entry and moves focus there. Deferred one tick: the
 * route change focuses <main> (App.tsx) after this page's effects run.
 */
function useHashFocus() {
  useEffect(() => {
    if (!window.location.hash) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
      if (!target) return;
      target.scrollIntoView({ block: 'start' });
      target.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
}

const linkClass = 'inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring';

function EntryArticle({ entry, headingLevel }: { entry: GlossaryEntry; headingLevel: 'h3' | 'h4' }) {
  const Heading = headingLevel;
  return (
    <article
      id={glossaryAnchor(entry.id)}
      tabIndex={-1}
      aria-labelledby={`${glossaryAnchor(entry.id)}-titulo`}
      className="scroll-mt-24 border-b border-border-subtle py-5 outline-none last:border-0"
      data-testid="glossary-entry"
      data-id={entry.id}
    >
      <Heading id={`${glossaryAnchor(entry.id)}-titulo`} className="type-ui font-semibold text-foreground">
        {entry.term}
      </Heading>
      <p className="mt-1.5 max-w-3xl type-body text-foreground/90">{entry.definition}</p>
      <p className="mt-2 max-w-3xl type-body text-foreground/90">
        <span className="font-semibold text-foreground">O que fazer: </span>
        {entry.whatToDo}
      </p>
      {entry.sources.length > 0 && (
        <ul aria-label={`Fontes oficiais sobre ${entry.term}`} className="mt-2 flex flex-wrap gap-x-4 gap-y-1 type-meta">
          {entry.sources.map((source) => (
            <li key={`${source.url}-${source.label}`}>
              <a href={source.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {source.label}
                <ArrowUpRight size={13} aria-hidden="true" />
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** Public page: "Primeiros passos para vender ao governo" and the searchable glossary. */
export default function HelpPage() {
  const [query, setQuery] = useState('');
  const inputId = useId();
  const resultsId = useId();
  const results = searchGlossary(query);
  const searching = query.trim().length > 0;
  useMetaDescription(HELP_DESCRIPTION);
  useHashFocus();

  return (
    <div className="space-y-10">
      <header className="border-b border-border pb-6">
        <div className="flex items-center gap-2 type-eyebrow text-primary">
          <BookOpen size={15} aria-hidden="true" /> Ajuda
        </div>
        <h1 className="mt-3 type-titulo-3 text-foreground">Ajuda e glossário de licitações</h1>
        <p className="mt-2 max-w-3xl type-body text-muted-foreground">
          O básico para quem nunca vendeu ao governo: os primeiros passos e o significado, em linguagem simples, dos termos que aparecem nos editais.
        </p>
        <p role="note" className="mt-4 flex max-w-3xl gap-2.5 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-foreground" data-testid="text-help-disclaimer">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          {GLOSSARY_DISCLAIMER}
        </p>
      </header>

      <GlossaryScope>
        <section aria-labelledby="primeiros-passos" data-testid="section-first-steps">
          <h2 id="primeiros-passos" className="type-section text-foreground">
            Primeiros passos para vender ao governo
          </h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {FIRST_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-primary-subtle type-ui font-semibold text-primary-subtle-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="type-ui font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-1 type-meta text-foreground/90">
                    <GlossaryText>{step.text}</GlossaryText>
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 type-meta text-muted-foreground">Toque nos termos sublinhados para ver a definição.</p>
        </section>
      </GlossaryScope>

      <section aria-labelledby="glossario" data-testid="section-glossary">
        <h2 id="glossario" className="type-section text-foreground">
          Glossário
        </h2>
        <form role="search" onSubmit={(event) => event.preventDefault()} className="relative mt-4 max-w-xl">
          <label htmlFor={inputId} className="sr-only">
            Buscar no glossário
          </label>
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar termo, por exemplo: certidão, SICAF, recurso"
            aria-controls={resultsId}
            className="h-10 pl-9"
            data-testid="input-glossary-search"
          />
        </form>
        <p aria-live="polite" className="mt-2 type-meta text-muted-foreground" data-testid="text-glossary-count">
          {searching
            ? results.length === 0
              ? `Nenhum termo encontrado para “${query.trim()}”.`
              : `${results.length} ${results.length === 1 ? 'termo encontrado' : 'termos encontrados'}.`
            : `${GLOSSARY.length} termos.`}
        </p>

        <div id={resultsId} className="mt-2">
          {searching ? (
            results.length > 0 && (
              <div>
                {results.map((entry) => (
                  <EntryArticle key={entry.id} entry={entry} headingLevel="h3" />
                ))}
              </div>
            )
          ) : (
            CATEGORY_ORDER.map((category) => {
              const entries = GLOSSARY.filter((entry) => entry.category === category);
              if (entries.length === 0) return null;
              return (
                <section key={category} aria-labelledby={`categoria-${category}`} className="mt-6">
                  <h3 id={`categoria-${category}`} className="type-eyebrow text-muted-foreground">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <div>
                    {entries.map((entry) => (
                      <EntryArticle key={entry.id} entry={entry} headingLevel="h4" />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
        {searching && results.length === 0 && (
          <button type="button" onClick={() => setQuery('')} className="mt-2 type-meta font-semibold text-primary hover:underline focus-visible:focus-ring">
            Limpar busca
          </button>
        )}
      </section>
    </div>
  );
}
