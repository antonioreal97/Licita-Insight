import type { AccountAdapter } from '../account-adapter';
import type {
  AccountUsageProfile,
  AccountUsageProfilePatch,
  CompanyDocument,
  CompanyDocumentKind,
  CompanyDocumentPut,
  CompanyDocumentsResponse,
  BillingCheckoutResponse,
  BillingResponse,
  CouponRedemptionResponse,
  ImportSavedTendersResponse,
  NotificationPreferences,
  RecommendationEvent,
  RecommendationPreferences,
  RecommendationsResponse,
  NotificationsResponse,
  PublicPlan,
  SavedSearch,
  SavedSearchesResponse,
  SavedTender,
  SavedTenderIdsResponse,
  SavedTendersResponse,
  SessionResponse,
  UnreadCountResponse,
  UnsubscribeResponse,
} from '../../types';
import { apiBaseUrl, getFile, getJson, sendJson, toQueryString } from './http-client';

const enc = encodeURIComponent;

/** Account API v1 (CODEX_BACKEND_AGENT) — contract: docs/contracts/account-v1.md. */
export const httpAccountAdapter: AccountAdapter = {
  getSession: (signal) => getJson<SessionResponse>('/v1/auth/session', {}, signal),
  getUsageProfile: (signal) => getJson<AccountUsageProfile>('/v1/me/usage-profile', {}, signal),
  updateUsageProfile: (body: AccountUsageProfilePatch) => sendJson<AccountUsageProfile>('PATCH', '/v1/me/usage-profile', body),
  listCompanyDocuments: (signal) => getJson<CompanyDocumentsResponse>('/v1/me/company-documents', {}, signal),
  putCompanyDocument: (kind: CompanyDocumentKind, body: CompanyDocumentPut) => sendJson<CompanyDocument>('PUT', `/v1/me/company-documents/${enc(kind)}`, body),
  googleStartUrl: (returnTo) => `${apiBaseUrl}/v1/auth/google/start${toQueryString({ returnTo })}`,
  logout: () => sendJson<void>('POST', '/v1/auth/logout'),
  logoutAll: () => sendJson<void>('POST', '/v1/auth/logout-all'),

  exportAccountData: () => getFile('/v1/me/export'),
  deleteAccount: () => sendJson<void>('DELETE', '/v1/me', { confirm: 'EXCLUIR' }),

  getBilling: (signal) => getJson<BillingResponse>('/v1/me/billing', {}, signal),
  startCheckout: () => sendJson<BillingCheckoutResponse>('POST', '/v1/me/billing/checkout'),
  cancelBilling: () => sendJson<BillingResponse>('POST', '/v1/me/billing/cancel'),
  redeemBillingCoupon: (code) => sendJson<CouponRedemptionResponse>('POST', '/v1/me/billing/coupon', { code }),
  getPublicPlan: (signal) => getJson<PublicPlan>('/v1/billing/plan', {}, signal),

  listSavedTenders: (params, signal) => getJson<SavedTendersResponse>('/v1/me/saved-tenders', params, signal),
  getSavedTenderIds: (signal) => getJson<SavedTenderIdsResponse>('/v1/me/saved-tenders/ids', {}, signal),
  getSavedTender: (tenderId, signal) => getJson<SavedTender>(`/v1/me/saved-tenders/${enc(tenderId)}`, {}, signal),
  saveTender: (tenderId, body) => sendJson<SavedTender>('PUT', `/v1/me/saved-tenders/${enc(tenderId)}`, body),
  removeSavedTender: (tenderId) => sendJson<void>('DELETE', `/v1/me/saved-tenders/${enc(tenderId)}`),
  importSavedTenders: (ids) => sendJson<ImportSavedTendersResponse>('POST', '/v1/me/saved-tenders/import', { ids }),

  listSavedSearches: (signal) => getJson<SavedSearchesResponse>('/v1/me/saved-searches', {}, signal),
  createSavedSearch: (body) => sendJson<SavedSearch>('POST', '/v1/me/saved-searches', body),
  updateSavedSearch: (id, body) => sendJson<SavedSearch>('PATCH', `/v1/me/saved-searches/${enc(id)}`, body),
  deleteSavedSearch: (id) => sendJson<void>('DELETE', `/v1/me/saved-searches/${enc(id)}`),
  restoreSavedSearch: (id) => sendJson<SavedSearch>('POST', `/v1/me/saved-searches/${enc(id)}/restore`),
  markSavedSearchSeen: (id) => sendJson<SavedSearch>('POST', `/v1/me/saved-searches/${enc(id)}/seen`),

  listNotifications: (params, signal) => getJson<NotificationsResponse>('/v1/me/notifications', params, signal),
  getUnreadCount: (signal) => getJson<UnreadCountResponse>('/v1/me/notifications/unread-count', {}, signal),
  markNotificationsRead: (body) => sendJson<UnreadCountResponse>('POST', '/v1/me/notifications/read', body),

  getNotificationPreferences: (signal) => getJson<NotificationPreferences>('/v1/me/notification-preferences', {}, signal),
  updateNotificationPreferences: (body) => sendJson<NotificationPreferences>('PUT', '/v1/me/notification-preferences', body),
  getRecommendationPreferences: (signal) => getJson<RecommendationPreferences>('/v1/me/recommendation-preferences', {}, signal),
  updateRecommendationPreferences: (body) => sendJson<RecommendationPreferences>('PUT', '/v1/me/recommendation-preferences', body),
  deleteRecommendationHistory: () => sendJson<void>('DELETE', '/v1/me/recommendation-history'),
  listRecommendations: (params, signal) => getJson<RecommendationsResponse>('/v1/recommendations', params, signal),
  dismissRecommendation: (tenderId, reason) => sendJson<void>('POST', `/v1/recommendations/${enc(tenderId)}/dismiss`, reason ? { reason } : undefined),
  recordRecommendationEvent: (event: RecommendationEvent) => sendJson<{ recorded: boolean }>('POST', '/v1/recommendations/events', event),
  // Public route; the CSRF header sendJson adds is harmless there (and keeps the call a non-simple CORS request).
  unsubscribe: (token, scope) => sendJson<UnsubscribeResponse>('POST', '/v1/email/unsubscribe', { token, scope }),
};
