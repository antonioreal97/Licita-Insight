import type { AccountAdapter } from '../account-adapter';
import type {
  BillingCheckoutResponse,
  BillingResponse,
  ImportSavedTendersResponse,
  NotificationsResponse,
  SavedSearch,
  SavedSearchesResponse,
  SavedTender,
  SavedTenderIdsResponse,
  SavedTendersResponse,
  SessionResponse,
  UnreadCountResponse,
} from '../../types';
import { apiBaseUrl, getJson, sendJson, toQueryString } from './http-client';

const enc = encodeURIComponent;

/** Account API v1 (CODEX_BACKEND_AGENT) — contract: docs/contracts/account-v1.md. */
export const httpAccountAdapter: AccountAdapter = {
  getSession: (signal) => getJson<SessionResponse>('/v1/auth/session', {}, signal),
  googleStartUrl: (returnTo) => `${apiBaseUrl}/v1/auth/google/start${toQueryString({ returnTo })}`,
  logout: () => sendJson<void>('POST', '/v1/auth/logout'),

  getBilling: (signal) => getJson<BillingResponse>('/v1/me/billing', {}, signal),
  startCheckout: () => sendJson<BillingCheckoutResponse>('POST', '/v1/me/billing/checkout'),
  cancelBilling: () => sendJson<BillingResponse>('POST', '/v1/me/billing/cancel'),

  listSavedTenders: (params, signal) => getJson<SavedTendersResponse>('/v1/me/saved-tenders', params, signal),
  getSavedTenderIds: (signal) => getJson<SavedTenderIdsResponse>('/v1/me/saved-tenders/ids', {}, signal),
  saveTender: (tenderId, body) => sendJson<SavedTender>('PUT', `/v1/me/saved-tenders/${enc(tenderId)}`, body),
  removeSavedTender: (tenderId) => sendJson<void>('DELETE', `/v1/me/saved-tenders/${enc(tenderId)}`),
  importSavedTenders: (ids) => sendJson<ImportSavedTendersResponse>('POST', '/v1/me/saved-tenders/import', { ids }),

  listSavedSearches: (signal) => getJson<SavedSearchesResponse>('/v1/me/saved-searches', {}, signal),
  createSavedSearch: (body) => sendJson<SavedSearch>('POST', '/v1/me/saved-searches', body),
  updateSavedSearch: (id, body) => sendJson<SavedSearch>('PATCH', `/v1/me/saved-searches/${enc(id)}`, body),
  deleteSavedSearch: (id) => sendJson<void>('DELETE', `/v1/me/saved-searches/${enc(id)}`),
  markSavedSearchSeen: (id) => sendJson<SavedSearch>('POST', `/v1/me/saved-searches/${enc(id)}/seen`),

  listNotifications: (params, signal) => getJson<NotificationsResponse>('/v1/me/notifications', params, signal),
  getUnreadCount: (signal) => getJson<UnreadCountResponse>('/v1/me/notifications/unread-count', {}, signal),
  markNotificationsRead: (body) => sendJson<UnreadCountResponse>('POST', '/v1/me/notifications/read', body),
};
