import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { useCompanyProfile } from '../hooks/use-company-profile';
import { PROFILE_HREF } from './fit-badge';

/** Dashboard invitation, not a gate: shown only to accounts with access and no profile yet; gone once the profile exists. */
export function ProfileInviteCard() {
  const session = useSession();
  const billing = useBilling();
  const profile = useCompanyProfile();
  if (session.status !== 'authenticated' || !billing.data?.entitled || !profile.isSuccess || profile.data.profile) return null;
  return (
    <div className="rounded-xl border border-primary/25 bg-card p-5" data-testid="card-dashboard-profile-invite">
      <h2 className="type-section text-foreground">Veja o que combina com sua empresa</h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Conte o que vocês fornecem e onde atuam. A busca passa a marcar os editais com alta aderência e explica o motivo.
      </p>
      <Link
        href={PROFILE_HREF}
        data-testid="link-dashboard-profile-invite"
        className="mt-4 inline-flex rounded-lg text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
      >
        Cadastrar perfil da empresa <ArrowRight size={13} strokeWidth={1.75} className="ml-1 inline" />
      </Link>
    </div>
  );
}
