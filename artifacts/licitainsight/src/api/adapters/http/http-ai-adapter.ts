import type { AiAdapter } from '../ai-adapter';
import type {
  AskTenderResult,
  CompanyProfileResponse,
  ProfileCategoriesResponse,
  ProfileMunicipalitiesResponse,
  CompanyRegionPreviewResponse,
  ProfileDescriptionSuggestions,
  ProfileKeywordSuggestionsResponse,
  ProfileMatchPreview,
  ProfilePlatformsResponse,
  TenderAskStatus,
  TenderFitsResponse,
  TenderHighlightsResponse,
  TenderSheet,
} from '../../types';
import { getJson, sendJson } from './http-client';

const workspaceQuery = (workspaceId?: string) => workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';

/** Contract: docs/contracts/ai-v1.md. */
export const httpAiAdapter: AiAdapter = {
  getAskStatus: (tenderId, signal) => getJson<TenderAskStatus>(`/v1/tenders/${encodeURIComponent(tenderId)}/ask-status`, {}, signal),
  askTender: (tenderId, question) => sendJson<AskTenderResult>('POST', `/v1/tenders/${encodeURIComponent(tenderId)}/ask`, { question }),
  getTenderSheet: (tenderId, signal) => getJson<TenderSheet>(`/v1/tenders/${encodeURIComponent(tenderId)}/sheet`, {}, signal),

  getCompanyProfile: (workspaceId, signal) => getJson<CompanyProfileResponse>('/v1/me/company-profile', workspaceId ? { workspaceId } : {}, signal),
  saveCompanyProfile: (profile, workspaceId) => sendJson<CompanyProfileResponse>('PUT', `/v1/me/company-profile${workspaceQuery(workspaceId)}`, profile),
  deleteCompanyProfile: (workspaceId) => sendJson<void>('DELETE', `/v1/me/company-profile${workspaceQuery(workspaceId)}`),
  listProfileCategories: (signal) => getJson<ProfileCategoriesResponse>('/v1/profile/categories', {}, signal),
  listProfileMunicipalities: (query, signal) => getJson<ProfileMunicipalitiesResponse>('/v1/profile/municipalities', { q: query }, signal),
  getCompanyRegionPreview: (workspaceId, signal) => getJson<CompanyRegionPreviewResponse>('/v1/me/company-profile/region-preview', workspaceId ? { workspaceId } : {}, signal),
  listProfilePlatforms: (signal) => getJson<ProfilePlatformsResponse>('/v1/profile/platforms', {}, signal),
  suggestProfileKeywords: (query, signal) => getJson<ProfileKeywordSuggestionsResponse>('/v1/profile/keywords/suggest', { q: query }, signal),
  suggestProfileFiltersFromDescription: (description, signal) =>
    sendJson<ProfileDescriptionSuggestions>('POST', '/v1/profile/keywords/from-description', { description }, signal),
  previewProfileMatches: (input, signal) => sendJson<ProfileMatchPreview>('POST', '/v1/profile/match-preview', input, signal),
  getFits: (tenderIds, signal) => getJson<TenderFitsResponse>('/v1/me/fit', { tenderIds }, signal),
  getTenderHighlights: (tenderIds, signal) => getJson<TenderHighlightsResponse>('/v1/me/tender-highlights', { tenderIds }, signal),
};
