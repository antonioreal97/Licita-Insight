import { aiAdapter, type CompanyProfileInput } from '@/api';

/** Contract bounds for `question` (ai-v1). */
export const ASK_MIN_LENGTH = 3;
export const ASK_MAX_LENGTH = 300;

/** Profile limits (CODEX_HANDOFF-013). */
export const PROFILE_LIMITS = { descriptionMin: 20, descriptionMax: 600, terms: 20, termMin: 2, termMax: 80 } as const;

/** Batch size the fit endpoint accepts: the search page size maximum. */
export const FIT_BATCH_MAX = 100;

export const aiService = {
  getAskStatus: (tenderId: string, signal?: AbortSignal) => aiAdapter.getAskStatus(tenderId, signal),
  ask: (tenderId: string, question: string) => aiAdapter.askTender(tenderId, question.trim().replace(/\s+/g, ' ')),

  getTenderSheet: (tenderId: string, signal?: AbortSignal) => aiAdapter.getTenderSheet(tenderId, signal),

  getCompanyProfile: (signal?: AbortSignal) => aiAdapter.getCompanyProfile(signal),
  saveCompanyProfile: (profile: CompanyProfileInput) => aiAdapter.saveCompanyProfile(profile),
  deleteCompanyProfile: () => aiAdapter.deleteCompanyProfile(),
  listProfileCategories: (signal?: AbortSignal) => aiAdapter.listProfileCategories(signal),
  listProfilePlatforms: (signal?: AbortSignal) => aiAdapter.listProfilePlatforms(signal),
  suggestProfileKeywords: (query: string, signal?: AbortSignal) => aiAdapter.suggestProfileKeywords(query, signal),
  suggestProfileFiltersFromDescription: (description: string, signal?: AbortSignal) => aiAdapter.suggestProfileFiltersFromDescription(description, signal),
  /** Sorted and de-duplicated so the cache key does not depend on list order. */
  getFits: (tenderIds: string[], signal?: AbortSignal) => aiAdapter.getFits([...new Set(tenderIds)].sort().slice(0, FIT_BATCH_MAX), signal),
};
