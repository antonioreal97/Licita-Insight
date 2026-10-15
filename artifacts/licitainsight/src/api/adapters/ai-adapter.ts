import type {
  AskTenderResult,
  CompanyProfileInput,
  CompanyProfileResponse,
  ProfileCategoriesResponse,
  ProfileMunicipalitiesResponse,
  CompanyRegionPreviewResponse,
  ProfileDescriptionSuggestions,
  ProfileKeywordSuggestionsResponse,
  ProfilePlatformsResponse,
  TenderAskStatus,
  TenderFitsResponse,
  TenderHighlightsResponse,
  TenderSheet,
} from '../types';

/** "Perguntar ao edital" and aderência. Components go through the services and hooks, not this adapter. */
export interface AiAdapter {
  getAskStatus(tenderId: string, signal?: AbortSignal): Promise<TenderAskStatus>;
  askTender(tenderId: string, question: string): Promise<AskTenderResult>;
  getTenderSheet(tenderId: string, signal?: AbortSignal): Promise<TenderSheet>;

  getCompanyProfile(signal?: AbortSignal): Promise<CompanyProfileResponse>;
  saveCompanyProfile(profile: CompanyProfileInput): Promise<CompanyProfileResponse>;
  deleteCompanyProfile(): Promise<void>;
  listProfileCategories(signal?: AbortSignal): Promise<ProfileCategoriesResponse>;
  listProfileMunicipalities(query: string, signal?: AbortSignal): Promise<ProfileMunicipalitiesResponse>;
  getCompanyRegionPreview(signal?: AbortSignal): Promise<CompanyRegionPreviewResponse>;
  listProfilePlatforms(signal?: AbortSignal): Promise<ProfilePlatformsResponse>;
  suggestProfileKeywords(query: string, signal?: AbortSignal): Promise<ProfileKeywordSuggestionsResponse>;
  suggestProfileFiltersFromDescription(description: string, signal?: AbortSignal): Promise<ProfileDescriptionSuggestions>;
  getFits(tenderIds: string[], signal?: AbortSignal): Promise<TenderFitsResponse>;
  getTenderHighlights(tenderIds: string[], signal?: AbortSignal): Promise<TenderHighlightsResponse>;
}
