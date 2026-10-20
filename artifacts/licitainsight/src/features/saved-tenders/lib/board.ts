import type { ParticipationStage, SavedTender } from '@/api/types';
import { STAGE_ORDER } from '@/features/participation/lib/stages';
import { cardDeadline } from './deadline-events';

/** Open columns, in pipeline order. "Não vou participar" is left out: it sits collapsed after them. */
export const BOARD_COLUMNS: ParticipationStage[] = STAGE_ORDER.filter((stage) => stage !== 'dismissed');

export const COLLAPSED_COLUMN: ParticipationStage = 'dismissed';

export type BoardColumn = { stage: ParticipationStage; items: SavedTender[] };

/**
 * One column per stage of `STAGE_ORDER` (empty ones included), "Não vou participar" last.
 * Inside a column: late deadlines first, then the nearest upcoming one, then cards without a deadline (newest saved first).
 */
export function groupByStage(items: SavedTender[], now: Date = new Date()): BoardColumn[] {
  const rank = new Map(
    items.map((item) => {
      const deadline = cardDeadline(item, now);
      return [item.tender.id, deadline ? [deadline.overdue ? 0 : 1, deadline.time] : [2, -Date.parse(item.savedAt)]] as const;
    }),
  );
  const order = (a: SavedTender, b: SavedTender) => {
    const [groupA, timeA] = rank.get(a.tender.id)!;
    const [groupB, timeB] = rank.get(b.tender.id)!;
    return groupA - groupB || timeA - timeB || a.tender.id.localeCompare(b.tender.id);
  };
  return [...BOARD_COLUMNS, COLLAPSED_COLUMN].map((stage) => ({ stage, items: items.filter((item) => item.stage === stage).sort(order) }));
}
