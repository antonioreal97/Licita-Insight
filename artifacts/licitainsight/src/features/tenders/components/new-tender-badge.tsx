import React from 'react';
import { cn } from '@/lib/utils';

export const NEW_TENDER_LABEL = 'Edital novo, entrou nas últimas 24 horas';

export function NewTenderBadge({ isNew, className }: { isNew: boolean; className?: string }) {
  if (!isNew) return null;
  return (
    <span
      aria-label={NEW_TENDER_LABEL}
      title={NEW_TENDER_LABEL}
      data-testid="badge-new-tender"
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill border border-petroleo bg-salvia px-2 py-0.5 type-meta font-bold leading-none text-petroleo',
        className,
      )}
    >
      Novo
    </span>
  );
}
