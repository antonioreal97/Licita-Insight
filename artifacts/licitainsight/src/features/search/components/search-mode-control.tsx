import { useRef, type KeyboardEvent } from 'react';
import { Info, Sparkles } from 'lucide-react';
import type { SearchMode } from '@/api';

/** Single switch to hide the semantic-search affordance entirely. */
export const SEARCH_MODE_ENABLED = true;

type Props = {
  /** Requested mode (URL). `undefined` = keyword. */
  mode: SearchMode | undefined;
  /** `meta.searchMode` of the last response — the mode the backend actually applied. */
  appliedMode: SearchMode | undefined;
  onChange: (mode: SearchMode | undefined) => void;
};

const OPTIONS: { value: 'keyword' | 'semantic'; label: string; hint: string }[] = [
  { value: 'keyword', label: 'Palavra-chave', hint: 'Encontra os termos exatos digitados' },
  { value: 'semantic', label: 'Semântica', hint: 'Entende o sentido da busca (beta)' },
];

/**
 * Search mode segmented control (radiogroup, arrow-key navigation) + fallback notice when the
 * backend answered a semantic request with keyword results.
 */
export function SearchModeControl({ mode, appliedMode, onChange }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!SEARCH_MODE_ENABLED) return null;
  const current = mode && mode !== 'keyword' ? 'semantic' : 'keyword';
  const fellBack = current === 'semantic' && appliedMode !== undefined && appliedMode === 'keyword';

  const onKeyDown = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = current === 'keyword' ? 'semantic' : 'keyword';
    onChange(next === 'keyword' ? undefined : next);
    refs.current[OPTIONS.findIndex((o) => o.value === next)]?.focus();
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div role="radiogroup" aria-label="Modo de busca" className="inline-flex rounded-lg border border-border bg-muted/60 p-0.5" onKeyDown={onKeyDown}>
        {OPTIONS.map((option, index) => {
          const checked = current === option.value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              title={option.hint}
              data-testid={`radio-search-mode-${option.value}`}
              onClick={() => onChange(option.value === 'keyword' ? undefined : option.value)}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${checked ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {option.value === 'semantic' && <Sparkles size={13} aria-hidden className={checked ? 'text-primary' : ''} />}
              {option.label}
              {option.value === 'semantic' && (
                <span className="rounded bg-primary/10 px-1 py-px font-mono text-[9px] uppercase tracking-wide text-primary">beta</span>
              )}
            </button>
          );
        })}
      </div>
      {fellBack && (
        <p role="status" data-testid="text-search-mode-fallback" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info size={13} aria-hidden />
          Busca semântica indisponível no momento — exibindo resultados por palavra-chave.
        </p>
      )}
    </div>
  );
}
