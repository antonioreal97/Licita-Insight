import { useSyncExternalStore } from 'react';
import { Button } from '@/components/common/action-button';
import { readCookieConsent, setCookieConsent, subscribeCookieConsent } from './cookie-consent';

export function CookieNotice() {
  const choice = useSyncExternalStore(subscribeCookieConsent, readCookieConsent, () => null);
  if (choice) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-toast p-4 sm:p-6">
      <div
        role="dialog"
        aria-labelledby="cookie-notice-title"
        aria-describedby="cookie-notice-body"
        data-testid="cookie-notice"
        className="mx-auto flex max-w-3xl flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-lg sm:flex-row sm:items-end sm:p-5"
      >
        <div className="min-w-0">
          <h2 id="cookie-notice-title" className="type-section text-foreground">
            Cookies neste navegador
          </h2>
          <p id="cookie-notice-body" className="mt-1.5 type-ui text-muted-foreground">
            Um cookie é necessário para manter sua sessão de login. Ele não serve para anúncio. Tema, barra lateral, buscas recentes e o relógio de inatividade só ficam salvos se você concordar.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" data-testid="button-cookie-refuse" onClick={() => setCookieConsent('refused')}>
            Recusar
          </Button>
          <Button type="button" variant="primary" data-testid="button-cookie-accept" onClick={() => setCookieConsent('accepted')}>
            Concordar
          </Button>
        </div>
      </div>
    </div>
  );
}
