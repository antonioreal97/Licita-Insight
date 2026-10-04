import type { ParticipationStage, TenderSummary } from '@/api/types';
import { formatDateTime, parseApiDate } from '@/lib/format';

export type NextStep = {
  /** Row of the table in docs/reviews/participation-mvp-ux-2026-09-28.md, section 8.3. */
  rule: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  title: string;
  details: string[];
  /** Rule 8 shows the deadline countdown next to the title. */
  withDeadline: boolean;
  /** Deadline passed while the user said "Vou participar": ask whether the proposal was sent (flow F5). */
  askSubmitted: boolean;
};

type Input = Pick<TenderSummary, 'status' | 'proposalDeadline' | 'openingAt'> & {
  monitored: boolean;
  /** The user's declared stage; `null` when the tender is not saved (or the visitor has no account). */
  stage: ParticipationStage | null;
  stageAt: string | null;
};

const SENT: (ParticipationStage | null)[] = ['submitted', 'awaiting_result'];

/**
 * "O que acontece agora", from official status and dates, plus the user's declared stage. First matching rule wins.
 * A declared stage only ever reads as "você marcou"; the portal's name is never given (not in the contract).
 */
export function nextStep({ status, proposalDeadline, openingAt, monitored, stage, stageAt }: Input, now: Date = new Date()): NextStep {
  const step = (rule: NextStep['rule'], title: string, details: string[], extra: Partial<NextStep> = {}): NextStep => ({
    rule,
    title,
    details,
    withDeadline: false,
    askSubmitted: false,
    ...extra,
  });
  const sent = SENT.includes(stage);

  if (status === 'cancelled') return step(1, 'O órgão revogou esta licitação.', ['Dado oficial da fonte.']);
  if (status === 'suspended') {
    return step(2, 'O órgão suspendeu esta licitação.', [monitored ? 'Avisamos aqui quando houver nova data.' : 'Monitore para ser avisado da nova data.']);
  }
  if (status === 'closed') {
    return step(3, 'Licitação encerrada na fonte.', sent ? ['Você marcou que enviou proposta. Consulte o resultado no portal oficial.'] : []);
  }

  const deadline = parseApiDate(proposalDeadline);
  if (!deadline) return step(4, 'A fonte não publicou o prazo de propostas.', ['Confira a data no edital.']);
  if (deadline.getTime() <= now.getTime()) {
    const details = ['A situação na fonte pode demorar a mudar.'];
    if (sent) details.push('Você marcou que enviou proposta. O resultado sai no portal oficial.');
    return step(5, `O prazo de propostas publicado terminou em ${formatDateTime(proposalDeadline)}.`, details, { askSubmitted: stage === 'participating' });
  }

  const opening = parseApiDate(openingAt);
  if (opening && opening.getTime() > now.getTime()) {
    return step(6, `O recebimento de propostas começa em ${formatDateTime(openingAt)}.`, [`Prazo final: ${formatDateTime(proposalDeadline)}.`]);
  }
  if (sent) {
    return step(7, `Você marcou que enviou proposta em ${formatDateTime(stageAt)}.`, [
      monitored ? 'O resultado sai no portal oficial. Avisamos aqui se o status mudar.' : 'O resultado sai no portal oficial. Monitore para ser avisado se o status mudar.',
    ]);
  }
  const details = ['O envio é feito no sistema indicado no edital, não pela Abriu lá.'];
  if (stage === 'analyzing') details.push('Decida antes disso.');
  return step(8, `Envie a proposta até ${formatDateTime(proposalDeadline)}.`, details, { withDeadline: true });
}
