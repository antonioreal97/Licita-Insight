import type { ReactNode } from 'react';

export function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-2 type-eyebrow font-bold text-primary">{eyebrow}</div>
        <h1 className="type-display-sm text-foreground">{title}</h1>
        {description && <p className="mt-2 max-w-2xl type-body text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
