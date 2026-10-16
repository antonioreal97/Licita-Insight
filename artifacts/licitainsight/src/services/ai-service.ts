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

  getCompanyProfile: (workspaceId?: string, signal?: AbortSignal) => aiAdapter.getCompanyProfile(workspaceId, signal),
  saveCompanyProfile: (profile: CompanyProfileInput, workspaceId?: string) => aiAdapter.saveCompanyProfile(profile, workspaceId),
  deleteCompanyProfile: (workspaceId?: string) => aiAdapter.deleteCompanyProfile(workspaceId),
  listProfileCategories: (signal?: AbortSignal) => aiAdapter.listProfileCategories(signal),
  listProfileMunicipalities: (query: string, signal?: AbortSignal) => aiAdapter.listProfileMunicipalities(query, signal),
  getCompanyRegionPreview: (workspaceId?: string, signal?: AbortSignal) => aiAdapter.getCompanyRegionPreview(workspaceId, signal),
  listProfilePlatforms: (signal?: AbortSignal) => aiAdapter.listProfilePlatforms(signal),
  suggestProfileKeywords: (query: string, signal?: AbortSignal) => aiAdapter.suggestProfileKeywords(query, signal),
  suggestProfileFiltersFromDescription: (description: string, signal?: AbortSignal) => aiAdapter.suggestProfileFiltersFromDescription(description, signal),
  previewProfileMatches: (input: { terms: string[]; categories: string[] }, signal?: AbortSignal) => aiAdapter.previewProfileMatches(input, signal),
  /** Sorted and de-duplicated so the cache key does not depend on list order. */
  getFits: (tenderIds: string[], signal?: AbortSignal) => aiAdapter.getFits([...new Set(tenderIds)].sort().slice(0, FIT_BATCH_MAX), signal),
  /** Same batch rules as the fits; the API only reads sheets that are already ready. */
  getTenderHighlights: (tenderIds: string[], signal?: AbortSignal) =>
    aiAdapter.getTenderHighlights([...new Set(tenderIds)].sort().slice(0, FIT_BATCH_MAX), signal),
};
