import type { ReactNode } from 'react';

export function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:mb-7 sm:flex-nowrap">
      {/* Wraps instead of stacking: a compact action shares the title row on phones, a wide one drops below. */}
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 type-eyebrow text-primary">{eyebrow}</div>}
        <h1 className="type-display-sm text-foreground">{title}</h1>
        {description && <p className="mt-2 hidden max-w-2xl type-body text-muted-foreground sm:block">{description}</p>}
      </div>
      {action}
    </div>
  );
}
