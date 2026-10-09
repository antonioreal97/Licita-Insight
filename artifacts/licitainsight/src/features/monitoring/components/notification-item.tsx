import { Bell, CalendarClock, CircleDollarSign, FileText, Hourglass, RefreshCw, Sparkles, type LucideIcon } from 'lucide-react';
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
};

/**
 * One notification. It is a link to `notificationHref(n)` (plain text when there is none); `onSelect` runs on click, before
 * navigation — use it to mark as read and close a popover. `compact`: popover density (subject/change clamp to one line).
 */
export function NotificationItem({
  notification: n,
  onSelect,
  compact = false,
}: {
  notification: Notification;
  onSelect?: (n: Notification) => void;
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
    href && 'hover:bg-muted focus-visible:bg-muted',
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

  if (!href) {
    return (
      <div data-testid={`notification-${n.id}`} className={className}>
        {body}
      </div>
    );
  }
  return (
    <Link href={href} data-testid={`notification-${n.id}`} onClick={() => onSelect?.(n)} className={className}>
      {body}
    </Link>
  );
}
