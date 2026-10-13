import assert from 'node:assert/strict';
import test from 'node:test';
import { sendJson, getJson } from './adapters/http/http-client';
import { ApiError } from './errors';
import { createMaintenanceNotifier, isMaintenance, MAINTENANCE_DETAIL, MAINTENANCE_MESSAGE, MAINTENANCE_TITLE, maintenanceNoticeMs, type MaintenanceNotice } from './maintenance';

const maintenanceBody = {
  error: { code: 'MAINTENANCE_IN_PROGRESS', message: 'Manutenção rápida em andamento. Tente de novo em alguns minutos.', requestId: 'req-1' },
};
const maintenance = (retryAfterSeconds?: number) => new ApiError('MAINTENANCE_IN_PROGRESS', maintenanceBody.error.message, 503, { retryAfterSeconds });

/** Answers every request of the test with one response, and records what was sent. */
const withFetch = async <T>(response: () => Response, run: (calls: Array<{ url: string; init: RequestInit }>) => Promise<T>): Promise<T> => {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return response();
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
};

test('the HTTP client turns 503 MAINTENANCE_IN_PROGRESS into an ApiError with the code and Retry-After', async () => {
  await withFetch(
    () => Response.json(maintenanceBody, { status: 503, headers: { 'Retry-After': '60' } }),
    async (calls) => {
      const body = { stage: 'participating', nextAction: 'Enviar proposta' };
      const error = await sendJson('PUT', '/v1/me/saved-tenders/tender-1', body).then(
        () => null,
        (reason: unknown) => reason,
      );
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'MAINTENANCE_IN_PROGRESS');
      assert.equal(error.status, 503);
      assert.equal(error.retryAfterSeconds, 60);
      assert.equal(error.requestId, 'req-1');
      assert.equal(isMaintenance(error), true);
      assert.equal(error.isTransient, false, 'the person tries again; the app does not retry on its own');
      assert.equal(calls.length, 1, 'sent once');
      assert.equal(calls[0]!.init.credentials, 'include', 'the session stays in the HttpOnly cookie');
      assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), body, 'what was typed is the caller’s to send again');
    },
  );
});

test('other failures are not maintenance: an overloaded 503, a 500 and a network error stay as they were', async () => {
  await withFetch(
    () => Response.json({ error: { code: 'SERVICE_OVERLOADED', message: 'busy' } }, { status: 503, headers: { 'Retry-After': '1' } }),
    async () => {
      const error = await getJson('/v1/tenders/search').then(
        () => null,
        (reason: unknown) => reason,
      );
      assert.ok(error instanceof ApiError);
      assert.equal(isMaintenance(error), false);
      assert.equal(error.isTransient, true);
    },
  );
  assert.equal(new ApiError('INTERNAL_ERROR', 'HTTP 500', 500).isTransient, true);
  assert.equal(isMaintenance(new ApiError('NETWORK_ERROR', 'offline', 0)), false);
  assert.equal(isMaintenance(new Error('boom')), false);
  assert.equal(isMaintenance(undefined), false);
});

test('the notice uses the contract copy and stays for the Retry-After, between 5 and 30 seconds', () => {
  assert.equal(MAINTENANCE_MESSAGE, 'Manutenção rápida em andamento. Tente de novo em alguns minutos.');
  assert.equal(MAINTENANCE_MESSAGE, maintenanceBody.error.message, 'the same sentence the API sends');
  assert.equal(maintenanceNoticeMs(maintenance(60)), 30_000);
  assert.equal(maintenanceNoticeMs(maintenance(12)), 12_000);
  assert.equal(maintenanceNoticeMs(maintenance(1)), 5_000);
  assert.equal(maintenanceNoticeMs(maintenance()), 30_000);
});

test('the notifier announces maintenance once per burst and replaces the notice on a later attempt', () => {
  const shown: MaintenanceNotice[] = [];
  let dismissed = 0;
  const announce = createMaintenanceNotifier((notice) => {
    shown.push(notice);
    return { dismiss: () => void (dismissed += 1) };
  });

  assert.equal(announce(new ApiError('UNAUTHENTICATED', 'expired', 401), 0), false);
  assert.equal(announce(new Error('boom'), 0), false);
  assert.deepEqual(shown, [], 'only the maintenance answer raises the notice');

  assert.equal(announce(maintenance(60), 10_000), true);
  assert.equal(announce(maintenance(60), 10_200), true, 'a second request refused in the same action');
  assert.deepEqual(shown, [{ title: MAINTENANCE_TITLE, description: MAINTENANCE_DETAIL, duration: 30_000 }]);
  assert.equal(dismissed, 0);

  assert.equal(announce(maintenance(10), 14_000), true, 'the person tried again');
  assert.equal(shown.length, 2);
  assert.equal(shown[1]!.duration, 10_000);
  assert.equal(dismissed, 1, 'the notice still on screen gives way to the new one');
});
