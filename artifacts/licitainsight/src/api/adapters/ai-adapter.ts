import type { AskTenderResult, TenderAskStatus } from '../types';

/** "Perguntar ao edital". Components go through the service and hooks, not this adapter. */
export interface AiAdapter {
  getAskStatus(tenderId: string, signal?: AbortSignal): Promise<TenderAskStatus>;
  askTender(tenderId: string, question: string): Promise<AskTenderResult>;
}
