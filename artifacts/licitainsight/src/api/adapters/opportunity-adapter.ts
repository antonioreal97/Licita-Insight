import type { OpportunitySearchParams, OpportunitySearchResponse, OpportunitySummary } from '../types';

/** Reads cultural calls. Components go through the service and hooks, not this adapter. */
export interface OpportunityAdapter {
  searchOpportunities(params: OpportunitySearchParams, signal?: AbortSignal): Promise<OpportunitySearchResponse>;
  getOpportunity(id: string, signal?: AbortSignal): Promise<OpportunitySummary>;
}
