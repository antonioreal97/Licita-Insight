import type { ParticipationStage, ParticipationChecklistItem, ParticipationTransition } from '@workspace/db';
import { InvalidParameterError } from '../lib/api-error';

export const STAGES = ['analyzing', 'participating', 'submitted', 'awaiting_result', 'completed', 'dismissed'] as const;
const KEYS = ['ato_societario', 'regularidade_fiscal', 'regularidade_trabalhista', 'qualificacao_tecnica', 'qualificacao_economica', 'site_visit', 'samples', 'bid_guarantee'];
type ChecklistPatch = Pick<ParticipationChecklistItem, 'key' | 'state'> & { note?: string | null };
export type ParticipationPatch = {
  stage?: ParticipationStage;
  protocol?: string | null;
  nextAction?: string | null;
  nextActionDeadline?: Date | null;
  checklist?: ChecklistPatch[];
};
const invalid = (field: string): never => { throw new InvalidParameterError(`${field} is invalid`, [{ field, issue: 'invalid_value' }]); };
export function parseStage(value: unknown): ParticipationStage | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !STAGES.includes(value as ParticipationStage)) return invalid('stage');
  return value as ParticipationStage;
}
function nullableText(value: unknown, field: string, max: number): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length > max) return invalid(field);
  return value.trim() || null;
}
export function parseParticipationPatch(body: Record<string, unknown>): ParticipationPatch {
  const allowed = new Set(['monitored', 'stage', 'protocol', 'nextAction', 'nextActionDeadline', 'checklist']);
  for (const key of Object.keys(body)) if (!allowed.has(key)) invalid(key);
  const patch: ParticipationPatch = {};
  if (body.stage !== undefined) patch.stage = parseStage(body.stage);
  if (body.protocol !== undefined) patch.protocol = nullableText(body.protocol, 'protocol', 200);
  if (body.nextAction !== undefined) patch.nextAction = nullableText(body.nextAction, 'nextAction', 500);
  if (body.nextActionDeadline !== undefined) {
    if (body.nextActionDeadline === null) patch.nextActionDeadline = null;
    else {
      const value = body.nextActionDeadline;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) invalid('nextActionDeadline');
      const date = new Date(value as string);
      if (!Number.isFinite(date.getTime())) invalid('nextActionDeadline');
      const calendar = (value as string).slice(0, 10);
      const day = new Date(`${calendar}T00:00:00Z`);
      if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== calendar || Number((value as string).slice(11, 13)) > 23) invalid('nextActionDeadline');
      patch.nextActionDeadline = date;
    }
  }
  if (body.checklist !== undefined) {
    if (!Array.isArray(body.checklist) || body.checklist.length > KEYS.length) invalid('checklist');
    const seen = new Set<string>();
    patch.checklist = (body.checklist as unknown[]).map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('checklist');
      const item = value as Record<string, unknown>;
      if (Object.keys(item).some(key => !['key', 'state', 'note'].includes(key))) invalid('checklist');
      if (typeof item.key !== 'string' || !KEYS.includes(item.key) || seen.has(item.key)) return invalid('checklist.key');
      if (!['have', 'missing', 'unknown'].includes(item.state as string)) return invalid('checklist.state');
      seen.add(item.key);
      return { key: item.key, state: item.state as ChecklistPatch['state'], ...(item.note !== undefined ? { note: nullableText(item.note, 'checklist.note', 1000) } : {}) };
    });
  }
  return patch;
}

/** Called under the per-user transaction lock: patches merge without overwriting other checklist keys. */
export function participationUpdate(existing: {
  stage: ParticipationStage; stageAt: Date; monitored: boolean;
  checklist: ParticipationChecklistItem[]; history: ParticipationTransition[];
} | undefined, patch: ParticipationPatch & { monitored?: boolean }, now: Date) {
  const stage = patch.stage ?? existing?.stage ?? 'analyzing';
  const changed = !existing || stage !== existing.stage;
  let monitored = patch.monitored ?? existing?.monitored ?? false;
  if (changed && ['participating', 'submitted', 'awaiting_result'].includes(stage)) monitored = true;
  if (changed && stage === 'dismissed') monitored = false;
  const checklist = new Map((existing?.checklist ?? []).map(item => [item.key, item]));
  for (const item of patch.checklist ?? []) {
    const previous = checklist.get(item.key);
    const note = item.note === undefined ? previous?.note ?? null : item.note;
    if (previous?.state === item.state && previous.note === note) continue;
    checklist.set(item.key, { key: item.key, state: item.state, note, updatedAt: now.toISOString() });
  }
  return {
    stage,
    stageAt: changed ? now : existing!.stageAt,
    monitored,
    checklist: [...checklist.values()],
    history: changed ? [...(existing?.history ?? []), { from: existing?.stage ?? null, to: stage, at: now.toISOString(), source: 'user' as const }] : existing!.history,
    ...(patch.protocol !== undefined ? { protocol: patch.protocol } : {}),
    ...(patch.nextAction !== undefined ? { nextAction: patch.nextAction } : {}),
    ...(patch.nextActionDeadline !== undefined ? { nextActionDeadline: patch.nextActionDeadline } : {}),
  };
}
