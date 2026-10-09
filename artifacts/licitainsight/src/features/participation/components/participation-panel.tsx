import { useId, useState, type FormEvent } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import type { ParticipationStage, SavedTender, SaveTenderBody } from '@/api';
import { Button } from '@/components/common/action-button';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSavedTender, useUpdateParticipation } from '../hooks/use-participation';
import { STAGE_LABELS, STAGE_ORDER } from '../lib/stages';
import { ErrorLine, withRef } from './error-line';
import { ProvenanceLabel } from './provenance-label';

/** Before the tender is saved: the three answers to "o que você vai fazer com este edital". Any of them saves it. */
const ENTRY: { stage: ParticipationStage; label: string }[] = [
  { stage: 'analyzing', label: 'Vou analisar' },
  { stage: 'participating', label: 'Vou participar' },
  { stage: 'dismissed', label: 'Não é para mim' },
];

const pad = (value: number) => String(value).padStart(2, '0');
/** ISO → `datetime-local` value in the browser's time zone. */
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Next action, its deadline and the protocol: free text the user types, saved only when changed. */
function ParticipationForm({ current, saving, onSave }: { current: SavedTender; saving: boolean; onSave: (body: SaveTenderBody) => void }) {
  const ids = useId();
  const [nextAction, setNextAction] = useState(current.nextAction ?? '');
  const [deadline, setDeadline] = useState(toLocalInput(current.nextActionDeadline));
  const [protocol, setProtocol] = useState(current.protocol ?? '');

  const body: SaveTenderBody = {};
  if (nextAction.trim() !== (current.nextAction ?? '')) body.nextAction = nextAction.trim() || null;
  if (deadline !== toLocalInput(current.nextActionDeadline)) body.nextActionDeadline = deadline ? new Date(deadline).toISOString() : null;
  if (protocol.trim() !== (current.protocol ?? '')) body.protocol = protocol.trim() || null;
  const dirty = Object.keys(body).length > 0;

  const reset = () => {
    setNextAction(current.nextAction ?? '');
    setDeadline(toLocalInput(current.nextActionDeadline));
    setProtocol(current.protocol ?? '');
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (dirty) onSave(body);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2" data-testid="form-participation">
      <label className="field sm:col-span-2">
        Próxima ação
        <textarea
          value={nextAction}
          maxLength={500}
          onChange={(event) => setNextAction(event.target.value)}
          placeholder="Ex.: Pedir a certidão de regularidade fiscal ao contador."
          aria-describedby={`${ids}-action-hint`}
          data-testid="input-next-action"
        />
        <span id={`${ids}-action-hint`} className="type-meta font-normal">
          O que falta fazer. {nextAction.trim().length}/500
        </span>
      </label>
      <label className="field">
        Prazo da próxima ação
        <input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} data-testid="input-next-action-deadline" />
        <span className="type-meta font-normal">Seu prazo, não o do edital.</span>
      </label>
      <label className="field">
        Protocolo
        <input
          value={protocol}
          maxLength={200}
          onChange={(event) => setProtocol(event.target.value)}
          placeholder="Ex.: número do recibo de envio"
          aria-describedby={`${ids}-protocol-hint`}
          data-testid="input-protocol"
        />
        <span id={`${ids}-protocol-hint`} className="type-meta font-normal">
          O Pardal Digital não confere este número no sistema de compras.
        </span>
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" variant="dark" disabled={!dirty} loading={saving} className="h-11 sm:h-9" data-testid="button-save-participation">
          Salvar
        </Button>
        {dirty && (
          <Button type="button" variant="ghost" onClick={reset} className="h-11 sm:h-9">
            Descartar alterações
          </Button>
        )}
      </div>
    </form>
  );
}

