import { AlarmClock, Ban, CalendarOff, CalendarX2, Clock3, Hourglass, type LucideIcon } from 'lucide-react';
import type { TenderStatus } from '@/api/types';
import { formatDate, formatDateNumeric, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getDeadlineInfo, type DeadlineUrgency } from '../lib/deadline';

// Urgency is always conveyed by text + icon; color is reinforcement only.
const tones: Record<DeadlineUrgency, string> = {
  critical: 'bg-urgent-subtle text-urgent-subtle-foreground',
  soon: 'bg-warning-subtle text-warning-subtle-foreground',
  normal: 'text-foreground',
  expired: 'text-muted-foreground',
  inactive: 'text-muted-foreground',
  unknown: 'text-muted-foreground',
};

const icons: Record<DeadlineUrgency, LucideIcon> = {
  critical: AlarmClock,
  soon: Hourglass,
  normal: Clock3,
  expired: CalendarX2,
  inactive: Ban,
  unknown: CalendarOff,
};

const pill = (urgency: DeadlineUrgency) => urgency === 'critical' || urgency === 'soon';

type Props = {
  deadline: string | null;
  status?: TenderStatus;
  /**
   * - `inline`: one line, "Encerra em 3 dias · 05 de out de 2026" (lists)
   * - `table`: numeric date over short relative label (dense tables)
   * - `block`: date + time over the full label (detail fact strip)
   */
  variant?: 'inline' | 'table' | 'block';
  now?: Date;
  className?: string;
};

export function DeadlineIndicator({ deadline, status, variant = 'inline', now, className }: Props) {
  const info = getDeadlineInfo(deadline, status, now);
  const Icon = icons[info.urgency];
  const tone = tones[info.urgency];

  if (variant === 'table') {
    return (
      <span data-urgency={info.urgency} className={cn('flex flex-col items-start gap-0.5', className)}>
        {deadline ? (
          <time dateTime={deadline} title={formatDateTime(deadline)} className="type-data text-foreground">
            {formatDateNumeric(deadline)}
          </time>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1 text-3xs font-semibold',
            tone,
            !pill(info.urgency) && 'px-0 font-medium',
          )}
        >
          <Icon size={11} aria-hidden="true" />
          {info.shortLabel}
        </span>
      </span>
    );
  }

  if (variant === 'block') {
    return (
      <span data-urgency={info.urgency} className={cn('flex flex-col items-start gap-1.5', className)}>
        {deadline ? (
          <time dateTime={deadline} className="text-sm font-semibold tabular-nums text-foreground xl:whitespace-nowrap">
            {formatDateTime(deadline)}
          </time>
        ) : (
          <span className="text-sm font-semibold text-muted-foreground">Não informado</span>
        )}
        {info.urgency !== 'unknown' && (
          <span
            className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 type-meta font-semibold', tone, !pill(info.urgency) && 'px-0 font-medium')}
          >
            {/* The fact label above already carries a clock icon; repeat an icon only when it adds urgency. */}
            {info.urgency !== 'normal' && <Icon size={12} aria-hidden="true" />}
            {info.label}
          </span>
        )}
      </span>
    );
  }

  return (
    <span data-urgency={info.urgency} className={cn('inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-md text-xs font-semibold',
          tone,
          pill(info.urgency) ? 'px-1.5 py-0.5' : 'font-medium',
        )}
      >
        <Icon size={13} aria-hidden="true" />
        {info.label}
      </span>
      {deadline && info.urgency !== 'unknown' && (
        <time dateTime={deadline} title={formatDateTime(deadline)} className="whitespace-nowrap type-meta tabular-nums text-muted-foreground">
          {formatDate(deadline)}
        </time>
      )}
    </span>
  );
}
