import type { AiAdapter } from '../ai-adapter';
import type { AskTenderResult, TenderAskStatus } from '../../types';
import { getJson, sendJson } from './http-client';

/** Contract: docs/contracts/ai-v1.md. */
export const httpAiAdapter: AiAdapter = {
  getAskStatus: (tenderId, signal) => getJson<TenderAskStatus>(`/v1/tenders/${encodeURIComponent(tenderId)}/ask-status`, {}, signal),
  askTender: (tenderId, question) => sendJson<AskTenderResult>('POST', `/v1/tenders/${encodeURIComponent(tenderId)}/ask`, { question }),
};
