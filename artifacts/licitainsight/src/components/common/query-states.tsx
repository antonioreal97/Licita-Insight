import { CircleAlert, RefreshCw } from 'lucide-react';
import { isApiError } from '@/api';
import { Button } from './action-button';

const bar = 'animate-pulse rounded-sm bg-muted';

/**
 * Mirrors `TenderRow` (badge line, title, org, published · value/deadline column · save) so nothing jumps when data arrives.
 * Fades in after 150ms: fast responses never flash a skeleton.
 */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Carregando resultados"
      className="overflow-hidden rounded-xl border border-border bg-card animate-in fade-in fill-mode-both delay-150 duration-fast ease-standard"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-border-subtle px-4 py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_10.5rem_auto] sm:gap-x-5 sm:px-5"
        >
          <div className="min-w-0">
            <div className={`h-5 w-16 rounded-full ${bar}`} />
            <div className={`mt-2 h-4 w-3/4 ${bar}`} />
            <div className={`mt-2 h-3 w-1/2 ${bar}`} />
            <div className={`mt-2 h-3 w-1/3 ${bar}`} />
            {/* Phones: value and deadline sit under the text, as in TenderRow. */}
            <div className="mt-3 flex justify-between border-t border-border-subtle pt-3 sm:hidden">
              <div className={`h-4 w-24 ${bar}`} />
              <div className={`h-3 w-20 ${bar}`} />
            </div>
          </div>
          <div className="hidden flex-col items-end gap-1.5 sm:flex">
            <div className={`h-4 w-24 ${bar}`} />
            <div className={`h-3 w-20 ${bar}`} />
          </div>
          <div className={`h-9 w-9 rounded-md ${bar}`} />
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
    <div
      role="alert"
      className="rounded-xl border border-destructive-subtle-border bg-destructive-subtle px-6 py-12 text-center text-destructive-subtle-foreground"
    >
      <CircleAlert size={20} aria-hidden className="mx-auto" />
      <h2 className="mt-3 type-ui font-semibold">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm type-meta">{detail}</p>
      {onRetry && (
        <Button variant="outline" data-testid="button-retry" onClick={onRetry} className="mt-4">
          <RefreshCw size={14} aria-hidden />
          Tentar novamente
        </Button>
      )}
      {requestId && <div className="mt-3 type-data text-3xs opacity-80">ref. {requestId}</div>}
    </div>
  );
}
