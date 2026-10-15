import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '@/features/auth/hooks/use-session';
import { useCompanyProfile } from '@/features/company-profile/hooks/use-company-profile';
import { dismissGuided, isGuidedDismissed } from './dismissal';
import { hasProfileContent } from './profile-progress';
import { GuidedOnboarding } from './guided-onboarding';

const StartContext = createContext<(step?: number) => void>(() => undefined);
export const useStartGuidedOnboarding = () => useContext(StartContext);

export function OnboardingHost({ children }: { children: ReactNode }) {
  const { user } = useSession();
  return (
    <AccountOnboarding key={user?.id ?? 'anonymous'} userId={user?.id}>
      {children}
    </AccountOnboarding>
  );
}
function AccountOnboarding({ children, userId }: { children: ReactNode; userId?: string }) {
  const profile = useCompanyProfile();
  const [location, navigate] = useLocation();
  const [opened, setOpened] = useState<{ step: number; location: string } | null>(null);
  useEffect(() => {
    if (!userId || !profile.isSuccess || hasProfileContent(profile.data.profile) || isGuidedDismissed(userId)) return;
    // Mark the automatic invitation as seen in memory (and, with consent, persist the preference).
    // Navigating away never traps the user or automatically starts the guide again.
    dismissGuided(userId);
    setOpened({ step: 0, location });
  }, [userId, profile.isSuccess, profile.data, location]);
  const close = (dashboard = false) => {
    if (userId) dismissGuided(userId);
    setOpened(null);
    if (dashboard) navigate('/dashboard');
    requestAnimationFrame(() => document.getElementById('conteudo')?.focus());
  };
  return (
    <StartContext.Provider value={(step = 0) => setOpened({ step, location })}>
      {userId && opened?.location === location && profile.isSuccess ? (
        <GuidedOnboarding
          initialProfile={profile.data.profile}
          initialStep={opened.step}
          onDismiss={() => close()}
          onComplete={() => close(true)}
        />
      ) : (
        children
      )}
    </StartContext.Provider>
  );
}
