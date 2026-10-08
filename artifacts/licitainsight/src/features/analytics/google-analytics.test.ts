import assert from 'node:assert/strict';
import test from 'node:test';
import { createGoogleAnalytics } from './google-analytics';

class FakeDocument {
  readonly scripts: Array<{ id: string; async: boolean; src: string }> = [];
  readonly cookies = new Map<string, string>();
  readonly head = { appendChild: (script: { id: string; async: boolean; src: string }) => this.scripts.push(script) };

  createElement() {
    return { id: '', async: false, src: '' };
  }

  get cookie() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  set cookie(value: string) {
    const [pair] = value.split(';');
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator);
    const cookieValue = pair.slice(separator + 1);
    if (/Max-Age=0/i.test(value)) this.cookies.delete(name);
    else this.cookies.set(name, cookieValue);
  }
}

function setup(measurementId: string | undefined) {
  let allowed = false;
  const doc = new FakeDocument();
  const win = { location: { hostname: 'pardaldigital.com', origin: 'https://pardaldigital.com', pathname: '/search' } } as Window;
  const analytics = createGoogleAnalytics({
    win,
    doc: doc as unknown as Document,
    measurementId,
    consentAllowed: () => allowed,
  });
  return { analytics, doc, win, allow: () => (allowed = true), refuse: () => (allowed = false) };
}

test('does not inject gtag.js before consent and injects it after acceptance', () => {
  const context = setup('G-ABCDEFGHIJ');
  context.analytics.syncConsent();
  assert.equal(context.doc.scripts.length, 0);
  assert.equal((context.win as Window & { dataLayer?: unknown[] }).dataLayer, undefined);

  context.allow();
  assert.equal(context.analytics.syncConsent(), true);
  assert.equal(context.doc.scripts.length, 1);
  assert.equal(context.doc.scripts[0]?.src, 'https://www.googletagmanager.com/gtag/js?id=G-ABCDEFGHIJ');

  const commands = (context.win as Window & { dataLayer: unknown[][] }).dataLayer;
  assert.deepEqual(commands[0]?.slice(0, 2), ['consent', 'default']);
  assert.deepEqual(commands[1]?.slice(0, 2), ['consent', 'update']);
  assert.deepEqual(commands[0]?.[2], {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  assert.deepEqual(commands[1]?.[2], {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  assert.deepEqual(commands[3], [
    'config',
    'G-ABCDEFGHIJ',
    {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_path: '/search',
      page_location: 'https://pardaldigital.com/search',
      page_title: '/search',
      page_referrer: '',
    },
  ]);
});

test('stops events and clears every _ga cookie after revocation', () => {
  const context = setup('G-ABCDEFGHIJ');
  context.allow();
  context.analytics.syncConsent();
  context.doc.cookies.set('_ga', 'GA1.1.123');
  context.doc.cookies.set('_ga_ABCDEFGHIJ', 'GS1.1.456');
  context.doc.cookies.set('licita_session', 'kept');
  assert.equal(context.analytics.event('search'), true);

  context.refuse();
  context.analytics.syncConsent();
  assert.equal(context.analytics.event('search'), false);
  assert.equal((context.win as unknown as Record<string, unknown>)['ga-disable-G-ABCDEFGHIJ'], true);
  assert.equal(context.doc.cookies.has('_ga'), false);
  assert.equal(context.doc.cookies.has('_ga_ABCDEFGHIJ'), false);
  assert.equal(context.doc.cookies.get('licita_session'), 'kept');
});

test('does nothing without a valid measurement ID', () => {
  const context = setup(undefined);
  context.allow();
  assert.equal(context.analytics.syncConsent(), false);
  assert.equal(context.analytics.event('page_view', { page_path: '/' }), false);
  assert.equal(context.doc.scripts.length, 0);
  assert.equal((context.win as Window & { dataLayer?: unknown[] }).dataLayer, undefined);
});
