import { ClipboardCheck, Target } from 'lucide-react';
import type { TenderFit, TenderHighlights as TenderHighlightsData } from '@/api';
import { reasonText } from '@/features/company-profile/components/fit-badge';
import { cn } from '@/lib/utils';
import { cardHighlights } from '../lib/card-highlights';

type Props = {
  highlights: TenderHighlightsData | undefined;
  fit: TenderFit | undefined;
  className?: string;
};

/**
 * Up to two short lines under a result: why it fits (or not) and what the tender requires. Built from data the
 * page already has; with nothing to say it renders nothing, so the row stays as it was.
 */
export function TenderHighlights({ highlights, fit, className }: Props) {
  const content = cardHighlights(highlights, fit);
  if (!content) return null;
  return (
    <ul aria-label="Destaques" data-testid="list-tender-highlights" className={cn('mt-2 space-y-1 text-xs leading-5 text-foreground/80', className)}>
      {content.fitReason && (
        <li data-testid="highlight-fit" className="flex min-w-0 items-start gap-1.5">
          <Target size={12} aria-hidden="true" className="mt-1 shrink-0 text-primary" />
          <span className="min-w-0 break-words">{reasonText(content.fitReason)}</span>
        </li>
      )}
      {content.requirements.length > 0 && (
        <li data-testid="highlight-requirements" className="flex min-w-0 items-start gap-1.5">
          <ClipboardCheck size={12} aria-hidden="true" className="mt-1 shrink-0 text-foreground-subtle" />
          <span className="min-w-0 break-words">
            <span className="sr-only">Exigências do edital: </span>
            {content.requirements.join(' · ')}
          </span>
        </li>
      )}
    </ul>
  );
}
