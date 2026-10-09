import { SearchX } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { formatNumber } from '@/lib/format';
import type { Relaxation } from '../lib/relaxation';

type Props = {
  query?: string;
  hasFilters: boolean;
  /** The filter (or query) whose removal brings back the most results (see hooks/use-relaxation). */
  relaxation: Relaxation | null;
  onRelax: () => void;
  onClearFilters: () => void;
  onClearQuery: () => void;
};

export function EmptySearch({ query, hasFilters, relaxation, onRelax, onClearFilters, onClearQuery }: Props) {
  return (
    <div data-testid="state-empty" className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-14 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-secondary text-muted-foreground">
        <SearchX size={19} aria-hidden />
      </div>
      <h2 className="mt-4 type-section">Nenhuma oportunidade encontrada</h2>
      <p className="mx-auto mt-2 max-w-md type-body text-muted-foreground">
        {query ? <>Não encontramos editais para “{query}”</> : 'Não encontramos editais'}
        {hasFilters ? ' com os filtros aplicados.' : '.'}
      </p>

      {relaxation && (
        <div className="mx-auto mt-5 max-w-md rounded-lg border border-border bg-surface px-4 py-3 text-left type-ui">
          <div className="type-label text-muted-foreground">{relaxation.query ? 'Termo mais restritivo' : 'Filtro mais restritivo'}</div>
          <div className="mt-0.5 font-medium">{relaxation.label}</div>
          {relaxation.estimate !== null && (
            <div className="mt-0.5 type-meta text-muted-foreground">
              Removê-lo mostraria {relaxation.exact ? '' : 'cerca de '}
              {formatNumber(relaxation.estimate)} {relaxation.estimate === 1 ? 'resultado' : 'resultados'}.
            </div>
          )}
          <Button data-testid="button-empty-relax" onClick={onRelax} className="mt-3 w-full sm:w-auto">
            {relaxation.query ? 'Buscar sem este termo' : 'Remover este filtro'}
          </Button>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {hasFilters && (
          <Button variant="outline" data-testid="button-empty-clear" onClick={onClearFilters}>
            Limpar todos os filtros
          </Button>
        )}
        {query && !relaxation?.query && (
          <Button variant="outline" data-testid="button-empty-clear-query" onClick={onClearQuery}>
            Buscar sem “{query.length > 24 ? `${query.slice(0, 24)}…` : query}”
          </Button>
        )}
      </div>

      {query && (
        <ul className="mx-auto mt-6 max-w-sm list-disc space-y-1 pl-4 text-left type-meta text-muted-foreground marker:text-foreground-subtle">
          <li>Confira a grafia ou use sinônimos (ex.: “computadores” em vez de “notebooks”).</li>
          <li>Termos mais genéricos costumam trazer mais editais.</li>
        </ul>
      )}
    </div>
  );
}
