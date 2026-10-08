import { optionalStorageAllowed, subscribeCookieConsent } from '@/features/privacy/cookie-consent';
import { analyticsPagePath } from './analytics-route';

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{10}$/;
const SCRIPT_ID = 'google-analytics-gtag';

type GtagArguments = [command: string, ...values: unknown[]];
type AnalyticsWindow = Window & {
  dataLayer?: GtagArguments[];
  gtag?: (...args: GtagArguments) => void;
};

const deniedConsent = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
} as const;

const grantedAnalyticsConsent = {
  ...deniedConsent,
  analytics_storage: 'granted',
} as const;

export function validGaMeasurementId(value: string | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && MEASUREMENT_ID_PATTERN.test(normalized) ? normalized : null;
}

function configuredMeasurementId(): string | null {
  return validGaMeasurementId(import.meta.env.VITE_GA_MEASUREMENT_ID);
}

function cookieDomains(hostname: string): string[] {
  const domains = ['', hostname, `.${hostname}`];
  if (hostname === 'pardaldigital.com' || hostname.endsWith('.pardaldigital.com')) {
    domains.push('pardaldigital.com', '.pardaldigital.com');
  }
  return [...new Set(domains)];
}

function clearGoogleAnalyticsCookies(doc: Document, hostname: string): void {
  const names = doc.cookie
    .split(';')
    .map((cookie) => cookie.trim().split('=', 1)[0])
    .filter((name) => /^_ga(?:_|$)/.test(name));

  for (const name of new Set(names)) {
    for (const domain of cookieDomains(hostname)) {
      doc.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
    }
  }
}

export type GoogleAnalyticsController = ReturnType<typeof createGoogleAnalytics>;

/** Factory kept dependency-injected so consent behavior can be verified without loading Google's script in tests. */
export function createGoogleAnalytics({
  win,
  doc,
  measurementId,
  consentAllowed,
}: {
  win: AnalyticsWindow;
  doc: Document;
  measurementId: string | undefined;
  consentAllowed: () => boolean;
}) {
  const id = validGaMeasurementId(measurementId);
  let enabled = false;
  let initialized = false;

  const setDisabled = (disabled: boolean) => {
    if (!id) return;
    (win as unknown as Record<string, unknown>)[`ga-disable-${id}`] = disabled;
  };

  const command = (...args: GtagArguments) => {
    win.dataLayer ??= [];
    win.gtag ??= (...next) => {
      win.dataLayer!.push(next);
    };
    win.gtag(...args);
  };

  const pageParameters = (pagePath: string) => ({
    page_path: pagePath,
    page_location: `${win.location.origin}${pagePath}`,
    page_title: pagePath,
    page_referrer: '',
  });

  const grant = (): boolean => {
    if (!id || !consentAllowed()) return false;
    setDisabled(false);

    if (!initialized) {
      // Basic Consent Mode: consent is denied before gtag.js exists, then granted because this path
      // is reachable only after the user's affirmative choice. Advertising remains denied.
      command('consent', 'default', deniedConsent);
      command('consent', 'update', grantedAnalyticsConsent);
      command('js', new Date());
      command('config', id, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        ...pageParameters(analyticsPagePath(win.location.pathname)),
      });

      const script = doc.createElement('script');
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      doc.head.appendChild(script);
      initialized = true;
    } else {
      command('consent', 'update', grantedAnalyticsConsent);
    }

    enabled = true;
    return true;
  };

  const revoke = (): void => {
    if (!id) return;
    enabled = false;
    // The disable flag blocks hits immediately. The consent update is queued for the already-loaded
    // tag and every first-party GA cookie visible to JavaScript is expired.
    setDisabled(true);
    if (initialized && win.gtag) command('consent', 'update', deniedConsent);
    clearGoogleAnalyticsCookies(doc, win.location.hostname);
  };

  const syncConsent = (): boolean => {
    if (!id) return false;
    if (consentAllowed()) return grant();
    revoke();
    return false;
  };

  const event = (name: string, parameters?: Record<string, string>): boolean => {
    if (!id || !enabled || !consentAllowed()) return false;
    command('event', name, parameters);
    return true;
  };

  const pageView = (pagePath: string): boolean => {
    if (!id || !enabled || !consentAllowed()) return false;
    const parameters = pageParameters(pagePath);
    // Set sanitized defaults for subsequent product events too: GA must never infer the current
    // document URL when it contains a search query or unsubscribe token.
    command('set', parameters);
    command('event', 'page_view', parameters);
    return true;
  };

  return { configured: Boolean(id), syncConsent, event, pageView };
}

let browserController: GoogleAnalyticsController | null = null;

function getBrowserController(): GoogleAnalyticsController | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  browserController ??= createGoogleAnalytics({
    win: window,
    doc: document,
    measurementId: configuredMeasurementId() ?? undefined,
    consentAllowed: optionalStorageAllowed,
  });
  return browserController;
}

/** Starts consent synchronization. With no valid build-time ID this is a strict no-op. */
export function initializeGoogleAnalytics(): () => void {
  const analytics = getBrowserController();
  if (!analytics?.configured) return () => undefined;
  analytics.syncConsent();
  return subscribeCookieConsent(() => analytics.syncConsent());
}

export function trackPageView(pagePath: string): void {
  getBrowserController()?.pageView(pagePath);
}

export function trackAuthentication(event: 'sign_up' | 'login'): void {
  getBrowserController()?.event(event, { method: 'Google' });
}

export function trackSearch(): void {
  getBrowserController()?.event('search');
}

export function trackTenderAction(event: 'save_tender' | 'monitor_tender'): void {
  getBrowserController()?.event(event);
}

export function trackRecommendationAction(event: 'recommendation_interest' | 'recommendation_dismiss'): void {
  getBrowserController()?.event(event);
}

export function trackBeginCheckout(): void {
  getBrowserController()?.event('begin_checkout');
}
