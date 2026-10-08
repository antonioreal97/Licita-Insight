import { Link } from 'wouter';
import { Building2, CalendarDays, MapPin } from 'lucide-react';
import type { TenderFit, TenderSummary } from '@/api';
import { FitBadge } from '@/features/company-profile/components/fit-badge';
import { formatDate } from '@/lib/format';
import { modalityLabels } from '@/lib/tender-labels';
import { cn } from '@/lib/utils';
import { formatPlace, highlightFor, shortTenderNumber } from '../lib/tender-display';
import { DeadlineIndicator } from './deadline-indicator';
import { HighlightedText } from './highlighted-text';
import { MetaItem } from './meta-item';
import { RelevanceMeter } from './relevance-meter';
import { SaveButton } from './save-button';
import { StatusBadge } from './status-badge';
import { ValueDisplay } from './value-display';

type Props = {
  tender: TenderSummary;
  saved: boolean;
  onSave: () => void;
  /** Overview lists (dashboard): no snippet, categories or published/fonte line. */
  compact?: boolean;
  /** Pass `relevanceVaries(results)` from the page; the meter stays hidden when every visible result has the same score. */
  relevanceVaries?: boolean;
  /** Aderência ao perfil da empresa; nothing renders while pending or without a profile. */
  fit?: TenderFit;
  onOpen?: () => void;
};

/**
 * Primary result unit. Reading order: status/modality/number → objeto → órgão · local · publicado → facts → categorias.
 * The source is not repeated per row (every result shows it on the detail page).
 * Layout (grid): mobile stacks facts under the text; ≥sm moves value/deadline/relevance to a right-aligned column
 * so values line up vertically across rows for fast scanning. The whole row opens the detail (title link overlay).
 */
export function TenderRow({ tender, saved, onSave, compact = false, relevanceVaries = false, fit, onOpen }: Props) {
  const place = formatPlace(tender.location);
  const titleFragment = highlightFor(tender, 'title');
  const snippet = highlightFor(tender, 'objectSummary') ?? highlightFor(tender, 'items');
  const modality = modalityLabels[tender.modality];
  const number = shortTenderNumber(tender, modality);
  const titleId = `tender-title-${tender.id}`;

  return (
    <article
      aria-labelledby={titleId}
      data-testid={`row-tender-${tender.id}`}
      className={cn(
        'group relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-border px-4 transition-colors duration-fast ease-standard last:border-0 hover:bg-surface-sunken active:bg-surface-sunken sm:grid-cols-[minmax(0,1fr)_10.5rem_auto] sm:gap-x-5 sm:px-5',
        'has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-ring',
        compact ? 'py-3.5' : 'py-4',
      )}
    >
      {/* Meta line */}
      <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 type-meta text-muted-foreground">
        <StatusBadge status={tender.status} />
        <span title={tender.modalityLabel !== modality ? `Na fonte: ${tender.modalityLabel}` : undefined} className="font-semibold text-foreground/80">
          {modality}
        </span>
        {number && (
          <span title={tender.tenderNumber ?? undefined} className="min-w-0 truncate type-data text-3xs">
            {number}
          </span>
        )}
        <FitBadge fit={fit} />
      </div>

      {/* Title, org line, snippet, categories */}
      <div className="col-span-2 row-start-2 mt-1.5 min-w-0 sm:col-span-1 sm:col-start-1">
        <h3 id={titleId} className="type-body font-semibold text-foreground">
          <Link
            href={`/tenders/${tender.id}`}
            data-testid={`link-tender-${tender.id}`}
            title={tender.title}
            className="line-clamp-2 break-words transition-colors duration-fast ease-standard after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:outline-none"
            onClick={onOpen}
          >
            <HighlightedText fragment={titleFragment} fallback={tender.title} />
          </Link>
        </h3>

        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 type-meta text-muted-foreground">
          <MetaItem icon={Building2} label="Órgão" title={tender.organization.name} className="max-w-full text-foreground/80">
            {tender.organization.name}
          </MetaItem>
          <MetaItem icon={MapPin} label="Local" className="shrink-0">
            {place ?? 'Local não informado'}
          </MetaItem>
          {!compact && (
            <MetaItem icon={CalendarDays} label="Publicado em" className="shrink-0">
              {tender.publishedAt ? (
                <>
                  publicado <time dateTime={tender.publishedAt}>{formatDate(tender.publishedAt)}</time>
                </>
              ) : (
                'publicação não informada'
              )}
            </MetaItem>
          )}
        </div>

        {!compact && snippet && (
          <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">
            <HighlightedText fragment={snippet} fallback="" />
          </p>
        )}

        {!compact && tender.categories.length > 0 && (
          <ul aria-label="Categorias" className="relative z-raised mt-2.5 flex w-fit max-w-full flex-wrap gap-1.5">
            {tender.categories.map((category) => (
              <li key={category.slug} className="rounded-sm px-1.5 py-px text-3xs font-medium text-muted-foreground ring-1 ring-inset ring-border-subtle">
                {category.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Key facts: value + deadline (+ relevance). Right column ≥sm, full-width strip on mobile. */}
      <dl className="col-span-2 row-start-3 mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-subtle pt-3 sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:flex-col sm:flex-nowrap sm:items-end sm:justify-start sm:gap-y-1.5 sm:border-0 sm:pt-0 sm:text-right">
        <div className="min-w-0">
          <dt className="sr-only">Valor estimado</dt>
          <dd>
            <ValueDisplay value={tender.estimatedValue} status={tender.estimatedValueStatus} className="text-sm" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="sr-only">Prazo para propostas</dt>
          <dd className="flex sm:justify-end">
            <DeadlineIndicator deadline={tender.proposalDeadline} status={tender.status} variant="inline" className="sm:justify-end" />
          </dd>
        </div>
        {relevanceVaries && tender.relevance.score !== null && (
          <div className="min-w-0">
            <dt className="sr-only">Relevância</dt>
            <dd>
              <RelevanceMeter score={tender.relevance.score} varies />
            </dd>
          </div>
        )}
      </dl>

      {/* Save — always visible and focusable (not hover-only); sits above the row link overlay. */}
      <div className="relative z-raised col-start-2 row-start-1 -mr-1.5 -mt-1 sm:col-start-3">
        <SaveButton saved={saved} onToggle={onSave} describedBy={titleId} testId={`button-save-${tender.id}`} className="h-9 w-9" />
      </div>
    </article>
  );
}
