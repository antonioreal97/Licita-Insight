import { useId } from 'react';
import { ArrowDown, CalendarClock } from 'lucide-react';
import type { TenderDetail } from '@/api';
import { Button } from '@/components/common/action-button';
import { GlossaryText } from '@/features/help/components/glossary-text';
import { DeadlineIndicator } from '@/features/tenders/components/deadline-indicator';
import { isFuture } from '@/features/tenders/lib/deadline';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSavedTender, useUpdateParticipation } from '../hooks/use-participation';
import { nextStep } from '../lib/next-step';

const linkClass = 'font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring';

/** "O que acontece agora": one sentence from official status and dates and the user's declared stage, plus the nearest scheduled timeline event. */
export function NextStepsPanel({ tender, monitored }: { tender: TenderDetail; monitored: boolean }) {
  const titleId = useId();
  const questionId = useId();
  const { participation } = useSavedTender(tender.id);
  const { update, pendingStage } = useUpdateParticipation();
  const step = nextStep({
    status: tender.status,
    proposalDeadline: tender.proposalDeadline,
    openingAt: tender.openingAt,
    monitored,
    stage: participation?.stage ?? null,
    stageAt: participation?.stageAt ?? null,
  });
  const upcoming = tender.timeline.filter((event) => isFuture(event.at)).sort((a, b) => a.at.localeCompare(b.at))[0];

  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-border bg-card p-5 sm:p-7" data-testid="panel-next-steps" data-rule={step.rule}>
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock size={17} aria-hidden="true" className="text-primary" />
        <h2 id={titleId} className="type-section text-foreground">
          O que acontece agora
        </h2>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body font-semibold text-foreground" data-testid="text-next-step">
        <span>
          <GlossaryText>{step.title}</GlossaryText>
        </span>
        {step.withDeadline && <DeadlineIndicator deadline={tender.proposalDeadline} status={tender.status} variant="inline" />}
      </p>
      {step.details.map((detail) => (
        <p key={detail} className="mt-1 type-meta text-muted-foreground">
          <GlossaryText>{detail}</GlossaryText>
        </p>
      ))}
      {step.askSubmitted && participation && (
        <div role="group" aria-labelledby={questionId} className="mt-4 rounded-lg border border-border bg-muted px-4 py-3" data-testid="group-ask-submitted">
          <p id={questionId} className="type-ui font-semibold text-foreground">
            O prazo terminou. Você enviou proposta?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={pendingStage === 'submitted'}
              onClick={() => update({ tenderId: tender.id, previous: participation, body: { stage: 'submitted' } })}
              className="h-11 sm:h-8"
              data-testid="button-ask-submitted-yes"
            >
              Enviei proposta
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={pendingStage === 'dismissed'}
              onClick={() => update({ tenderId: tender.id, previous: participation, body: { stage: 'dismissed' } })}
              className="h-11 sm:h-8"
              data-testid="button-ask-submitted-no"
            >
              Não enviei
            </Button>
          </div>
        </div>
      )}
      {upcoming && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border-subtle pt-4 type-meta text-muted-foreground" data-testid="text-next-event">
          <span className="rounded-lg bg-primary-subtle px-1.5 py-0.5 text-xs font-semibold text-primary-subtle-foreground">Previsto</span>
          <time dateTime={upcoming.at} className="tabular-nums">
            {formatDateTime(upcoming.at)}
          </time>
          <span aria-hidden="true">·</span>
          <span className="break-words text-foreground/90">{upcoming.description}</span>
        </p>
      )}
      <a href="#cronologia" className={cn('mt-4 inline-flex items-center gap-1 type-meta', linkClass)} data-testid="link-next-steps-timeline">
        Ver cronologia completa
        <ArrowDown size={13} aria-hidden="true" />
      </a>
    </section>
  );
}
