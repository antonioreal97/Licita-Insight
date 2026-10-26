import { Bell, CalendarClock, CircleDollarSign, FileText, Hourglass, RefreshCw, Sparkles, X, type LucideIcon } from 'lucide-react';
import { Link } from 'wouter';
import type { Notification, NotificationType } from '@/api';
import { cn } from '@/lib/utils';
import { NewTenderBadge } from '@/features/tenders/components/new-tender-badge';
import { formatRelativeTime, notificationDescription, notificationHref, notificationSubject, notificationTitle } from '../lib/notification-copy';

const icons: Record<NotificationType, LucideIcon> = {
  tender_deadline_changed: CalendarClock,
  tender_status_changed: RefreshCw,
  tender_document_added: FileText,
  tender_value_changed: CircleDollarSign,
  saved_search_new_matches: Bell,
  profile_new_matches: Sparkles,
  trial_ending: Hourglass,
  company_document_expiring: CalendarClock,
};

/**
 * One notification. It is a link to `notificationHref(n)` (plain text when there is none); `onSelect` runs on click, before
 * navigation — use it to mark as read and close a popover. `compact`: popover density (subject/change clamp to one line).
 * `onRemove` adds a "Remover" icon button beside the link (never inside it, so it does not navigate).
 */
export function NotificationItem({
  notification: n,
  onSelect,
  onRemove,
  compact = false,
}: {
  notification: Notification;
  onSelect?: (n: Notification) => void;
  onRemove?: (n: Notification) => void;
  compact?: boolean;
}) {
  const unread = n.readAt === null;
  const href = notificationHref(n);
  const subject = notificationSubject(n);
  const description = notificationDescription(n);
  const Icon = icons[n.type] ?? Bell;
  const className = cn(
    'group flex w-full gap-3 text-left transition-colors duration-fast ease-standard',
    compact ? 'px-4 py-3' : 'px-4 py-4 sm:px-5',
    // With the remove button the whole row (link + button) takes the hover background.
    href && !onRemove && 'hover:bg-muted focus-visible:bg-muted',
    onRemove && 'min-w-0 flex-1 pr-1 sm:pr-1',
  );
  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-full',
          unread ? 'bg-primary-subtle text-primary-subtle-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 type-ui text-foreground', unread ? 'font-semibold' : 'font-medium')}>{notificationTitle(n)}</span>
          <NewTenderBadge isNew={Boolean(n.tender?.isNew || (n.newMatchCount ?? 0) > 0)} />
          <time dateTime={n.createdAt} className="shrink-0 type-meta text-muted-foreground">
            {formatRelativeTime(n.createdAt)}
          </time>
        </span>
        {subject && <span className={cn('mt-0.5 block type-meta text-muted-foreground', compact ? 'truncate' : 'line-clamp-2')}>{subject}</span>}
        {description && <span className={cn('mt-0.5 block type-meta text-foreground', compact && 'truncate')}>{description}</span>}
      </span>
      <span className="flex w-2 shrink-0 justify-center pt-2">
        {unread && <span aria-hidden className="size-2 rounded-full bg-accent" />}
        {unread && <span className="sr-only">Não lida</span>}
      </span>
    </>
  );

  const row = href ? (
    <Link href={href} data-testid={`notification-${n.id}`} onClick={() => onSelect?.(n)} className={cn(className, onRemove && 'focus-visible:bg-muted')}>
      {body}
    </Link>
  ) : (
    <div data-testid={`notification-${n.id}`} className={className}>
      {body}
    </div>
  );
  if (!onRemove) return row;
  return (
    <div className={cn('flex items-start transition-colors duration-fast ease-standard', href && 'hover:bg-muted')}>
      {row}
      <button
        type="button"
        aria-label={`Remover notificação: ${notificationTitle(n)}`}
        title="Remover"
        data-testid={`button-remove-notification-${n.id}`}
        onClick={() => onRemove(n)}
        className={cn(
          'mr-1 grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast ease-standard hover:bg-surface hover:text-foreground focus-visible:focus-ring sm:mr-2',
          compact ? 'mt-1' : 'mt-2',
        )}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
