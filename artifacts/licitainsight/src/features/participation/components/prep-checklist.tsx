import type { ChecklistKey } from '@/api';
import { formatDateNumeric } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSavedTender, useUpdateParticipation } from '../hooks/use-participation';
import { CHECKLIST_STATE_LABELS, CHECKLIST_STATES } from '../lib/stages';
import { ProvenanceLabel } from './provenance-label';

/**
 * "Tenho / Não tenho / Não sei" for one requirement found in the edital. No mark means "Não sei", never a checked document.
 * Marking a tender that is not saved yet saves it (stage Analisando).
 */
export function ChecklistControl({ tenderId, itemKey, label }: { tenderId: string; itemKey: ChecklistKey; label: string }) {
  const { saved, participation } = useSavedTender(tenderId);
  const { update, isPending } = useUpdateParticipation();
  const item = participation?.checklist.find((entry) => entry.key === itemKey);
  const state = item?.state ?? 'unknown';
  // Saved but not loaded yet: wait, so the first mark is not mistaken for a new save.
  const waiting = saved && !participation;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div role="group" aria-label={`Você tem: ${label}?`} className="grid w-full grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:inline-grid sm:w-auto" data-testid={`group-checklist-${itemKey}`}>
        {CHECKLIST_STATES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={state === option}
            disabled={waiting || isPending}
            onClick={() => state !== option && update({ tenderId, previous: participation, body: { checklist: [{ key: itemKey, state: option }] } })}
            className={cn(
              'h-11 rounded-lg px-3 type-ui font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50 sm:h-7',
              state === option && 'bg-surface text-foreground ',
            )}
            data-testid={`button-checklist-${itemKey}-${option}`}
          >
            {CHECKLIST_STATE_LABELS[option]}
          </button>
        ))}
      </div>
      {item && <ProvenanceLabel kind="user">Você marcou em {formatDateNumeric(item.updatedAt)}</ProvenanceLabel>}
    </div>
  );
}

/** Count of the user's marks over the requirements found in the current ficha; older marks for items no longer found are not counted. */
export function ChecklistSummary({ tenderId, keys }: { tenderId: string; keys: ChecklistKey[] }) {
  const { participation } = useSavedTender(tenderId);
  const marks = new Map(participation?.checklist.map((item) => [item.key, item.state]));
  const count = (state: 'have' | 'missing') => keys.filter((key) => marks.get(key) === state).length;
  const have = count('have');
  const missing = count('missing');
  const unknown = keys.length - have - missing;
  return (
    <p aria-live="polite" className="mb-3" data-testid="text-prep-summary">
      <ProvenanceLabel kind="user">
        Você marcou: {have} tenho, {missing} não tenho, {unknown} não sei (de {keys.length} {keys.length === 1 ? 'exigência encontrada' : 'exigências encontradas'}).
      </ProvenanceLabel>
    </p>
  );
}
