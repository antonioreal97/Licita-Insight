import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompanyProfileInput, CompanyProfileResponse, TenderFitsResponse } from '@/api';
import { useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { aiService, PROFILE_LIMITS } from '@/services/ai-service';
import { queryKeys } from '@/services/query-keys';

/** The signed-in user's company profile (`profile: null` until saved). No access needed to read or edit it. */
export function useCompanyProfile() {
  const { status } = useSession();
  return useQuery({
    queryKey: queryKeys.me.companyProfile,
    queryFn: ({ signal }) => aiService.getCompanyProfile(signal),
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
}

export function useProfileCategories() {
  return useQuery({
    queryKey: queryKeys.me.profileCategories,
    queryFn: ({ signal }) => aiService.listProfileCategories(signal),
    staleTime: 15 * 60_000,
  });
}

export function useProfileMunicipalities(query: string) {
  const normalized = query.trim();
  return useQuery({
    queryKey: queryKeys.me.profileMunicipalities(normalized),
    queryFn: ({ signal }) => aiService.listProfileMunicipalities(normalized, signal),
    enabled: normalized.length >= 2,
    staleTime: 60 * 60_000,
  });
}

export function useCompanyRegionPreview(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.me.companyRegionPreview,
    queryFn: ({ signal }) => aiService.getCompanyRegionPreview(signal),
    enabled,
    staleTime: 60_000,
  });
}

export function useProfilePlatforms() {
  return useQuery({
    queryKey: queryKeys.me.profilePlatforms,
    queryFn: ({ signal }) => aiService.listProfilePlatforms(signal),
    staleTime: 15 * 60_000,
  });
}

/** Platforms the signed-in company declared; empty while loading, signed out or without a profile. */
export function useRegisteredPlatforms(): string[] {
  return useCompanyProfile().data?.profile?.registeredPlatforms ?? [];
}

export function useProfileKeywordSuggestions(query: string) {
  const normalized = query.trim();
  return useQuery({
    queryKey: queryKeys.me.profileKeywords(normalized),
    queryFn: ({ signal }) => aiService.suggestProfileKeywords(normalized, signal),
    enabled: normalized.length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function useProfileDescriptionSuggestions(description: string) {
  const normalized = description.trim();
  return useQuery({
    queryKey: queryKeys.me.profileDescription(normalized),
    queryFn: ({ signal }) => aiService.suggestProfileFiltersFromDescription(normalized, signal),
    enabled: normalized.length >= PROFILE_LIMITS.descriptionMin,
    staleTime: 5 * 60_000,
  });
}

/**
 * "≈ N editais abertos combinam" for the terms and categories being edited (not yet saved). The caller debounces;
 * sorted lists keep the cache key stable when only the order changes. The previous count stays on screen while
 * the next one loads.
 */
export function useProfileMatchPreview(terms: string[], categories: string[]) {
  const sortedTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))].sort();
  const sortedCategories = [...new Set(categories)].sort();
  return useQuery({
    queryKey: queryKeys.me.profileMatchPreview(sortedTerms, sortedCategories),
    queryFn: ({ signal }) => aiService.previewProfileMatches({ terms: sortedTerms, categories: sortedCategories }, signal),
    enabled: sortedTerms.length + sortedCategories.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

/** Full PUT. A new `version` makes every stored fit stale, so the fits are dropped and refetched. */
export function useSaveCompanyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: CompanyProfileInput) => aiService.saveCompanyProfile(profile),
    onSuccess: (response) => {
      queryClient.setQueryData<CompanyProfileResponse>(queryKeys.me.companyProfile, response);
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.companyRegionPreview });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.fit.all });
      // Recommendations (and the triage deck, cached with staleTime Infinity) follow the profile.
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.recommendations });
    },
    onError: (error) => console.error('[perfil] Falha ao salvar o perfil da empresa.', error),
  });
}

export function useDeleteCompanyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => aiService.deleteCompanyProfile(),
    onSuccess: () => {
      queryClient.setQueryData<CompanyProfileResponse>(queryKeys.me.companyProfile, { profile: null });
      queryClient.removeQueries({ queryKey: queryKeys.me.companyRegionPreview });
      queryClient.removeQueries({ queryKey: queryKeys.me.fit.all });
      queryClient.removeQueries({ queryKey: queryKeys.me.recommendations });
    },
    onError: (error) => console.error('[perfil] Falha ao apagar o perfil da empresa.', error),
  });
}

/** 2 s, 4 s, 8 s, then 10 s; gives up after ~2 min so a stuck queue doesn't poll forever (the badge just stays hidden). */
const MAX_POLLS = 14;
const pollDelay = (attempt: number) => Math.min(2_000 * 2 ** attempt, 10_000);

/**
 * Fits for the visible tenders, one request per list. Only runs when there is something to show:
 * signed in, with access (402 otherwise) and a saved profile.
 */
export function useTenderFits(tenderIds: string[]) {
  const billing = useBilling();
  const profile = useCompanyProfile();
  const enabled = tenderIds.length > 0 && billing.data?.entitled === true && Boolean(profile.data?.profile);
  return useQuery({
    queryKey: queryKeys.me.fit.batch(tenderIds),
    queryFn: ({ signal }) => aiService.getFits(tenderIds, signal),
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const data = query.state.data as TenderFitsResponse | undefined;
      const pending = data && Object.values(data.results).some((fit) => fit.status === 'pending');
      const attempt = query.state.dataUpdateCount - 1;
      return pending && attempt < MAX_POLLS ? pollDelay(attempt) : false;
    },
  });
}
