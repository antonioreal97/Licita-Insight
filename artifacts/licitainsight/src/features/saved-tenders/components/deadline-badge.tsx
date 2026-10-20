import React from 'react';
import { Inbox, Send, TriangleAlert, UserRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEADLINE_KIND_LABELS, type DeadlineKind } from '../lib/deadline-events';

export const DEADLINE_KIND_ICONS: Record<DeadlineKind, LucideIcon> = { proposal: Send, opening: Inbox, personal: UserRound };

/**
 * Each kind differs by icon, label and border, never by color alone: proposal is a filled chip, opening a filled chip
 * with another icon, the personal deadline a dashed outline (it is the user's own date). Late ones turn into the
 * inverted block of "prazo ≤ 48 h" with a warning icon and the word "Atrasado".
 */
export const DEADLINE_KIND_TONES: Record<DeadlineKind, string> = {
  proposal: 'border border-solid border-transparent bg-warning-subtle text-warning-subtle-foreground',
  opening: 'border border-solid border-transparent bg-primary-subtle text-primary-subtle-foreground',
  personal: 'border border-dashed border-border-strong bg-surface text-foreground',
};

export const OVERDUE_TONE = 'border border-solid border-transparent bg-urgent-subtle text-urgent-subtle-foreground';
const PAST_TONE = 'bg-muted text-muted-foreground';

type Props = { kind: DeadlineKind; overdue?: boolean; past?: boolean; className?: string };

/** "Envio da proposta", "Início das propostas" or "Prazo pessoal", with "Atrasado" in front when late. */
export function DeadlineBadge({ kind, overdue = false, past = false, className }: Props) {
  const Icon = overdue ? TriangleAlert : DEADLINE_KIND_ICONS[kind];
  return (
    <span
      data-kind={kind}
      data-overdue={overdue || undefined}
      className={cn(
        'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-pill px-2 py-0.5 text-xs font-semibold',
        DEADLINE_KIND_TONES[kind],
        past && !overdue && PAST_TONE,
        overdue && OVERDUE_TONE,
        kind === 'personal' && overdue && 'border-dashed border-urgent-subtle-foreground',
        className,
      )}
    >
      <Icon size={12} aria-hidden="true" className="shrink-0" />
      <span className="truncate">
        {overdue && 'Atrasado · '}
        {DEADLINE_KIND_LABELS[kind]}
      </span>
    </span>
  );
}
