import type { NotificationsParams, SavedTendersParams, TenderSearchParams } from '@/api';

export const queryKeys = {
  tenders: {
    all: ['tenders'] as const,
    search: (params: TenderSearchParams) => ['tenders', 'search', params] as const,
    detail: (id: string) => ['tenders', 'detail', id] as const,
  },
  suggestions: (q: string) => ['suggestions', q] as const,
  session: ['session'] as const,
  /** Everything scoped to the signed-in user lives under `me`: sign-out removes it in one call. */
  me: {
    all: ['me'] as const,
    savedTenders: {
      all: ['me', 'saved-tenders'] as const,
      ids: ['me', 'saved-tenders', 'ids'] as const,
      list: (params: SavedTendersParams) => ['me', 'saved-tenders', 'list', params] as const,
    },
    savedSearches: ['me', 'saved-searches'] as const,
    notifications: {
      all: ['me', 'notifications'] as const,
      list: (params: NotificationsParams) => ['me', 'notifications', 'list', params] as const,
      unreadCount: ['me', 'notifications', 'unread-count'] as const,
    },
  },
};
