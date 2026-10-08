import React, { type ComponentPropsWithRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Product Button — the one feature code should use.
 *
 * `components/ui/button` (shadcn) stays as the internal primitive that shadcn composites
 * (pagination, alert-dialog, calendar, carousel, sidebar, input-group) import. Do not use it in features.
 * Spec: /design-system/components.md#button
 */
export type ActionButtonVariant = 'primary' | 'outline' | 'ghost' | 'dark' | 'destructive';
export type ActionButtonSize = 'sm' | 'md' | 'lg';

export type ActionButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  /** Shows a spinner, sets aria-busy and blocks interaction while keeping the label (no layout shift). */
  loading?: boolean;
};

const base =
  'relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg font-semibold ' +
  'transition-[background-color,border-color,color,box-shadow,scale] duration-fast ease-standard ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress ' +
  '[&_svg]:pointer-events-none [&_svg]:shrink-0';

const variants: Record<ActionButtonVariant, string> = {
  primary: 'bg-action text-action-foreground shadow-xs enabled:hover:bg-action-hover enabled:active:bg-action-active',
  dark: 'bg-inverse text-inverse-foreground shadow-xs enabled:hover:bg-inverse-hover',
  outline:
    'border border-border bg-surface text-foreground shadow-2xs enabled:hover:border-border-strong enabled:hover:bg-surface-sunken aria-pressed:border-primary/40 aria-pressed:bg-primary-subtle aria-pressed:text-primary-subtle-foreground',
  ghost: 'text-muted-foreground enabled:hover:bg-muted enabled:hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground',
  destructive: 'bg-destructive text-destructive-foreground shadow-xs enabled:hover:bg-destructive/90 enabled:active:bg-destructive',
};

const sizes: Record<ActionButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-xs',
  md: 'h-9 gap-2 px-3.5 text-[length:var(--type-ui-size)]',
  lg: 'h-11 gap-2 px-5 text-sm',
};

export const Button = ({ children, variant = 'primary', size = 'md', loading = false, className, disabled, ...props }: ActionButtonProps) => (
  <button
    {...props}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    data-variant={variant}
    data-size={size}
    className={cn(base, variants[variant], sizes[size], className)}
  >
    {loading && <Loader2 aria-hidden="true" className="absolute size-4 animate-spin" />}
    <span className={cn('inline-flex items-center gap-[inherit]', loading && 'invisible')}>{children}</span>
  </button>
);
