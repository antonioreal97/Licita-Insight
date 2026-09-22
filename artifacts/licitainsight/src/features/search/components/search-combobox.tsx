import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Building2, History, Loader2, Search, Tag, X, type LucideIcon } from 'lucide-react';
import type { SearchSuggestion } from '@/api';
import { Button } from '@/components/common/action-button';
import { Kbd } from '@/components/ui/kbd';
import { formatNumber } from '@/lib/format';
import { useFocusShortcut } from '../hooks/use-focus-shortcut';
import { useRecentSearches } from '../hooks/use-recent-searches';
import { MIN_SUGGESTION_CHARS, useSearchSuggestions } from '../hooks/use-search-suggestions';

type Option = { kind: 'recent'; value: string; label: string } | ({ kind: 'suggestion' } & SearchSuggestion);

type Props = {
  /** Committed query (from the URL). The draft is local until submitted. */
  value: string;
  onSubmitQuery: (q: string) => void;
  /** Organization/category suggestions become filters instead of free text. */
  onSelectFilter: (suggestion: SearchSuggestion) => void;
};

const suggestionMeta: Record<SearchSuggestion['type'], { icon: LucideIcon; label: string }> = {
  term: { icon: Search, label: 'Termo' },
  organization: { icon: Building2, label: 'Órgão' },
  category: { icon: Tag, label: 'Categoria' },
};

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Bolds the part of `label` that matches `query`, accent/case-insensitively. */
function MatchedText({ label, query }: { label: string; query: string }) {
  const q = fold(query.trim());
  const index = q ? fold(label).indexOf(q) : -1;
  if (index < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, index)}
      <strong className="font-semibold text-foreground">{label.slice(index, index + q.length)}</strong>
      {label.slice(index + q.length)}
    </>
  );
}

/**
 * Search input with autocomplete — WAI-ARIA 1.2 combobox with a listbox popup.
 * ↑/↓ move, Enter picks the active option or submits the text, Esc closes (then clears), "/" focuses from anywhere.
 */
