import type { AskTenderResult, CompanyProfileInput, CompanyProfileResponse, TenderAskStatus, TenderFitsResponse, TenderSheet } from '../types';

/** "Perguntar ao edital" and aderência. Components go through the services and hooks, not this adapter. */
export interface AiAdapter {
  getAskStatus(tenderId: string, signal?: AbortSignal): Promise<TenderAskStatus>;
  askTender(tenderId: string, question: string): Promise<AskTenderResult>;
  getTenderSheet(tenderId: string, signal?: AbortSignal): Promise<TenderSheet>;

  getCompanyProfile(signal?: AbortSignal): Promise<CompanyProfileResponse>;
  saveCompanyProfile(profile: CompanyProfileInput): Promise<CompanyProfileResponse>;
  deleteCompanyProfile(): Promise<void>;
  getFits(tenderIds: string[], signal?: AbortSignal): Promise<TenderFitsResponse>;
}
