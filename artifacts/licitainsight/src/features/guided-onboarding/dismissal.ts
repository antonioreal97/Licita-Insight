import { optionalStorageAllowed } from '@/features/privacy/cookie-consent';

export const GUIDED_DISMISSAL_KEY = 'licita-guided-onboarding-dismissed-v1';
// Without cookie consent the dismissal only lasts for this tab.
const dismissedInMemory = new Set<string>();

function storedDismissals(): string[] {
  if (!optionalStorageAllowed()) return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(GUIDED_DISMISSAL_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch (error) {
    console.error('[onboarding] Não foi possível ler a dispensa do começo guiado.', error);
    return [];
  }
}

export function isGuidedDismissed(userId: string): boolean {
  return dismissedInMemory.has(userId) || storedDismissals().includes(userId);
}

export function dismissGuided(userId: string): void {
  dismissedInMemory.add(userId);
  if (!optionalStorageAllowed()) return;
  try {
    localStorage.setItem(GUIDED_DISMISSAL_KEY, JSON.stringify([...new Set([...storedDismissals(), userId])].slice(-50)));
  } catch (error) {
    console.error('[onboarding] Não foi possível salvar a dispensa do começo guiado.', error);
  }
}
