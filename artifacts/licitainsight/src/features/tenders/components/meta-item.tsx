import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  icon?: LucideIcon;
  /** Accessible name of the fact. Visible in `stacked`, screen-reader only in `inline`. */
  label: string;
  children: ReactNode;
  variant?: 'inline' | 'stacked';
  /** Native tooltip, typically the untruncated value. */
  title?: string;
  className?: string;
};

/** A single labelled fact: icon + value inline (lists) or label over value (fact strips). */
export function MetaItem({ icon: Icon, label, children, variant = 'inline', title, className }: Props) {
  if (variant === 'stacked') {
    return (
      <div className={cn('min-w-0', className)}>
        <dt className="label flex items-center gap-1.5">
          {Icon && <Icon size={12} aria-hidden="true" className="shrink-0" />}
          {label}
        </dt>
        <dd title={title} className="mt-1.5 min-w-0 text-sm">
          {children}
        </dd>
      </div>
    );
  }
  return (
    <span title={title} className={cn('inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground', className)}>
      {Icon && <Icon size={13} aria-hidden="true" className="shrink-0" />}
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
