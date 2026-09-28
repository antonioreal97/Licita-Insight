import { CircleAlert, RefreshCw } from 'lucide-react';
import { isApiError } from '@/api';
import { Button } from '@/components/common/action-button';

const errorBox =
  'flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-4 py-3 type-meta text-destructive-subtle-foreground';

export const withRef = (message: string, error: unknown) => (isApiError(error) && error.requestId ? `${message} (ref. ${error.requestId})` : message);

/** A failed query inside a block: the real message with `ref.` and a retry, while the rest of the block stays usable. */
export function ErrorLine({ message, onRetry, testId }: { message: string; onRetry: () => void; testId: string }) {
  return (
    <div role="alert" className={errorBox} data-testid={testId}>
      <span className="flex gap-2">
        <CircleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
        {message}
      </span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw size={14} aria-hidden="true" />
        Tentar de novo
      </Button>
    </div>
  );
}
