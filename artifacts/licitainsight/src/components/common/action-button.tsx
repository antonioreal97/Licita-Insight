import type { ButtonHTMLAttributes } from 'react';

// DS-DEBT: parallel to components/ui/button (shadcn). Design System Architect to reconcile into one Button.
export type ActionButtonVariant = 'primary' | 'outline' | 'ghost' | 'dark';

export const Button = ({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ActionButtonVariant }) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 ${variant === 'primary' ? 'bg-primary text-primary-foreground hover:brightness-95' : variant === 'dark' ? 'bg-sidebar text-white hover:bg-sidebar/90' : variant === 'outline' ? 'border border-border bg-card text-foreground hover:bg-muted' : 'text-muted-foreground hover:bg-muted hover:text-foreground'} ${className}`}
  >
    {children}
  </button>
);
