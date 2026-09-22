import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { CloudOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/common/action-button';

const AUTO_RETRY_SECONDS = 30;

/**
 * Degraded state for 503 SEARCH_UNAVAILABLE: the index is down, not the app. Filters are kept in the
 * URL, a countdown retries automatically, and the user is pointed to features that don't need search.
 */
export function SearchUnavailable({ onRetry, retrying, requestId }: { onRetry: () => void; retrying: boolean; requestId?: string }) {
  const [seconds, setSeconds] = useState(AUTO_RETRY_SECONDS);

  useEffect(() => {
    if (retrying) return;
    setSeconds(AUTO_RETRY_SECONDS);
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [retrying]);

  useEffect(() => {
    if (seconds === 0 && !retrying) onRetry();
  }, [seconds, retrying, onRetry]);

  return (
    <div role="alert" data-testid="state-unavailable" className="rounded-xl border border-accent/50 bg-accent/10 px-5 py-10 text-center sm:px-6">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-accent/25 text-foreground">
        <CloudOff size={19} aria-hidden />
      </div>
      <h2 className="mt-4 text-base font-semibold">Busca temporariamente indisponível</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        O índice de licitações está sendo atualizado. Seus filtros foram mantidos e tentaremos de novo automaticamente
        {retrying ? '…' : ` em ${seconds}s.`}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="outline" data-testid="button-retry" onClick={onRetry} disabled={retrying}>
          <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} aria-hidden />
          {retrying ? 'Tentando…' : 'Tentar agora'}
        </Button>
        <Link
          href="/saved-tenders"
          className="inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-[13px] font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Ver editais salvos
        </Link>
      </div>
      {requestId && <div className="mt-3 font-mono text-[10px] text-muted-foreground">ref. {requestId}</div>}
    </div>
  );
}
