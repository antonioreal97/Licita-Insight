import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Dashed empty box of a list: icon, what is empty and what to do next. */
export function EmptyState({ icon: Icon, title, children, testId }: { icon: LucideIcon; title: string; children: ReactNode; testId?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-14 text-center" data-testid={testId}>
      <Icon size={18} aria-hidden className="mx-auto text-foreground-subtle" />
      <h2 className="mt-3 type-ui font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-md type-meta text-muted-foreground">{children}</p>
    </div>
  );
}