function History({ history }: { history: SavedTender['history'] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (history.length < 2) return null;
  return (
    <div className="mt-5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-lg type-meta font-semibold text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring"
        data-testid="button-stage-history"
      >
        {open ? 'Ocultar histórico' : `Ver histórico (${history.length} mudanças)`}
        <ChevronDown size={13} aria-hidden="true" className={cn('transition-transform duration-fast ease-standard', open && 'rotate-180')} />
      </button>
      {open && (
        <ol id={listId} className="mt-2 space-y-1 border-l-2 border-border pl-3 type-meta text-muted-foreground" data-testid="list-stage-history">
          {[...history].reverse().map((entry) => (
            <li key={`${entry.at}-${entry.to}`}>
              <time dateTime={entry.at} className="tabular-nums">
                {formatDateTime(entry.at)}
              </time>
              {' · '}
              <span className="text-foreground/90">
                {entry.from ? `De ${STAGE_LABELS[entry.from]} para ${STAGE_LABELS[entry.to]}` : `Salvo como ${STAGE_LABELS[entry.to]}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * "Sua participação" on the tender detail: stage, next action and protocol. Everything here is the user's declaration
 * (participation-v1); nothing says the proposal reached the agency. Visible to everyone; acting goes through the saving gate.
 */
export function ParticipationPanel({ tenderId }: { tenderId: string }) {
  const titleId = useId();
  const { query, saved, participation: current } = useSavedTender(tenderId);
  const { update, pendingStage, isPending } = useUpdateParticipation();
  const setStage = (stage: ParticipationStage) => update({ tenderId, previous: current, body: { stage } });

  let body;
  if (saved && !current && query.isError) {
    body = <ErrorLine testId="text-participation-error" message={withRef('Não foi possível carregar sua participação.', query.error)} onRetry={() => query.refetch()} />;
  } else if (saved && !current && !isPending) {
    body = <div aria-busy="true" aria-label="Carregando" className="h-24 animate-pulse rounded-lg bg-muted" />;
  } else if (!current) {
    body = (
      <>
        <div role="group" aria-label="O que você vai fazer com este edital" className="flex flex-wrap gap-2" data-testid="group-stage-entry">
          {ENTRY.map(({ stage, label }) => (
            <Button
              key={stage}
              variant="outline"
              loading={pendingStage === stage}
              disabled={isPending && pendingStage !== stage}
              onClick={() => setStage(stage)}
              className="h-11 sm:h-9"
              data-testid={`button-stage-${stage}`}
            >
              {label}
            </Button>
          ))}
        </div>
        <p className="mt-3 type-meta text-muted-foreground">
          A escolha salva o edital na sua conta. “Vou participar” também liga o monitoramento.
        </p>
      </>
    );
  } else {
    body = (
      <>
        <div role="group" aria-label="Etapa deste edital" className="flex flex-wrap gap-2" data-testid="group-stage">
          {STAGE_ORDER.map((stage) => (
            <Button
              key={stage}
              variant="outline"
              aria-pressed={current.stage === stage}
              loading={pendingStage === stage}
              disabled={isPending}
              onClick={() => current.stage !== stage && setStage(stage)}
              className="h-11 sm:h-9"
              data-testid={`button-stage-${stage}`}
            >
              {STAGE_LABELS[stage]}
            </Button>
          ))}
        </div>
        <p aria-live="polite" className="mt-3" data-testid="text-stage-current">
          <ProvenanceLabel kind="user">
            Você marcou: {STAGE_LABELS[current.stage]} · {formatDateTime(current.stageAt)}
          </ProvenanceLabel>
        </p>
        <div className="mt-6 border-t border-border-subtle pt-6">
          <ParticipationForm
            // Remount with the saved values after each save (or a change from another tab).
            key={`${current.nextAction}|${current.nextActionDeadline}|${current.protocol}`}
            current={current}
            saving={isPending && pendingStage === undefined}
            onSave={(patch) => update({ tenderId, previous: current, body: patch })}
          />
        </div>
        {/* Secondary: the next action and its deadline come first. */}
        <History history={current.history} />
      </>
    );
  }

  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-border bg-card p-5 sm:p-7" data-testid="panel-participation">
      <div className="flex items-center gap-2">
        <UserRound size={17} aria-hidden="true" className="text-primary" />
        <h2 id={titleId} className="type-section text-foreground">
          Sua participação
        </h2>
      </div>
      <ProvenanceLabel kind="user" className="mt-1 mb-4 flex">
        Informado por você. O Pardal Digital não envia propostas nem confirma envio, protocolo ou resultado no portal oficial.
      </ProvenanceLabel>
      {body}
    </section>
  );
}
