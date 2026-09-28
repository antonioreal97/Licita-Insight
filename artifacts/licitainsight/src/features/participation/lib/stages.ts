import type { ChecklistState, ParticipationStage } from '@/api';

export const STAGE_ORDER: ParticipationStage[] = ['analyzing', 'participating', 'submitted', 'awaiting_result', 'completed', 'dismissed'];

/** "Analisando", not "Em análise": that one is the official `under_review` status shown in the same header. */
export const STAGE_LABELS: Record<ParticipationStage, string> = {
  analyzing: 'Analisando',
  participating: 'Preparando documentos',
  submitted: 'Participação enviada',
  awaiting_result: 'Aguardando resultado',
  completed: 'Concluída',
  dismissed: 'Não vou participar',
};

export const CHECKLIST_STATES: ChecklistState[] = ['have', 'missing', 'unknown'];

export const CHECKLIST_STATE_LABELS: Record<ChecklistState, string> = { have: 'Tenho', missing: 'Não tenho', unknown: 'Não sei' };

/** Contract: changing into these stages turns monitoring on; into `dismissed` turns it off. */
export const MONITORED_STAGES: ParticipationStage[] = ['participating', 'submitted', 'awaiting_result'];
