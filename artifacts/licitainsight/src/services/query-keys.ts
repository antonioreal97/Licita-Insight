import type { NotificationsParams, OpportunitySearchParams, SavedTendersParams, TenderSearchParams, TransparencyContractSearchParams } from '@/api';

export const queryKeys = {
  tenders: {
    all: ['tenders'] as const,
    search: (params: TenderSearchParams) => ['tenders', 'search', params] as const,
    detail: (id: string) => ['tenders', 'detail', id] as const,
  },
  suggestions: (q: string) => ['suggestions', q] as const,
  transparency: {
    all: ['transparency'] as const,
    contracts: (params: TransparencyContractSearchParams) => ['transparency', 'contracts', params] as const,
    tenderContracts: (tenderId: string) => ['transparency', 'tenders', tenderId, 'contracts'] as const,
    tenderResults: (tenderId: string) => ['transparency', 'tenders', tenderId, 'results'] as const,
  },
  opportunities: {
    all: ['opportunities'] as const,
    search: (params: OpportunitySearchParams) => ['opportunities', 'search', params] as const,
    detail: (id: string) => ['opportunities', 'detail', id] as const,
  },
  session: ['session'] as const,
  /** Public plan (price, trial length). Outside `me`: it survives sign-out. */
  billingPlan: ['billing', 'plan'] as const,
  /** Everything scoped to the signed-in user lives under `me`: sign-out removes it in one call. */
  me: {
    all: ['me'] as const,
    billing: ['me', 'billing'] as const,
    notificationPreferences: ['me', 'notification-preferences'] as const,
    recommendationPreferences: ['me', 'recommendation-preferences'] as const,
    recommendations: ['me', 'recommendations'] as const,
    /** Index state and quota of "Perguntar ao edital" for one tender (the quota is per user). */
    askStatus: (tenderId: string) => ['me', 'ask-status', tenderId] as const,
    /** The sheet is public tender data, but only served with access: it lives under `me` so sign-out drops it. */
    tenderSheet: (tenderId: string) => ['me', 'tender-sheet', tenderId] as const,
    companyProfile: ['me', 'company-profile'] as const,
    profileCategories: ['me', 'profile-categories'] as const,
    profilePlatforms: ['me', 'profile-platforms'] as const,
    profileKeywords: (query: string) => ['me', 'profile-keywords', query] as const,
    profileDescription: (description: string) => ['me', 'profile-description', description] as const,
    /** Saving or deleting the profile invalidates every fit (`fit.all`). */
    fit: {
      all: ['me', 'fit'] as const,
      batch: (tenderIds: string[]) => ['me', 'fit', [...new Set(tenderIds)].sort()] as const,
    },
    savedTenders: {
      all: ['me', 'saved-tenders'] as const,
      ids: ['me', 'saved-tenders', 'ids'] as const,
      list: (params: SavedTendersParams) => ['me', 'saved-tenders', 'list', params] as const,
      detail: (tenderId: string) => ['me', 'saved-tenders', 'detail', tenderId] as const,
    },
    savedSearches: ['me', 'saved-searches'] as const,
    notifications: {
      all: ['me', 'notifications'] as const,
      list: (params: NotificationsParams) => ['me', 'notifications', 'list', params] as const,
      unreadCount: ['me', 'notifications', 'unread-count'] as const,
    },
  },
};
