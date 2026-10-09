import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Dashed empty box of a list: icon, what is empty and what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-14 text-center" data-testid={testId}>
      <Icon size={20} aria-hidden className="mx-auto text-foreground-subtle" />
      <h2 className="mt-3 type-section text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-md type-ui text-muted-foreground">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
