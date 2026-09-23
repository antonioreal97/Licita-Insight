import type { OpportunityAdapter } from '../opportunity-adapter';
import type { OpportunitySearchResponse, OpportunitySummary } from '../../types';
import { getJson } from './http-client';

/** Contract: docs/contracts/opportunities-v1.md. */
export const httpOpportunityAdapter: OpportunityAdapter = {
  searchOpportunities: (params, signal) => getJson<OpportunitySearchResponse>('/v1/opportunities', params, signal),
  getOpportunity: (id, signal) => getJson<OpportunitySummary>(`/v1/opportunities/${encodeURIComponent(id)}`, {}, signal),
};
