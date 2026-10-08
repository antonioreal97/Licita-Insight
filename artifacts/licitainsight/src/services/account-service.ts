import {
  accountAdapter,
  isApiError,
  type NotificationsParams,
  type SavedTendersParams,
  type SaveTenderBody,
  type TenderSearchParams,
  type UnsubscribeScope,
  type UpdateNotificationPreferencesBody,
  type User,
} from '@/api';
import { searchParamsToUrl } from './search-service';

/** Page size the saved-tenders API accepts (1–100). */
export const MAX_SAVED_TENDERS_PAGE_SIZE = 100;
/** Ids per `/me/saved-tenders/import` call (contract: ≤ 500). */
const IMPORT_LIMIT = 500;

let reportedAuthUnavailable = false;

/** Canonical `query` of a saved search: the search URL without `page`, `pageSize`, `view` and the leading `?`. */
export function savedSearchQuery(params: TenderSearchParams): string {
  const { page: _page, pageSize: _pageSize, ...rest } = params;
  return searchParamsToUrl(rest).replace(/^\?/, '');
}

const clampPageSize = (pageSize: number | undefined, max: number) => (pageSize === undefined ? undefined : Math.min(max, Math.max(1, Math.floor(pageSize))));

export const accountService = {
  /**
   * `null` = signed out (401). A 404 means this API has no auth routes yet (account-v1 not deployed):
   * treated as signed out so public pages keep working, and reported once in the console.
   */
  getSession: async (signal?: AbortSignal): Promise<User | null> => {
    try {
      return (await accountAdapter.getSession(signal)).user;
    } catch (error) {
      if (isApiError(error) && error.status === 401) return null;
      if (isApiError(error) && error.status === 404) {
        if (!reportedAuthUnavailable)
          console.error('[auth] GET /api/v1/auth/session respondeu 404: a API ainda não tem login. Seguindo como visitante.', error);
        reportedAuthUnavailable = true;
        return null;
      }
      throw error;
    }
  },
  /** `returnTo` must be an app path (starts with `/`); the API falls back to `/dashboard` otherwise. */
  googleSignInUrl: (returnTo: string) => accountAdapter.googleStartUrl(returnTo),
  logout: () => accountAdapter.logout(),
  exportAccountData: () => accountAdapter.exportAccountData(),
  deleteAccount: () => accountAdapter.deleteAccount(),

  getBilling: (signal?: AbortSignal) => accountAdapter.getBilling(signal),
  startCheckout: () => accountAdapter.startCheckout(),
  cancelBilling: () => accountAdapter.cancelBilling(),
  getPublicPlan: (signal?: AbortSignal) => accountAdapter.getPublicPlan(signal),

  listSavedTenders: (params: SavedTendersParams, signal?: AbortSignal) =>
    accountAdapter.listSavedTenders({ ...params, pageSize: clampPageSize(params.pageSize, MAX_SAVED_TENDERS_PAGE_SIZE) }, signal),
  getSavedTenderIds: (signal?: AbortSignal) => accountAdapter.getSavedTenderIds(signal),
  /** PUT is idempotent: saves the tender or updates `monitored` (omitted = keep / default false). Monitoring implies saving. */
  saveTender: (tenderId: string, monitored?: boolean) => accountAdapter.saveTender(tenderId, monitored === undefined ? {} : { monitored }),
  getSavedTender: (tenderId: string, signal?: AbortSignal) => accountAdapter.getSavedTender(tenderId, signal),
  /** Same PUT: saves the tender when needed (stage `analyzing` by default) and patches the participation fields sent. */
  updateParticipation: (tenderId: string, body: SaveTenderBody) => accountAdapter.saveTender(tenderId, body),
  removeSavedTender: (tenderId: string) => accountAdapter.removeSavedTender(tenderId),
  importSavedTenders: (ids: string[]) => {
    const unique = [...new Set(ids)];
    if (unique.length > IMPORT_LIMIT)
      console.error(`[saved-tenders] ${unique.length} ids locais; a importação envia só os ${IMPORT_LIMIT} primeiros (limite do contrato).`);
    return accountAdapter.importSavedTenders(unique.slice(0, IMPORT_LIMIT));
  },

  listSavedSearches: (signal?: AbortSignal) => accountAdapter.listSavedSearches(signal),
  createSavedSearch: (input: { name: string; params: TenderSearchParams; alertsEnabled: boolean }) =>
    accountAdapter.createSavedSearch({ name: input.name.trim(), query: savedSearchQuery(input.params), alertsEnabled: input.alertsEnabled }),
  updateSavedSearch: (id: string, input: { name?: string; params?: TenderSearchParams; alertsEnabled?: boolean }) =>
    accountAdapter.updateSavedSearch(id, {
      name: input.name?.trim(),
      query: input.params ? savedSearchQuery(input.params) : undefined,
      alertsEnabled: input.alertsEnabled,
    }),
  deleteSavedSearch: (id: string) => accountAdapter.deleteSavedSearch(id),
  restoreSavedSearch: (id: string) => accountAdapter.restoreSavedSearch(id),
  markSavedSearchSeen: (id: string) => accountAdapter.markSavedSearchSeen(id),

  listNotifications: (params: NotificationsParams, signal?: AbortSignal) =>
    accountAdapter.listNotifications({ ...params, pageSize: clampPageSize(params.pageSize, 50) }, signal),
  getUnreadCount: (signal?: AbortSignal) => accountAdapter.getUnreadCount(signal),
  markNotificationsRead: (input: { ids?: string[]; all?: boolean }) => accountAdapter.markNotificationsRead(input),

  getNotificationPreferences: (signal?: AbortSignal) => accountAdapter.getNotificationPreferences(signal),
  updateNotificationPreferences: (body: UpdateNotificationPreferencesBody) => accountAdapter.updateNotificationPreferences(body),
  getRecommendationPreferences: (signal?: AbortSignal) => accountAdapter.getRecommendationPreferences(signal),
  updateRecommendationPreferences: (personalizationEnabled: boolean, deleteHistory = !personalizationEnabled) =>
    accountAdapter.updateRecommendationPreferences({ personalizationEnabled, deleteHistory }),
  deleteRecommendationHistory: () => accountAdapter.deleteRecommendationHistory(),
  listRecommendations: (params: { page?: number; pageSize?: number }, signal?: AbortSignal) => accountAdapter.listRecommendations(params, signal),
  dismissRecommendation: (tenderId: string) => accountAdapter.dismissRecommendation(tenderId),
  recordRecommendationSearch: (query: string) => accountAdapter.recordRecommendationEvent({ type: 'search', query }),
  recordRecommendationView: (tenderId: string) => accountAdapter.recordRecommendationEvent({ type: 'tender_view', tenderId }),
  recordRecommendationClick: (tenderId: string) => accountAdapter.recordRecommendationEvent({ type: 'click', tenderId }),
  recordRecommendationInterest: (tenderId: string) => accountAdapter.recordRecommendationEvent({ type: 'interest', tenderId }),
  unsubscribe: (token: string, scope: UnsubscribeScope) => accountAdapter.unsubscribe(token, scope),
};
