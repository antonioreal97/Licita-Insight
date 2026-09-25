import type { AiAdapter } from '../ai-adapter';
import type { AskTenderResult, CompanyProfileResponse, TenderAskStatus, TenderFitsResponse } from '../../types';
import { getJson, sendJson } from './http-client';

/** Contract: docs/contracts/ai-v1.md. */
export const httpAiAdapter: AiAdapter = {
  getAskStatus: (tenderId, signal) => getJson<TenderAskStatus>(`/v1/tenders/${encodeURIComponent(tenderId)}/ask-status`, {}, signal),
  askTender: (tenderId, question) => sendJson<AskTenderResult>('POST', `/v1/tenders/${encodeURIComponent(tenderId)}/ask`, { question }),

  getCompanyProfile: (signal) => getJson<CompanyProfileResponse>('/v1/me/company-profile', {}, signal),
  saveCompanyProfile: (profile) => sendJson<CompanyProfileResponse>('PUT', '/v1/me/company-profile', profile),
  deleteCompanyProfile: () => sendJson<void>('DELETE', '/v1/me/company-profile'),
  getFits: (tenderIds, signal) => getJson<TenderFitsResponse>('/v1/me/fit', { tenderIds }, signal),
};
