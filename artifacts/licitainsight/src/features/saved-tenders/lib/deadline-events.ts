import type { ParticipationStage, SavedTender } from '@/api/types';
import { formatTime, parseApiDate } from '@/lib/format';

/**
 * Only the dates the data really has:
 * - `proposal`: the tender's official proposal deadline (`proposalDeadline`);
 * - `opening`: when the source starts receiving proposals (`openingAt`, PNCP `dataAberturaProposta`). It is not the session;
 * - `personal`: the deadline the user set for their next action (`nextActionDeadline` + `nextAction`).
 */
export type DeadlineKind = 'proposal' | 'opening' | 'personal';

export const DEADLINE_KINDS: DeadlineKind[] = ['proposal', 'opening', 'personal'];

export const DEADLINE_KIND_LABELS: Record<DeadlineKind, string> = {
  proposal: 'Envio da proposta',
  opening: 'Início das propostas',
  personal: 'Prazo pessoal',
};

export type DeadlineEvent = {
  /** `<tenderId>:<kind>`, unique per list. */
  id: string;
  kind: DeadlineKind;
  tenderId: string;
  title: string;
  organization: string;
  stage: ParticipationStage;
  /** The API value as sent (ISO date-time or `YYYY-MM-DD`). */
  at: string;
  time: number;
  /** `YYYY-MM-DD` of the calendar day in São Paulo. */
  day: string;
  /** "18:00" in São Paulo; `null` for date-only values (no fake time). */
  clock: string | null;
  /** The user's next action, on `personal` events. */
  note: string | null;
  past: boolean;
  /** Past, and still owed by the user at this stage: highlighted. */
  overdue: boolean;
};

const TZ = 'America/Sao_Paulo';
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** `YYYY-MM-DD` of an instant as seen in São Paulo. */
export const spDayKey = (date: Date) => dayFormat.format(date);

/** Stages that still owe the proposal: a past proposal deadline there is late, elsewhere it is history. */
const OWES_PROPOSAL: ParticipationStage[] = ['analyzing', 'participating'];

function isOverdue(kind: DeadlineKind, stage: ParticipationStage, past: boolean) {
  if (!past) return false;
  if (kind === 'proposal') return OWES_PROPOSAL.includes(stage);
  if (kind === 'personal') return stage !== 'completed';
  return false;
}

const KIND_ORDER: Record<DeadlineKind, number> = { opening: 0, proposal: 1, personal: 2 };

const byTime = (a: DeadlineEvent, b: DeadlineEvent) => a.time - b.time || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.tenderId.localeCompare(b.tenderId);

/** The dated events of one saved tender, whatever its stage. Missing or invalid dates produce nothing. */
export function tenderDeadlineEvents(item: SavedTender, now: Date = new Date()): DeadlineEvent[] {
  const sources: [DeadlineKind, string | null][] = [
    ['proposal', item.tender.proposalDeadline],
    ['opening', item.tender.openingAt],
    ['personal', item.nextActionDeadline],
  ];
  const events: DeadlineEvent[] = [];
  for (const [kind, at] of sources) {
    const date = parseApiDate(at);
    if (!at || !date) continue;
    const past = date.getTime() <= now.getTime();
    events.push({
      id: `${item.tender.id}:${kind}`,
      kind,
      tenderId: item.tender.id,
      title: item.tender.title,
      organization: item.tender.organization.name,
      stage: item.stage,
      at,
      time: date.getTime(),
      day: spDayKey(date),
      clock: formatTime(at),
      note: kind === 'personal' ? item.nextAction : null,
      past,
      overdue: isOverdue(kind, item.stage, past),
    });
  }
  return events.sort(byTime);
}

/** Calendar events of every saved tender except "Não vou participar", in time order. */
export function buildDeadlineEvents(items: SavedTender[], now: Date = new Date()): DeadlineEvent[] {
  return items
    .filter((item) => item.stage !== 'dismissed')
    .flatMap((item) => tenderDeadlineEvents(item, now))
    .sort(byTime);
}

/**
 * The deadline a board card shows: a late one first (it needs attention), else the nearest upcoming one.
 * `openingAt` is a start, not a deadline, so it never wins.
 */
export function cardDeadline(item: SavedTender, now: Date = new Date()): DeadlineEvent | null {
  const deadlines = tenderDeadlineEvents(item, now).filter((event) => event.kind !== 'opening');
  const overdue = deadlines.filter((event) => event.overdue);
  if (overdue.length) return overdue[0];
  return deadlines.find((event) => !event.past) ?? null;
}

export function eventsByDay(events: DeadlineEvent[]): Map<string, DeadlineEvent[]> {
  const days = new Map<string, DeadlineEvent[]>();
  for (const event of events) days.set(event.day, [...(days.get(event.day) ?? []), event]);
  return days;
}

// Calendar arithmetic on `YYYY-MM-DD` strings through UTC midnights: no local time zone, no DST.
const DAY_MS = 86_400_000;
const toUtc = (day: string) => {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
};
const fromUtc = (time: number) => new Date(time).toISOString().slice(0, 10);

export const addDays = (day: string, amount: number) => fromUtc(toUtc(day) + amount * DAY_MS);

/** 0 = domingo … 6 = sábado. */
export const weekday = (day: string) => new Date(toUtc(day)).getUTCDay();

/** Same day of another month, clamped to its last day (31 Jan + 1 → 28/29 Feb). */
export function addMonths(day: string, amount: number) {
  const [year, month, date] = day.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + amount, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date, last)));
}

/** Sunday → Saturday week that contains `day` (the pt-BR calendar starts on Sunday). */
export const weekOf = (day: string) => Array.from({ length: 7 }, (_, index) => addDays(day, index - weekday(day)));

/** Whole weeks covering the month of `day`, with the neighbouring months' days filling the edges. */
export function monthGrid(day: string): string[][] {
  const first = `${day.slice(0, 7)}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const weeks: string[][] = [];
  for (let start = weekOf(first)[0]; start <= last; start = addDays(start, 7)) weeks.push(weekOf(start));
  return weeks;
}

export const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);

const asUtcDate = (day: string) => new Date(toUtc(day));
const monthTitle = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayTitle = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dayShort = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "outubro de 2026". */
export const formatMonthTitle = (day: string) => monthTitle.format(asUtcDate(day));
/** "terça-feira, 20 de outubro". */
export const formatDayTitle = (day: string) => dayTitle.format(asUtcDate(day));
/** "20 de out". */
export const formatDayShort = (day: string) => dayShort.format(asUtcDate(day)).replace('.', '');
