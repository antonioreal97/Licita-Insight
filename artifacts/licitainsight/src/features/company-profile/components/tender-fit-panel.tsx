import { Link } from 'wouter';
import { Target } from 'lucide-react';
import { isApiError } from '@/api';
import { useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { useCompanyProfile, useTenderFits } from '../hooks/use-company-profile';
import { FitDetails, PROFILE_HREF } from './fit-badge';

const linkClass = 'font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring';

/**
 * "Aderência ao seu perfil" on the tender detail. Hidden for visitors and accounts without access
 * ("Perguntar ao edital" already explains the subscription); an invitation when there is no profile yet.
 */
export function TenderFitPanel({ tenderId }: { tenderId: string }) {
  const session = useSession();
  const billing = useBilling();
  const profile = useCompanyProfile();
  const fits = useTenderFits([tenderId]);

  if (session.status !== 'authenticated' || !billing.data?.entitled || profile.isPending) return null;

  let body;
  if (profile.isError || fits.isError) {
    const error = profile.error ?? fits.error;
    body = (
      <p role="alert" className="type-meta text-destructive-subtle-foreground" data-testid="text-fit-error">
        Não foi possível avaliar a aderência agora.{isApiError(error) && error.requestId ? ` (ref. ${error.requestId})` : ''}
      </p>
    );
  } else if (!profile.data.profile) {
    body = (
      <p className="type-meta text-foreground" data-testid="text-fit-invite">
        Conte o que sua empresa fornece e onde atua para ver se este edital combina com vocês.{' '}
        <Link href={PROFILE_HREF} className={linkClass}>
          Cadastrar perfil
        </Link>
      </p>
    );
  } else {
    body = <FitDetails fit={fits.data?.results[tenderId]} />;
  }

  return (
    <section aria-labelledby="fit-title" className="rounded-xl border border-border bg-card p-5 sm:p-7" data-testid="panel-tender-fit">
      <div className="mb-3 flex items-center gap-2">
        <Target size={16} aria-hidden="true" className="text-primary" />
        <h2 id="fit-title" className="type-section text-foreground">
          Aderência ao seu perfil
        </h2>
      </div>
      {body}
    </section>
  );
}
