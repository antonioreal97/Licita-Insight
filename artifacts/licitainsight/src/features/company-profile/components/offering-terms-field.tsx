import React, { useEffect, useState, type KeyboardEvent } from 'react';
import { LoaderCircle, Plus, X } from 'lucide-react';
import type { ProfileKeywordSuggestion } from '@/api';
import { Button } from '@/components/common/action-button';
import { cn } from '@/lib/utils';
import { PROFILE_LIMITS } from '@/services/ai-service';
import { useProfileKeywordSuggestions } from '../hooks/use-company-profile';
import { moveComboboxIndex } from './keyword-combobox-state';
import {
  addSuggestedTerm,
  addTypedTerms,
  combinedOfferingTerms,
  foldTerm,
  OFFERING_TERMS_LIMIT,
  removeOfferingTerm,
  type OfferingLists,
} from './offering-terms-state';

/**
 * One field for what the company sells or does: autocomplete from the edital vocabulary and free entry in the same
 * input (Enter or comma). Storage rules live in `offering-terms-state.ts`.
 */
export function OfferingTermsField({
  id,
  lists,
  onChange,
  error,
  testId = 'offering-terms',
}: {
  id: string;
  lists: OfferingLists;
  onChange: (lists: OfferingLists) => void;
  error?: string;
  testId?: string;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const result = useProfileKeywordSuggestions(debounced);
  const terms = combinedOfferingTerms(lists);
  const full = terms.length >= OFFERING_TERMS_LIMIT;
  const chosen = new Set(terms.map(foldTerm));
  const suggestions = (result.data?.data ?? []).filter((suggestion) => !chosen.has(suggestion.normalizedTerm));
  const listId = `${id}-listbox`;
  const describedBy = [`${id}-hint`, `${id}-count`, error ? `${id}-error` : null].filter(Boolean).join(' ');

  const reset = () => {
    setQuery('');
    setDebounced('');
    setOpen(false);
    setActive(-1);
  };
  const choose = (suggestion: ProfileKeywordSuggestion) => {
    onChange(addSuggestedTerm(lists, suggestion.displayTerm));
    setNote(null);
    reset();
  };
  const addTyped = () => {
    if (!query.trim()) return;
    const vocabulary = new Map((result.data?.data ?? []).map((suggestion) => [suggestion.normalizedTerm, suggestion.displayTerm]));
    const added = addTypedTerms(lists, query, vocabulary);
    onChange(added.lists);
    setNote(
      added.skipped > 0
        ? `${added.skipped === 1 ? '1 termo ficou de fora' : `${added.skipped} termos ficaram de fora`}: repetido, fora de ${PROFILE_LIMITS.termMin}–${PROFILE_LIMITS.termMax} caracteres ou acima de ${OFFERING_TERMS_LIMIT}.`
        : null,
    );
    reset();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const direction = event.key;
      setActive((current) => moveComboboxIndex(current, direction, suggestions.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && active >= 0 && suggestions[active]) choose(suggestions[active]);
      else addTyped();
    } else if (event.key === ',' || event.key === ';') {
      event.preventDefault();
      addTyped();
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (event.key === 'Backspace' && !query && terms.length > 0) {
      onChange(removeOfferingTerm(lists, terms[terms.length - 1]!));
    }
  };

  return (
    <div data-testid={testId}>
      <label htmlFor={id} className="block type-meta font-semibold text-muted-foreground">
        O que sua empresa vende ou faz
      </label>
      <p id={`${id}-hint`} className="mt-1 type-meta text-muted-foreground">
        Os termos que aparecem nos editais que interessam, como “limpeza predial” ou “transmissão ao vivo”. Cada termo vale como expressão inteira. Escolha
        uma sugestão da base ou digite e tecle Enter ou vírgula.
      </p>
      {terms.length > 0 && (
        <ul aria-label="Termos da empresa" className="mt-2.5 flex flex-wrap gap-1.5" data-testid={`${testId}-list`}>
          {terms.map((term) => (
            <li
              key={foldTerm(term)}
              className="inline-flex items-center gap-1 rounded-pill bg-primary-subtle py-1 pr-1 pl-2.5 text-xs font-medium text-primary-subtle-foreground"
            >
              {term}
              <button
                type="button"
                aria-label={`Remover ${term}`}
                onClick={() => onChange(removeOfferingTerm(lists, term))}
                className="grid size-5 place-items-center rounded-full transition-colors duration-fast ease-standard hover:bg-foreground/10 focus-visible:focus-ring"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            value={query}
            disabled={full}
            maxLength={400}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(event.target.value.trim().length >= 2);
              setActive(-1);
            }}
            onFocus={() => setOpen(query.trim().length >= 2)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
              if (query.trim()) addTyped();
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            placeholder={full ? `Limite de ${OFFERING_TERMS_LIMIT} termos` : 'Ex.: limpeza predial, iluminação cênica'}
            data-testid={`${testId}-input`}
            className="h-[2.625rem] w-full rounded-lg border border-input bg-background px-3 pr-9 type-ui text-foreground transition-[border-color,box-shadow] duration-fast ease-standard placeholder:text-muted-foreground focus:border-ring aria-[invalid=true]:border-destructive disabled:cursor-not-allowed disabled:opacity-50 dark:bg-card"
          />
          {result.isFetching && <LoaderCircle aria-label="Buscando sugestões" size={16} className="absolute top-3 right-3 animate-spin text-muted-foreground" />}
          {open && debounced.length >= 2 && (
            <div
              id={listId}
              role="listbox"
              aria-label="Sugestões do vocabulário dos editais"
              className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1"
            >
              {suggestions.length === 0 && !result.isFetching ? (
                <p className="px-3 py-2 type-meta text-muted-foreground">Nenhum termo da base. Tecle Enter para adicionar “{query.trim()}”.</p>
              ) : (
                suggestions.map((suggestion, index) => (
                  <button
                    id={`${id}-option-${index}`}
                    role="option"
                    aria-selected={active === index}
                    type="button"
                    key={suggestion.normalizedTerm}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(suggestion)}
                    className={cn('flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left', active === index && 'bg-accent')}
                  >
                    <span>
                      <span className="block type-ui font-medium text-foreground">{suggestion.displayTerm}</span>
                      <span className="block type-meta text-muted-foreground">
                        {suggestion.related ? 'Relacionado · ' : ''}
                        {suggestion.predominantCategory?.label ?? 'Várias categorias'}
                      </span>
                    </span>
                    <span className="shrink-0 type-data text-muted-foreground">{suggestion.openTenderCount.toLocaleString('pt-BR')} editais</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-[2.625rem]"
          disabled={full || !query.trim()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={addTyped}
          data-testid={`${testId}-add`}
        >
          <Plus size={14} aria-hidden="true" />
          Adicionar
        </Button>
      </div>
      <p id={`${id}-count`} className="mt-1.5 type-meta text-muted-foreground" data-testid={`${testId}-count`}>
        {terms.length} de {OFFERING_TERMS_LIMIT} termos
      </p>
      {note && <p className="mt-1 type-meta text-muted-foreground">{note}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 type-meta font-normal text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
