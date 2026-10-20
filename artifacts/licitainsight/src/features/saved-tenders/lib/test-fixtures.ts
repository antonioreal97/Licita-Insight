import type { ParticipationStage, SavedTender } from '@/api/types';

type Fixture = {
  id: string;
  stage?: ParticipationStage;
  proposalDeadline?: string | null;
  openingAt?: string | null;
  nextAction?: string | null;
  nextActionDeadline?: string | null;
  savedAt?: string;
  monitored?: boolean;
};

/** A saved tender with only the fields the board and the calendar read. Test data, never shown in the app. */
export function savedTender({ id, stage = 'analyzing', proposalDeadline = null, openingAt = null, nextAction = null, nextActionDeadline = null, savedAt = '2026-10-01T12:00:00Z', monitored = false }: Fixture): SavedTender {
  return {
    tender: { id, title: `Edital ${id}`, organization: { id: `org-${id}`, name: `Órgão ${id}` }, proposalDeadline, openingAt } as SavedTender['tender'],
    savedAt,
    monitored,
    monitoredAt: null,
    stage,
    stageAt: savedAt,
    participationSource: 'user',
    protocol: null,
    nextAction,
    nextActionDeadline,
    checklist: [],
    history: [],
  };
}
