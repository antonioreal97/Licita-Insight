import React, { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { CalendarDays, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import type { SavedTender } from '@/api';
import { Button } from '@/components/common/action-button';
import { EmptyState } from '@/components/common/empty-state';
import { STAGE_LABELS } from '@/features/participation/lib/stages';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  addDays,
  addMonths,
  buildDeadlineEvents,
  DEADLINE_KIND_LABELS,
  DEADLINE_KINDS,
  eventsByDay,
  formatDayShort,
  formatDayTitle,
  formatMonthTitle,
  monthGrid,
  sameMonth,
  spDayKey,
  weekOf,
  type DeadlineEvent,
} from '../lib/deadline-events';
import { DEADLINE_KIND_ICONS, DEADLINE_KIND_TONES, DeadlineBadge, OVERDUE_TONE } from './deadline-badge';

type Mode = 'month' | 'week';

const WEEKDAYS = [
  ['dom', 'domingo'],
  ['seg', 'segunda-feira'],
  ['ter', 'terça-feira'],
  ['qua', 'quarta-feira'],
  ['qui', 'quinta-feira'],
  ['sex', 'sexta-feira'],
  ['sáb', 'sábado'],
] as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Accessible name of a chip or a row: the kind is always spelled out, never left to the color. */
const eventLabel = (event: DeadlineEvent, withDate = false) =>
  [
    event.overdue ? `Atrasado: ${DEADLINE_KIND_LABELS[event.kind]}` : DEADLINE_KIND_LABELS[event.kind],
    withDate ? formatDateTime(event.at) : (event.clock ?? 'sem horário'),
    event.title,
  ].join(', ');

/** One deadline in the day, week and overdue lists. Opens the tender. */
function EventRow({ event, withDate = false }: { event: DeadlineEvent; withDate?: boolean }) {
  return (
    <li>
      <Link
        href={`/tenders/${event.tenderId}`}
        className={cn(
          'flex gap-3 rounded-xl border bg-card p-3 transition-colors duration-fast ease-standard hover:bg-surface-sunken focus-visible:focus-ring',
          event.overdue ? 'border-border-strong' : 'border-border',
        )}
        data-testid={`calendar-event-${event.id}`}
      >
        <time dateTime={event.at} className="w-16 shrink-0 pt-0.5 type-data text-foreground sm:w-20">
          {withDate ? formatDayShort(event.day) : (event.clock ?? <span className="type-meta text-muted-foreground">sem horário</span>)}
          {withDate && event.clock && <span className="block type-meta text-muted-foreground">{event.clock}</span>}
        </time>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <DeadlineBadge kind={event.kind} overdue={event.overdue} past={event.past} />
          <span className="line-clamp-2 break-words type-ui font-semibold text-foreground">{event.title}</span>
          <span className="break-words type-meta text-muted-foreground">
            {event.organization} · Sua etapa: {STAGE_LABELS[event.stage]}
          </span>
          {event.kind === 'personal' && (
            <span className="line-clamp-2 break-words type-meta text-muted-foreground">
              Próxima ação (você marcou): <span className="text-foreground/90">{event.note ?? 'sem descrição'}</span>
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function EventList({ events, withDate = false, empty }: { events: DeadlineEvent[]; withDate?: boolean; empty: string }) {
  if (events.length === 0) return <p className="rounded-lg border border-dashed border-border-strong px-3 py-4 type-meta text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <EventRow key={event.id} event={event} withDate={withDate} />
      ))}
    </ul>
  );
}

function Legend() {
  return (
    <ul aria-label="Legenda dos prazos" className="flex flex-wrap gap-2">
      {DEADLINE_KINDS.map((kind) => (
        <li key={kind}>
          <DeadlineBadge kind={kind} />
        </li>
      ))}
      <li>
        <DeadlineBadge kind="proposal" overdue />
      </li>
    </ul>
  );
}

/** Wide screens: the deadline itself, as a link. Icon + time + title; the full kind is in the accessible name. */
function EventChip({ event }: { event: DeadlineEvent }) {
  const Icon = event.overdue ? TriangleAlert : DEADLINE_KIND_ICONS[event.kind];
  return (
    <li>
      <Link
        href={`/tenders/${event.tenderId}`}
        aria-label={eventLabel(event)}
        title={eventLabel(event)}
        className={cn(
          'flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-semibold hover:underline focus-visible:focus-ring',
          DEADLINE_KIND_TONES[event.kind],
          event.past && !event.overdue && 'bg-muted text-muted-foreground',
          event.overdue && OVERDUE_TONE,
        )}
      >
        <Icon size={11} aria-hidden="true" className="shrink-0" />
        {event.clock && <span className="shrink-0 tabular-nums">{event.clock}</span>}
        <span className="truncate font-medium">{event.title}</span>
      </Link>
    </li>
  );
}

const CHIPS_PER_DAY = 3;

function MonthGrid({ cursor, today, selected, days, onSelect }: { cursor: string; today: string; selected: string; days: Map<string, DeadlineEvent[]>; onSelect: (day: string) => void }) {
  const weeks = monthGrid(cursor);
  return (
    <table className="w-full table-fixed border-collapse" data-testid="calendar-month">
      <caption className="sr-only">Prazos de {formatMonthTitle(cursor)}. Escolha um dia para ver a lista.</caption>
      <thead>
        <tr>
          {WEEKDAYS.map(([short, long]) => (
            <th key={short} scope="col" abbr={long} className="pb-2 text-center type-label font-semibold text-muted-foreground lg:text-left lg:pl-1.5">
              {short}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((day) => {
              const events = days.get(day) ?? [];
              const overdue = events.filter((event) => event.overdue).length;
              const inMonth = sameMonth(day, cursor);
              const isToday = day === today;
              const summary = events.length ? `${plural(events.length, 'prazo', 'prazos')}${overdue ? `, ${plural(overdue, 'atrasado', 'atrasados')}` : ''}` : 'sem prazos';
              return (
                <td key={day} className={cn('h-16 border border-border-subtle p-0.5 align-top lg:h-28 lg:p-1', !inMonth && 'bg-muted')}>
                  <button
                    type="button"
                    aria-pressed={selected === day}
                    aria-label={`${formatDayTitle(day)}${isToday ? ' (hoje)' : ''}: ${summary}`}
                    onClick={() => onSelect(day)}
                    className={cn(
                      'flex min-h-11 w-full flex-col items-center gap-1 rounded-lg p-1 transition-colors duration-fast ease-standard hover:bg-surface-sunken focus-visible:focus-ring lg:min-h-0 lg:flex-row lg:justify-between',
                      selected === day && 'bg-primary-subtle text-primary-subtle-foreground hover:bg-primary-subtle',
                    )}
                    data-testid={`calendar-day-${day}`}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-6 place-items-center rounded-pill type-ui tabular-nums',
                        inMonth ? 'text-foreground' : 'text-muted-foreground',
                        isToday && 'bg-inverse font-semibold text-inverse-foreground',
                      )}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {/* Narrow screens: one mark per kind present; the list below the grid has the details. */}
                    {events.length > 0 && (
                      <span aria-hidden="true" className="flex flex-wrap items-center justify-center gap-0.5 lg:hidden">
                        {overdue > 0 && <TriangleAlert size={12} />}
                        {DEADLINE_KINDS.filter((kind) => events.some((event) => event.kind === kind && !event.overdue)).map((kind) => {
                          const Icon = DEADLINE_KIND_ICONS[kind];
                          return <Icon key={kind} size={12} />;
                        })}
                      </span>
                    )}
                    {events.length > CHIPS_PER_DAY && (
                      <span aria-hidden="true" className="hidden type-meta text-muted-foreground lg:inline">
                        +{events.length - CHIPS_PER_DAY}
                      </span>
                    )}
                  </button>
                  {events.length > 0 && (
                    <ul className="mt-1 hidden flex-col gap-1 lg:flex">
                      {events.slice(0, CHIPS_PER_DAY).map((event) => (
                        <EventChip key={event.id} event={event} />
                      ))}
                    </ul>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Deadlines of every saved tender except "Não vou participar": month grid (pick a day for its list) or the week as a list.
 * Days and times in America/Sao_Paulo. Late deadlines are listed on top and highlighted everywhere.
 */
export function DeadlineCalendar({ items }: { items: SavedTender[] }) {
  const now = useMemo(() => new Date(), [items]);
  const today = spDayKey(now);
  const events = useMemo(() => buildDeadlineEvents(items, now), [items, now]);
  const days = useMemo(() => eventsByDay(events), [events]);
  const overdue = events.filter((event) => event.overdue);
  const [mode, setMode] = useState<Mode>('month');
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState(today);

  if (events.length === 0) {
    return (
      <EmptyState icon={CalendarDays} title="Nenhum prazo nos editais salvos" testId="empty-calendar">
        Os prazos aparecem aqui quando o edital tem data de envio da proposta ou de início das propostas, ou quando você marca uma próxima ação com
        prazo. Editais em “Não vou participar” ficam fora.
      </EmptyState>
    );
  }

  const step = (direction: 1 | -1) => {
    const next = mode === 'month' ? addMonths(cursor, direction) : addDays(cursor, 7 * direction);
    setCursor(next);
    if (mode === 'month') setSelected(sameMonth(next, today) ? today : `${next.slice(0, 7)}-01`);
    else setSelected(next);
  };
  const goToday = () => {
    setCursor(today);
    setSelected(today);
  };
  const week = weekOf(cursor);
  const title = mode === 'month' ? formatMonthTitle(cursor) : `Semana de ${formatDayShort(week[0])} a ${formatDayShort(week[6])}`;
  const unit = mode === 'month' ? 'mês' : 'semana';

  return (
    <div className="flex flex-col gap-4" data-testid="saved-calendar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Período do calendário" className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {(['month', 'week'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setCursor(selected);
              }}
              className={cn(
                'h-11 whitespace-nowrap rounded-lg px-3 type-ui font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring sm:h-7',
                mode === value && 'bg-surface text-foreground',
              )}
              data-testid={`calendar-mode-${value}`}
            >
              {value === 'month' ? 'Mês' : 'Semana'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-11 w-11 px-0 sm:h-8 sm:w-8" aria-label={mode === 'month' ? 'Mês anterior' : 'Semana anterior'} onClick={() => step(-1)} data-testid="calendar-prev">
            <ChevronLeft size={14} aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" className="h-11 sm:h-8" onClick={goToday} data-testid="calendar-today">
            Hoje
          </Button>
          <Button variant="outline" size="sm" className="h-11 w-11 px-0 sm:h-8 sm:w-8" aria-label={mode === 'month' ? 'Próximo mês' : 'Próxima semana'} onClick={() => step(1)} data-testid="calendar-next">
            <ChevronRight size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <h2 aria-live="polite" className="type-section text-foreground first-letter:uppercase" data-testid="calendar-title">
        {title}
      </h2>
      <Legend />
      <p className="type-meta text-muted-foreground">
        Horários de Brasília. Prazo pessoal é o que você marcou como próxima ação; os outros vêm do edital. Confira sempre no portal oficial.
      </p>

      {overdue.length > 0 && (
        <section aria-labelledby="calendar-overdue" className="rounded-xl border border-border-strong p-3 sm:p-4" data-testid="calendar-overdue">
          <h3 id="calendar-overdue" className="mb-2 flex items-center gap-2 type-ui font-semibold text-foreground">
            <TriangleAlert size={15} aria-hidden="true" />
            Atrasados ({overdue.length})
          </h3>
          <EventList events={overdue} withDate empty="" />
        </section>
      )}

      {mode === 'month' ? (
        <>
          <MonthGrid cursor={cursor} today={today} selected={selected} days={days} onSelect={setSelected} />
          <section aria-labelledby="calendar-day-list" data-testid="calendar-day-list">
            <h3 id="calendar-day-list" className="mb-2 type-ui font-semibold text-foreground first-letter:uppercase">
              {formatDayTitle(selected)}
              {selected === today && ' · hoje'}
            </h3>
            <EventList events={days.get(selected) ?? []} empty="Nenhum prazo neste dia." />
          </section>
        </>
      ) : (
        <ol className="flex flex-col gap-4" aria-label={title} data-testid="calendar-week">
          {week.map((day) => (
            <li key={day}>
              <h3 className={cn('mb-2 type-ui font-semibold first-letter:uppercase', day === today ? 'text-foreground' : 'text-muted-foreground')}>
                {formatDayTitle(day)}
                {day === today && ' · hoje'}
              </h3>
              <EventList events={days.get(day) ?? []} empty="Sem prazos." />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
