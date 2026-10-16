export const COOKIE_CONSENT_KEY = 'licita-cookie-consent';
const CONSENT_EVENT = 'licita-cookie-consent';

const OPTIONAL_KEYS = ['licita-theme', 'licita-sidebar-collapsed', 'licita-recent-searches', 'licita-last-activity', 'licita-trial-banner-dismissed', 'licita-guided-onboarding-dismissed-v1'];

export type CookieConsent = 'accepted' | 'refused';

export function readCookieConsent(): CookieConsent | null {
  try {
    const value = localStorage.getItem(COOKIE_CONSENT_KEY);
    return value === 'accepted' || value === 'refused' ? value : null;
  } catch (error) {
    console.error('[cookies] Não foi possível ler a escolha de cookies.', error);
    return null;
  }
}

/** Theme, sidebar, recent searches and the idle clock. The session cookie is not included. */
export function optionalStorageAllowed(): boolean {
  return readCookieConsent() === 'accepted';
}

export function setCookieConsent(value: CookieConsent): void {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
    if (value === 'refused') {
      for (const key of OPTIONAL_KEYS) localStorage.removeItem(key);
      // Separate guard: an unavailable sessionStorage must not keep the optional keys above in localStorage.
      try {
        sessionStorage.removeItem('pardal-triage-v1');
      } catch (error) {
        console.error('[cookies] Não foi possível limpar o progresso da triagem.', error);
      }
    }
  } catch (error) {
    console.error('[cookies] Não foi possível gravar a escolha de cookies.', error);
    return;
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function subscribeCookieConsent(listener: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CONSENT_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
