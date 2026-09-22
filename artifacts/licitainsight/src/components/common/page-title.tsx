import type { ReactNode } from 'react';

export function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-foreground sm:text-[32px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