export function SearchCombobox({ value, onSubmitQuery, onSelectFilter }: Props) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const recent = useRecentSearches();
  const suggestions = useSearchSuggestions(draft);

  useFocusShortcut(inputRef);
  useEffect(() => setDraft(value), [value]);

  const trimmed = draft.trim();
  const showRecent = trimmed.length === 0;
  const options = useMemo<Option[]>(() => {
    if (showRecent) return recent.items.map((item) => ({ kind: 'recent', value: item, label: item }));
    if (trimmed.length < MIN_SUGGESTION_CHARS) return [];
    const folded = fold(trimmed);
    const recentMatches: Option[] = recent.items
      .filter((item) => fold(item).includes(folded) && fold(item) !== folded)
      .slice(0, 2)
      .map((item) => ({ kind: 'recent', value: item, label: item }));
    const remote: Option[] = (suggestions.data ?? []).map((s) => ({ kind: 'suggestion', ...s }));
    return [...recentMatches, ...remote];
  }, [showRecent, trimmed, recent.items, suggestions.data]);

  const loading = !showRecent && trimmed.length >= MIN_SUGGESTION_CHARS && (suggestions.isDebouncing || suggestions.isFetching) && options.length === 0;
  const expanded = open && (options.length > 0 || loading);

  useEffect(() => setActive(-1), [trimmed]);
  useEffect(() => {
    if (active >= 0) document.getElementById(`${listboxId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listboxId]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const submitText = (text: string) => {
    close();
    setDraft(text);
    onSubmitQuery(text.trim());
  };

  const choose = (option: Option) => {
    if (option.kind === 'recent' || option.type === 'term') return submitText(option.value);
    close();
    setDraft(value);
    onSelectFilter(option);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitText(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!expanded) setOpen(true);
        if (options.length) setActive((index) => (index + 1) % options.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!expanded) setOpen(true);
        if (options.length) setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
        break;
      case 'Enter':
        // With an active option Enter picks it; otherwise the native form submit runs (never swallowed).
        if (expanded && active >= 0 && options[active]) {
          event.preventDefault();
          choose(options[active]);
        }
        break;
      case 'Escape':
        if (expanded) {
          event.preventDefault();
          close();
        } else if (draft) {
          event.preventDefault();
          setDraft('');
        }
        break;
      case 'Tab':
        close();
        break;
    }
  };

  const activeId = expanded && active >= 0 ? `${listboxId}-${active}` : undefined;

  return (
    <form role="search" aria-label="Pesquisar licitações" onSubmit={onSubmit} className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} aria-hidden />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          role="combobox"
          aria-label="Pesquisar licitações"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-activedescendant={activeId}
          aria-describedby={`${listboxId}-hint`}
          autoComplete="off"
          spellCheck={false}
          data-testid="input-search-tenders"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
          placeholder="Ex.: tecnologia educacional, prefeitura de Recife…"
          className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-20 text-base outline-none ring-primary/25 transition-shadow placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 sm:text-sm"
        />
        <span id={`${listboxId}-hint`} className="sr-only">
          Use as setas para navegar pelas sugestões e Enter para escolher. Atalho: barra (/) para focar a busca.
        </span>
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {suggestions.isFetching && !showRecent && <Loader2 size={14} className="animate-spin text-muted-foreground" aria-hidden />}
          {draft ? (
            <button
              type="button"
              aria-label="Limpar texto da busca"
              data-testid="button-clear-input"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setDraft('');
                setOpen(true);
                inputRef.current?.focus();
              }}
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X size={15} />
            </button>
          ) : (
            <Kbd aria-hidden className="hidden border border-border sm:inline-flex">
              /
            </Kbd>
          )}
        </div>

        {expanded && (
          <div
            // Keep focus in the input while clicking inside the popup.
            onMouseDown={(event) => event.preventDefault()}
            className="absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground" id={`${listboxId}-label`}>
                {showRecent ? 'Buscas recentes' : 'Sugestões'}
              </span>
              {showRecent && (
                <button
                  type="button"
                  data-testid="button-clear-recent"
                  onClick={() => {
                    recent.clear();
                    inputRef.current?.focus();
                  }}
                  className="rounded px-1.5 py-1 text-[11px] font-semibold text-primary hover:bg-muted"
                >
                  Limpar histórico
                </button>
              )}
            </div>
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" aria-hidden /> Buscando sugestões…
              </div>
            ) : (
              <ul id={listboxId} role="listbox" aria-labelledby={`${listboxId}-label`} className="max-h-80 overflow-y-auto p-1">
                {options.map((option, index) => {
                  const meta = option.kind === 'recent' ? { icon: History, label: 'Recente' } : suggestionMeta[option.type];
                  const Icon = meta.icon;
                  const isActive = index === active;
                  return (
                    <li
                      key={`${option.kind}-${option.kind === 'recent' ? '' : option.type}-${option.value}`}
                      id={`${listboxId}-${index}`}
                      role="option"
                      aria-selected={isActive}
                      data-testid={`option-suggestion-${index}`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(option)}
                      className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm ${isActive ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                        <Icon size={14} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground/90">
                        <MatchedText label={option.label} query={trimmed} />
                      </span>
                      {option.kind === 'suggestion' && option.count !== null && (
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{formatNumber(option.count)}</span>
                      )}
                      <span className="hidden shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground sm:inline">
                        {meta.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        <span className="sr-only" aria-live="polite">
          {expanded && !loading ? `${options.length} ${options.length === 1 ? 'sugestão disponível' : 'sugestões disponíveis'}` : ''}
        </span>
      </div>
      <Button type="submit" data-testid="button-submit-search" className="h-11 shrink-0 px-4 sm:px-5">
        <Search size={15} className="sm:hidden" aria-hidden />
        <span className="sr-only sm:not-sr-only">Pesquisar</span>
      </Button>
    </form>
  );
}
