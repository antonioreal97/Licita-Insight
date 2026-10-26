import { useSyncExternalStore } from 'react';
import { Button } from '@/components/common/action-button';
import { readCookieConsent, setCookieConsent, subscribeCookieConsent } from './cookie-consent';
import { LegalLinks } from '@/features/legal/legal-content';

export function CookieNotice() {
  const choice = useSyncExternalStore(subscribeCookieConsent, readCookieConsent, () => null);
  if (choice) return null;

  return (
    // Phones (below sm): tighter padding and line height, and no transparent band above the card, so the notice
    // leaves the page's first screen readable, with 44 px taps and both choices side by side at the same size.
    // From sm up nothing changes.
    <div className="fixed inset-x-0 bottom-0 z-toast px-3 pb-3 sm:p-6">
      <div
        role="dialog"
        aria-labelledby="cookie-notice-title"
        aria-describedby="cookie-notice-body"
        data-testid="cookie-notice"
        className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-end sm:gap-4 sm:p-5"
      >
        <div className="min-w-0">
          <h2 id="cookie-notice-title" className="type-section text-foreground">
            Cookies neste navegador
          </h2>
          <p id="cookie-notice-body" className="mt-0.5 type-ui text-muted-foreground max-sm:leading-[1.45] sm:mt-1.5">
            Um cookie é necessário para manter sua sessão de login. Ele não serve para anúncio. Tema, barra lateral, buscas recentes, relógio de inatividade e
            medição de audiência (Google Analytics) só são usados se você concordar.
          </p>
          <LegalLinks className="mt-2 type-meta max-sm:-mb-3 max-sm:mt-0 max-sm:text-sm max-sm:[&_a]:inline-flex max-sm:[&_a]:min-h-11 max-sm:[&_a]:items-center" />
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
          <Button type="button" variant="outline" className="max-sm:h-11" data-testid="button-cookie-refuse" onClick={() => setCookieConsent('refused')}>
            Recusar
          </Button>
          <Button type="button" variant="primary" className="max-sm:h-11" data-testid="button-cookie-accept" onClick={() => setCookieConsent('accepted')}>
            Concordar
          </Button>
        </div>
      </div>
    </div>
  );
}
