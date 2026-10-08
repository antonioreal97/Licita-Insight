import React, { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import type { ProfileKeywordSuggestion } from '@/api';
import { cn } from '@/lib/utils';
import { useProfileKeywordSuggestions } from '../hooks/use-company-profile';
import { moveComboboxIndex } from './keyword-combobox-state';

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();

export function SmartKeywordCombobox({
  label,
  hint,
  placeholder,
  selected,
  onChange,
  onSuggestionSelected,
  testId,
}: {
  label: string;
  hint: string;
  placeholder: string;
  selected: string[];
  onChange: (terms: string[]) => void;
  onSuggestionSelected?: (suggestion: ProfileKeywordSuggestion) => void;
  testId: string;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const result = useProfileKeywordSuggestions(debounced);
  const suggestions = (result.data?.data ?? []).filter((suggestion) => !selected.some((term) => fold(term) === suggestion.normalizedTerm));
  const listId = `${id}-listbox`;
  const choose = (suggestion: ProfileKeywordSuggestion) => {
    if (selected.length >= 20) return;
    onChange([...selected, suggestion.displayTerm]);
    onSuggestionSelected?.(suggestion);
    setQuery('');
    setDebounced('');
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const direction = event.key;
      setActive((current) => moveComboboxIndex(current, direction, suggestions.length));
    } else if (event.key === 'Enter' && open && active >= 0 && suggestions[active]) {
      event.preventDefault();
      choose(suggestions[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    } else if (event.key === 'Backspace' && !query && selected.length > 0) {
      onChange(selected.slice(0, -1));
    }
  };

  return (
    <div>
      <label htmlFor={`${id}-input`} className="block type-meta font-semibold text-muted-foreground">
        {label}
      </label>
      <p id={`${id}-hint`} className="mt-1 type-meta text-muted-foreground">
        {hint}
      </p>
      {selected.length > 0 && (
        <ul aria-label={`${label} selecionadas`} className="mt-2.5 flex flex-wrap gap-1.5" data-testid={`${testId}-list`}>
          {selected.map((term) => (
            <li
              key={term}
              className="inline-flex items-center gap-1 rounded-full bg-primary-subtle py-1 pr-1 pl-2.5 text-xs font-medium text-primary-subtle-foreground"
            >
              {term}
              <button
                type="button"
                aria-label={`Remover ${term}`}
                onClick={() => onChange(selected.filter((item) => item !== term))}
                className="grid size-5 place-items-center rounded-full hover:bg-foreground/10 focus-visible:focus-ring"
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative mt-2.5">
        <input
          id={`${id}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
          aria-describedby={`${id}-hint`}
          value={query}
          disabled={selected.length >= 20}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(event.target.value.trim().length >= 2);
            setActive(-1);
          }}
          onFocus={() => setOpen(query.trim().length >= 2)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          placeholder={selected.length >= 20 ? 'Limite de 20 termos' : placeholder}
          data-testid={`${testId}-input`}
          className="h-[2.625rem] w-full rounded-lg border border-input bg-background px-3 pr-9 type-ui text-foreground focus:border-ring"
        />
        {result.isFetching && <LoaderCircle aria-label="Buscando sugestões" size={16} className="absolute top-3 right-3 animate-spin text-muted-foreground" />}
        {open && debounced.length >= 2 && (
          <div
            id={listId}
            role="listbox"
            aria-label={`Sugestões para ${label}`}
            className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          >
            {suggestions.length === 0 && !result.isFetching ? (
              <p className="px-3 py-2 type-meta text-muted-foreground">Nenhum termo da base encontrado.</p>
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
                  className={cn('flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left', active === index && 'bg-accent')}
                >
                  <span>
                    <span className="block type-ui font-medium text-foreground">{suggestion.displayTerm}</span>
                    <span className="block type-meta text-muted-foreground">
                      {suggestion.related ? 'Relacionado · ' : ''}
                      {suggestion.predominantCategory?.label ?? 'Várias categorias'}
                    </span>
                  </span>
                  <span className="shrink-0 type-data text-muted-foreground">{suggestion.openTenderCount.toLocaleString('pt-BR')}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
