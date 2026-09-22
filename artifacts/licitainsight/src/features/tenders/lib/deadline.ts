import type { TenderStatus } from '@/api/types';
import { parseApiDate } from '@/lib/format';

/**
 * Urgency of a proposal deadline, relative to `now`.
 * - `critical`: closes today or tomorrow (São Paulo calendar days)
 * - `soon`: closes within 7 days
 * - `normal`: more than 7 days left
 * - `expired`: deadline already passed
 * - `inactive`: process is suspended/cancelled/closed — the countdown is meaningless
 * - `unknown`: source did not publish a deadline
 */
export type DeadlineUrgency = 'critical' | 'soon' | 'normal' | 'expired' | 'inactive' | 'unknown';

export type DeadlineInfo = {
  urgency: DeadlineUrgency;
  /** Full sentence, e.g. "Encerra em 3 dias". Always present so color is never the only signal. */
  label: string;
  /** Short form for dense tables, e.g. "em 3 dias", "hoje", "encerrado". */
  shortLabel: string;
  /** Calendar days until the deadline (negative when past); `null` when unknown. */
  daysLeft: number | null;
};

const TZ = 'America/Sao_Paulo';
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const DAY_MS = 86_400_000;

/** Whole calendar days between two instants, as seen in São Paulo. */
export function calendarDaysBetween(from: Date, to: Date): number {
  const [fy, fm, fd] = dayKey.format(from).split('-').map(Number);
  const [ty, tm, td] = dayKey.format(to).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

const ACTIVE_STATUSES: TenderStatus[] = ['open', 'under_review'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function getDeadlineInfo(deadline: string | null, status?: TenderStatus, now: Date = new Date()): DeadlineInfo {
  const date = parseApiDate(deadline);
  if (!date) return { urgency: 'unknown', label: 'Prazo não informado', shortLabel: 'não informado', daysLeft: null };

  const daysLeft = calendarDaysBetween(now, date);
  const msLeft = date.getTime() - now.getTime();

  // A closed process whose deadline already passed reads better as "Encerrou há N dias" (handled below).
  if (status && !ACTIVE_STATUSES.includes(status) && !(status === 'closed' && msLeft <= 0)) {
    const label = status === 'suspended' ? 'Prazo suspenso' : status === 'cancelled' ? 'Processo revogado' : 'Processo encerrado';
    return { urgency: 'inactive', label, shortLabel: status === 'suspended' ? 'suspenso' : 'sem prazo ativo', daysLeft };
  }

  if (msLeft <= 0) {
    const ago = -daysLeft;
    const label = ago === 0 ? 'Encerrou hoje' : ago === 1 ? 'Encerrou ontem' : `Encerrou há ${plural(ago, 'dia', 'dias')}`;
    return { urgency: 'expired', label, shortLabel: 'encerrado', daysLeft };
  }

  if (daysLeft <= 0) {
    const hours = Math.floor(msLeft / 3_600_000);
    if (hours < 1) {
      const minutes = Math.max(1, Math.round(msLeft / 60_000));
      return { urgency: 'critical', label: `Encerra em ${minutes} min`, shortLabel: `em ${minutes} min`, daysLeft };
    }
    return { urgency: 'critical', label: `Encerra hoje (${plural(hours, 'hora', 'horas')})`, shortLabel: 'hoje', daysLeft };
  }
  if (daysLeft === 1) return { urgency: 'critical', label: 'Encerra amanhã', shortLabel: 'amanhã', daysLeft };

  const urgency: DeadlineUrgency = daysLeft <= 7 ? 'soon' : 'normal';
  return { urgency, label: `Encerra em ${daysLeft} dias`, shortLabel: `em ${daysLeft} dias`, daysLeft };
}

/** True when the event instant is in the future relative to `now` (used to mark scheduled timeline events). */
export const isFuture = (value: string | null, now: Date = new Date()) => {
  const date = parseApiDate(value);
  return date ? date.getTime() > now.getTime() : false;
};
