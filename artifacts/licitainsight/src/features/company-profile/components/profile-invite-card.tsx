import { Button } from '@/components/common/action-button';
import { useSession } from '@/features/auth/hooks/use-session';
import { ProfileMeter } from '@/features/guided-onboarding/profile-meter';
import { useStartGuidedOnboarding } from '@/features/guided-onboarding/onboarding-host';
import { profileProgress } from '@/features/guided-onboarding/profile-progress';
import { useCompanyProfile } from '../hooks/use-company-profile';

/** Available to every signed-in account; editing the profile never requires a subscription. */
export function ProfileInviteCard() {
  const session = useSession();
  const profile = useCompanyProfile();
  const start = useStartGuidedOnboarding();
  if (session.status !== 'authenticated' || !profile.isSuccess) return null;
  const saved = profile.data.profile;
  const complete = profileProgress(saved).percent === 100;
  return (
    <div className="space-y-3" data-testid="card-dashboard-profile-invite">
      {!complete && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className="type-section">Seu próximo edital começa pelo perfil</h2>
            <p className="mt-1 type-meta text-muted-foreground">Cerca de 3 minutos para aproximar a seleção do que você faz.</p>
          </div>
          <Button variant="outline" onClick={() => start()} data-testid="button-dashboard-guided-start">
            {saved ? 'Completar perfil' : 'Começar em 3 minutos'}
          </Button>
        </div>
      )}
      <ProfileMeter profile={saved} onChoose={start} />
    </div>
  );
}
