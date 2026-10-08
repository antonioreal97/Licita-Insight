import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Lock } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { signInWithGoogle } from '@/features/auth/hooks/use-session';
import { usePublicPlan } from '@/features/billing/hooks/use-public-plan';
import { cn } from '@/lib/utils';
import { useOpportunityAccess } from '../hooks/use-opportunities';

/** A link styled as the primary `Button` (the product Button has no `asChild`). */
export const linkButtonClass =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-pill bg-action px-4 py-2 font-semibold text-action-foreground shadow-xs ' +
  'transition-[background-color,scale] duration-fast ease-standard hover:bg-action-hover active:scale-[0.98] active:bg-action-active ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** Why the user can't see cultural calls. No preview of real or invented calls: the panel only explains and offers the next step. */
export function AccessPanel({ reason }: { reason: 'anonymous' | 'no-access' }) {
  const anonymous = reason === 'anonymous';
  // Owner decision: 7-day trial. The API (`/billing/plan`) wins when it answers.
  const trialDays = usePublicPlan().data?.trialDays ?? 7;
  return (
    <section
      data-testid="panel-opportunities-gate"
      data-reason={reason}
      aria-labelledby="opportunities-gate-title"
      className="rounded-xl border border-border bg-card px-5 py-12 text-center sm:px-8"
    >
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
        <Lock size={18} aria-hidden />
      </div>
      <h2 id="opportunities-gate-title" className="mx-auto mt-4 max-w-lg type-section text-foreground">
        {anonymous ? 'Chamadas de fomento cultural fazem parte do acesso ao Pardal Digital.' : 'Seu acesso terminou'}
      </h2>
      <p className="mx-auto mt-2 max-w-md type-body text-muted-foreground">
        {anonymous
          ? `Entre com Google e ganhe ${trialDays} dias de acesso completo.`
          : 'Chamadas de fomento cultural fazem parte do acesso ao Pardal Digital. Assine para voltar a ver as chamadas e a salvar e monitorar editais.'}
      </p>
      {anonymous ? (
        <>
          <Button className="mt-5" onClick={() => signInWithGoogle()} data-testid="button-gate-sign-in">
            Entrar com Google
          </Button>
          <p className="mx-auto mt-3 max-w-md type-meta text-muted-foreground">O teste vale uma vez por conta Google.</p>
        </>
      ) : (
        <Link href="/settings?billing=required#assinatura" data-testid="link-gate-subscribe" className={cn(linkButtonClass, 'mt-5 type-ui')}>
          Ver assinatura
          <ArrowRight size={15} aria-hidden />
        </Link>
      )}
    </section>
  );
}

/** Renders `children` (which query /opportunities) only with access. Session and billing failures stay visible, with retry. */
export function OpportunityAccessGate({ children, loading = <RowsSkeleton /> }: { children: ReactNode; loading?: ReactNode }) {
  const access = useOpportunityAccess();
  if (access.state === 'error') return <ErrorState error={access.error} onRetry={access.retry} />;
  if (access.state === 'loading') return <>{loading}</>;
  if (access.state !== 'entitled') return <AccessPanel reason={access.state} />;
  return <>{children}</>;
}

/** Next to links into /oportunidades, for users without access. */
export function IncludedInAccessHint({ className }: { className?: string }) {
  return (
    <span data-testid="hint-included-in-access" className={cn('inline-flex items-center gap-1 type-label text-muted-foreground', className)}>
      <Lock size={11} aria-hidden />
      Incluso no acesso
    </span>
  );
}
