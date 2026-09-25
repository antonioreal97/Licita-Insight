import { aiAdapter } from '@/api';

/** Contract bounds for `question` (ai-v1). */
export const ASK_MIN_LENGTH = 3;
export const ASK_MAX_LENGTH = 300;

export const aiService = {
  getAskStatus: (tenderId: string, signal?: AbortSignal) => aiAdapter.getAskStatus(tenderId, signal),
  ask: (tenderId: string, question: string) => aiAdapter.askTender(tenderId, question.trim().replace(/\s+/g, ' ')),
};
