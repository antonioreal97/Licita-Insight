import type { AiAdapter } from '../ai-adapter';
import type {
  AskTenderResult,
  CompanyProfileResponse,
  ProfileCategoriesResponse,
  ProfileDescriptionSuggestions,
  ProfileKeywordSuggestionsResponse,
  TenderAskStatus,
  TenderFitsResponse,
  TenderSheet,
} from '../../types';
import { getJson, sendJson } from './http-client';

/** Contract: docs/contracts/ai-v1.md. */
export const httpAiAdapter: AiAdapter = {
  getAskStatus: (tenderId, signal) => getJson<TenderAskStatus>(`/v1/tenders/${encodeURIComponent(tenderId)}/ask-status`, {}, signal),
  askTender: (tenderId, question) => sendJson<AskTenderResult>('POST', `/v1/tenders/${encodeURIComponent(tenderId)}/ask`, { question }),
  getTenderSheet: (tenderId, signal) => getJson<TenderSheet>(`/v1/tenders/${encodeURIComponent(tenderId)}/sheet`, {}, signal),

  getCompanyProfile: (signal) => getJson<CompanyProfileResponse>('/v1/me/company-profile', {}, signal),
  saveCompanyProfile: (profile) => sendJson<CompanyProfileResponse>('PUT', '/v1/me/company-profile', profile),
  deleteCompanyProfile: () => sendJson<void>('DELETE', '/v1/me/company-profile'),
  listProfileCategories: (signal) => getJson<ProfileCategoriesResponse>('/v1/profile/categories', {}, signal),
  suggestProfileKeywords: (query, signal) => getJson<ProfileKeywordSuggestionsResponse>('/v1/profile/keywords/suggest', { q: query }, signal),
  suggestProfileFiltersFromDescription: (description, signal) =>
    sendJson<ProfileDescriptionSuggestions>('POST', '/v1/profile/keywords/from-description', { description }, signal),
  getFits: (tenderIds, signal) => getJson<TenderFitsResponse>('/v1/me/fit', { tenderIds }, signal),
};
