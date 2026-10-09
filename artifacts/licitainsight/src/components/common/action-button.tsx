import React, { type ComponentPropsWithRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The only Button in the app (there is no components/ui/button).
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
  'relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-pill font-semibold ' +
  'transition-[background-color,border-color,color,box-shadow,scale] duration-fast ease-standard ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'not-disabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress ' +
  '[&_svg]:pointer-events-none [&_svg]:shrink-0';

const variants: Record<ActionButtonVariant, string> = {
  primary: 'bg-action text-action-foreground not-disabled:hover:bg-action-hover not-disabled:active:bg-action-active',
  dark: 'bg-inverse text-inverse-foreground not-disabled:hover:bg-inverse-hover',
  outline:
    'border border-border bg-surface text-foreground not-disabled:hover:border-border-strong not-disabled:hover:bg-surface-sunken aria-pressed:border-primary/40 aria-pressed:bg-primary-subtle aria-pressed:text-primary-subtle-foreground',
  ghost: 'text-muted-foreground not-disabled:hover:bg-muted not-disabled:hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground',
  destructive: 'bg-destructive text-destructive-foreground not-disabled:hover:bg-destructive/90 not-disabled:active:bg-destructive',
};

const sizes: Record<ActionButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-xs',
  md: 'h-9 gap-2 px-3.5 text-[length:var(--type-ui-size)]',
  lg: 'h-11 gap-2 px-5 text-sm',
};

/** The Button look for links (`<a>`, wouter `Link`): the Button itself has no `asChild`. */
export const buttonClass = (variant: ActionButtonVariant = 'primary', size: ActionButtonSize = 'md') => cn(base, variants[variant], sizes[size]);

export const Button = ({ children, variant = 'primary', size = 'md', loading = false, className, disabled, ...props }: ActionButtonProps) => (
  <button
    {...props}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    data-variant={variant}
    data-size={size}
    className={cn(buttonClass(variant, size), className)}
  >
    {loading && <Loader2 aria-hidden="true" className="absolute size-4 animate-spin" />}
    <span className={cn('inline-flex items-center gap-[inherit]', loading && 'invisible')}>{children}</span>
  </button>
);
