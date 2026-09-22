import { Search } from 'lucide-react';
import { Button } from '@/components/common/action-button';

export function EmptySearch({ query, hasFilters, onClear }: { query?: string; hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-20 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-secondary text-muted-foreground">
        <Search size={19} />
      </div>
      <h2 className="mt-4 text-base font-semibold">Nenhuma oportunidade encontrada</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {query
          ? `Não encontramos resultados para “${query}”. Tente termos mais amplos ou remova um filtro.`
          : 'Ajuste seus filtros para encontrar novas oportunidades.'}
      </p>
      {hasFilters && (
        <Button variant="outline" data-testid="button-empty-clear" onClick={onClear} className="mt-5">
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
