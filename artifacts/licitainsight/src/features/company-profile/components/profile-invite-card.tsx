import React from 'react';
import { Link } from 'wouter';
import type { AccountUsageProfile } from '@/api';
import { Button } from '@/components/common/action-button';
import { useSession } from '@/features/auth/hooks/use-session';
import { ProfileMeter } from '@/features/guided-onboarding/profile-meter';
import { useStartGuidedOnboarding } from '@/features/guided-onboarding/onboarding-host';
import { profileProgress, type GuidedDraft } from '@/features/guided-onboarding/profile-progress';
import { useSaveUsageProfile, useUsageProfile } from '@/features/settings/hooks/use-usage-profile';
import { useCompanyProfile } from '../hooks/use-company-profile';

export function shouldShowUsageInvite(profile: AccountUsageProfile | undefined): boolean {
  return Boolean(profile && !profile.usageInviteDismissed && !profile.usagePurposes.length && !profile.applicantTypes.length);
}

export function DashboardProfileCardContent({
  profile,
  usageInvite,
  dismissing = false,
  onStart,
  onDismissUsage,
}: {
  profile: GuidedDraft | null;
  usageInvite: boolean;
  dismissing?: boolean;
  onStart: (step?: number) => void;
  onDismissUsage: () => void;
}) {
  const complete = profileProgress(profile).percent === 100;
  if (complete && !usageInvite) return null;
  return (
    <section aria-labelledby="dashboard-profile-title" className="mb-6 rounded-xl border border-border bg-card p-5" data-testid="card-dashboard-profile-invite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="dashboard-profile-title" className="type-section text-foreground">
            Seu perfil no Pardal
          </h2>
          <p className="mt-1 type-meta text-muted-foreground">Ajuste suas preferências para receber uma seleção mais relevante.</p>
        </div>
        {!complete ? (
          <Button onClick={() => onStart()} data-testid="button-dashboard-guided-start">
            Completar em 3 minutos
          </Button>
        ) : null}
      </div>
      <div className="mt-5 border-t border-border-subtle pt-5">
        <ProfileMeter profile={profile} onChoose={onStart} embedded maxItems={usageInvite ? 2 : 3} />
      </div>
      {usageInvite ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4" data-testid="dashboard-usage-invite">
          <div>
            <Link
              href="/settings#perfil"
              className="rounded-lg type-ui font-semibold text-foreground underline-offset-4 hover:underline focus-visible:focus-ring"
            >
              Conte o que você busca no Pardal
            </Link>
            <span className="block type-meta text-muted-foreground">→ receba recomendações mais relevantes</span>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 type-meta text-muted-foreground hover:bg-muted focus-visible:focus-ring"
            disabled={dismissing}
            onClick={onDismissUsage}
          >
            Dispensar
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Available to every signed-in account; editing the profile never requires a subscription. */
export function ProfileInviteCard() {
  const session = useSession();
  const profile = useCompanyProfile();
  const usageProfile = useUsageProfile();
  const saveUsageProfile = useSaveUsageProfile();
  const start = useStartGuidedOnboarding();
  if (session.status !== 'authenticated' || !profile.isSuccess) return null;
  return (
    <DashboardProfileCardContent
      profile={profile.data.profile}
      usageInvite={usageProfile.isSuccess && shouldShowUsageInvite(usageProfile.data)}
      dismissing={saveUsageProfile.isPending}
      onStart={start}
      onDismissUsage={() => saveUsageProfile.mutate({ usageInviteDismissed: true })}
    />
  );
}
