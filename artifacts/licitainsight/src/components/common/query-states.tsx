import { CircleAlert, RefreshCw } from 'lucide-react';
import { isApiError } from '@/api';
import { Button } from './action-button';

export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Carregando resultados" className="overflow-hidden rounded-xl border border-border bg-card">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex gap-3 border-b border-border px-5 py-4 last:border-0">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-md bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function describe(error: unknown) {
  if (!isApiError(error)) return { title: 'Não foi possível carregar', detail: 'Ocorreu um erro inesperado.' };
  switch (error.code) {
    case 'NETWORK_ERROR':
      return { title: 'Sem conexão com o servidor', detail: 'Verifique sua conexão e tente novamente.' };
    case 'SEARCH_UNAVAILABLE':
      return { title: 'Busca temporariamente indisponível', detail: 'Estamos atualizando o índice de licitações. Tente em instantes.' };
    case 'RATE_LIMITED':
      return {
        title: 'Muitas consultas seguidas',
        detail: error.retryAfterSeconds ? `Aguarde ${error.retryAfterSeconds}s e tente novamente.` : 'Aguarde alguns segundos e tente novamente.',
      };
    case 'NOT_FOUND':
      return { title: 'Licitação não encontrada', detail: 'Ela pode ter sido removida da fonte original.' };
    case 'INVALID_PARAMETER':
      return { title: 'Filtros inválidos', detail: 'Revise os filtros aplicados.' };
    default:
      return { title: 'Não foi possível carregar', detail: 'Ocorreu um erro no servidor.' };
  }
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, detail } = describe(error);
  const requestId = isApiError(error) ? error.requestId : undefined;
  return (
    <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/[0.04] px-6 py-12 text-center">
      <CircleAlert size={20} className="mx-auto text-destructive" />
      <h2 className="mt-3 text-sm font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{detail}</p>
      {onRetry && (
        <Button variant="outline" data-testid="button-retry" onClick={onRetry} className="mt-4">
          <RefreshCw size={14} />
          Tentar novamente
        </Button>
      )}
      {requestId && <div className="mt-3 font-mono text-[10px] text-muted-foreground">ref. {requestId}</div>}
    </div>
  );
}
