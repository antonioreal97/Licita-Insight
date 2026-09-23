import type {
  BillingCheckoutResponse,
  BillingResponse,
  CreateSavedSearchBody,
  ImportSavedTendersResponse,
  MarkNotificationsReadBody,
  NotificationsParams,
  NotificationsResponse,
  SavedSearch,
  SavedSearchesResponse,
  SavedTender,
  SavedTenderIdsResponse,
  SavedTendersParams,
  SavedTendersResponse,
  SessionResponse,
  UnreadCountResponse,
  UpdateSavedSearchBody,
} from '../types';

/**
 * Boundary for the signed-in user's data (docs/contracts/account-v1.md). Everything under `/me` needs the session cookie.
 * Implementation: httpAccountAdapter. Components never import an adapter — they go through services and hooks.
 */
export interface AccountAdapter {
  getSession(signal?: AbortSignal): Promise<SessionResponse>;
  /** Full-page URL that starts the Google OAuth flow; the API redirects back to `returnTo`. */
  googleStartUrl(returnTo: string): string;
  logout(): Promise<void>;

  getBilling(signal?: AbortSignal): Promise<BillingResponse>;
  startCheckout(): Promise<BillingCheckoutResponse>;
  cancelBilling(): Promise<BillingResponse>;

  listSavedTenders(params: SavedTendersParams, signal?: AbortSignal): Promise<SavedTendersResponse>;
  getSavedTenderIds(signal?: AbortSignal): Promise<SavedTenderIdsResponse>;
  saveTender(tenderId: string, body: { monitored?: boolean }): Promise<SavedTender>;
  removeSavedTender(tenderId: string): Promise<void>;
  importSavedTenders(ids: string[]): Promise<ImportSavedTendersResponse>;

  listSavedSearches(signal?: AbortSignal): Promise<SavedSearchesResponse>;
  createSavedSearch(body: CreateSavedSearchBody): Promise<SavedSearch>;
  updateSavedSearch(id: string, body: UpdateSavedSearchBody): Promise<SavedSearch>;
  deleteSavedSearch(id: string): Promise<void>;
  markSavedSearchSeen(id: string): Promise<SavedSearch>;

  listNotifications(params: NotificationsParams, signal?: AbortSignal): Promise<NotificationsResponse>;
  getUnreadCount(signal?: AbortSignal): Promise<UnreadCountResponse>;
  markNotificationsRead(body: MarkNotificationsReadBody): Promise<UnreadCountResponse>;
}
