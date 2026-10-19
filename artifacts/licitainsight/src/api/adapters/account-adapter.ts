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
  CreateSavedSearchBody,
  DownloadedFile,
  ImportSavedTendersResponse,
  MarkNotificationsReadBody,
  NotificationPreferences,
  RecommendationDismissReason,
  RecommendationEvent,
  RecommendationPreferences,
  RecommendationsResponse,
  NotificationsParams,
  NotificationsResponse,
  PublicPlan,
  SavedSearch,
  SavedSearchesResponse,
  SavedTender,
  SavedTenderIdsResponse,
  SavedTendersParams,
  SavedTendersResponse,
  SaveTenderBody,
  SessionResponse,
  UnreadCountResponse,
  UnsubscribeResponse,
  UnsubscribeScope,
  UpdateNotificationPreferencesBody,
  UpdateSavedSearchBody,
} from '../types';

/**
 * Boundary for the signed-in user's data (docs/contracts/account-v1.md). Everything under `/me` needs the session cookie.
 * Implementation: httpAccountAdapter. Components never import an adapter — they go through services and hooks.
 */
export interface AccountAdapter {
  getSession(signal?: AbortSignal): Promise<SessionResponse>;
  getUsageProfile(signal?: AbortSignal): Promise<AccountUsageProfile>;
  updateUsageProfile(body: AccountUsageProfilePatch): Promise<AccountUsageProfile>;
  listCompanyDocuments(signal?: AbortSignal): Promise<CompanyDocumentsResponse>;
  putCompanyDocument(kind: CompanyDocumentKind, body: CompanyDocumentPut): Promise<CompanyDocument>;
  /** Full-page URL that starts the Google OAuth flow; the API redirects back to `returnTo`. */
  googleStartUrl(returnTo: string): string;
  logout(): Promise<void>;

  /** LGPD: JSON with the user's personal data (no 402 gate). */
  exportAccountData(): Promise<DownloadedFile>;
  /** LGPD: cancels an active subscription, then deletes the account (204). 503 BILLING_UNAVAILABLE → nothing deleted. */
  deleteAccount(): Promise<void>;

  getBilling(signal?: AbortSignal): Promise<BillingResponse>;
  startCheckout(): Promise<BillingCheckoutResponse>;
  cancelBilling(): Promise<BillingResponse>;
  redeemBillingCoupon(code: string): Promise<CouponRedemptionResponse>;
  /** Public, no session: price and trial length for landing/login/settings. */
  getPublicPlan(signal?: AbortSignal): Promise<PublicPlan>;

  listSavedTenders(params: SavedTendersParams, signal?: AbortSignal): Promise<SavedTendersResponse>;
  getSavedTenderIds(signal?: AbortSignal): Promise<SavedTenderIdsResponse>;
  /** One saved tender with the user's participation (docs/contracts/participation-v1.md). 404 `NOT_FOUND` when not saved. */
  getSavedTender(tenderId: string, signal?: AbortSignal): Promise<SavedTender>;
  saveTender(tenderId: string, body: SaveTenderBody): Promise<SavedTender>;
  removeSavedTender(tenderId: string): Promise<void>;
  importSavedTenders(ids: string[]): Promise<ImportSavedTendersResponse>;

  listSavedSearches(signal?: AbortSignal): Promise<SavedSearchesResponse>;
  createSavedSearch(body: CreateSavedSearchBody): Promise<SavedSearch>;
  updateSavedSearch(id: string, body: UpdateSavedSearchBody): Promise<SavedSearch>;
  deleteSavedSearch(id: string): Promise<void>;
  /** Undoes a delete within 30 s (same id). 409 `restore_expired` after that. */
  restoreSavedSearch(id: string): Promise<SavedSearch>;
  markSavedSearchSeen(id: string): Promise<SavedSearch>;

  listNotifications(params: NotificationsParams, signal?: AbortSignal): Promise<NotificationsResponse>;
  getUnreadCount(signal?: AbortSignal): Promise<UnreadCountResponse>;
  markNotificationsRead(body: MarkNotificationsReadBody): Promise<UnreadCountResponse>;

  /** E-mail preferences: session only, no 402 gate (turning e-mail off is the user's right). */
  getNotificationPreferences(signal?: AbortSignal): Promise<NotificationPreferences>;
  updateNotificationPreferences(body: UpdateNotificationPreferencesBody): Promise<NotificationPreferences>;
  getRecommendationPreferences(signal?: AbortSignal): Promise<RecommendationPreferences>;
  updateRecommendationPreferences(body: {
    personalizationEnabled: boolean;
    deleteHistory?: boolean;
    showInternationalOpportunities?: boolean;
  }): Promise<RecommendationPreferences>;
  deleteRecommendationHistory(): Promise<void>;
  listRecommendations(params: { page?: number; pageSize?: number }, signal?: AbortSignal): Promise<RecommendationsResponse>;
  dismissRecommendation(tenderId: string, reason?: RecommendationDismissReason): Promise<void>;
  recordRecommendationEvent(event: RecommendationEvent): Promise<{ recorded: boolean }>;
  /** Public, no session: the signed token from the e-mail link. */
  unsubscribe(token: string, scope: UnsubscribeScope): Promise<UnsubscribeResponse>;
}
