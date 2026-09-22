import type { TenderSearchParams } from '@/api';

export const queryKeys = {
  tenders: {
    all: ['tenders'] as const,
    search: (params: TenderSearchParams) => ['tenders', 'search', params] as const,
    detail: (id: string) => ['tenders', 'detail', id] as const,
  },
  suggestions: (q: string) => ['suggestions', q] as const,
};
