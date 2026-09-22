import { Link } from 'wouter';
import { Bookmark, BookmarkCheck, Building2, CalendarDays, Globe, MapPin } from 'lucide-react';
import type { TenderSummary } from '@/api';
import { formatDate } from '@/lib/format';
import { modalityLabels } from '@/lib/tender-labels';
import { cn } from '@/lib/utils';
import { formatPlace, highlightFor } from '../lib/tender-display';
import { DeadlineIndicator } from './deadline-indicator';
import { HighlightedText } from './highlighted-text';
import { MetaItem } from './meta-item';
import { RelevanceMeter } from './relevance-meter';
import { StatusBadge } from './status-badge';
import { ValueDisplay } from './value-display';

type Props = { tender: TenderSummary; saved: boolean; onSave: () => void; compact?: boolean };

/**
 * Primary result unit. Reading order: status/modality/number → objeto → órgão · local → facts → categorias.
 * Layout (grid): mobile stacks facts under the text; ≥sm moves value/deadline/relevance to a right-aligned column
 * so values line up vertically across rows for fast scanning.
 */
export function TenderRow({ tender, saved, onSave, compact = false }: Props) {
  const place = formatPlace(tender.location);
  const titleFragment = highlightFor(tender, 'title');
  const snippet = highlightFor(tender, 'objectSummary') ?? highlightFor(tender, 'items');
  const modality = modalityLabels[tender.modality];
  const saveLabel = saved ? 'Remover dos salvos' : 'Salvar edital';
  const titleId = `tender-title-${tender.id}`;

  return (
    <article
      aria-labelledby={titleId}
      data-testid={`row-tender-${tender.id}`}
      className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-border px-4 py-4 transition-colors last:border-0 focus-within:bg-muted/30 hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_10.5rem_auto] sm:gap-x-5 sm:px-5"
    >
      {/* Meta line */}
      <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <StatusBadge status={tender.status} />
        <span title={tender.modalityLabel !== modality ? `Na fonte: ${tender.modalityLabel}` : undefined} className="font-semibold text-foreground/80">
          {modality}
        </span>
        {tender.tenderNumber && (
          <span title={tender.tenderNumber} className="min-w-0 truncate font-mono text-[10px]">
            {tender.tenderNumber}
          </span>
        )}
      </div>

      {/* Title, org, snippet, secondary facts, categories */}
      <div className="col-span-2 row-start-2 mt-1.5 min-w-0 sm:col-span-1 sm:col-start-1">
        <h3 id={titleId} className="text-[14px] font-semibold leading-5 text-foreground">
          <Link
            href={`/tenders/${tender.id}`}
            data-testid={`link-tender-${tender.id}`}
            title={tender.title}
            className="line-clamp-2 break-words rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HighlightedText fragment={titleFragment} fallback={tender.title} />
          </Link>
        </h3>

        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <MetaItem icon={Building2} label="Órgão" title={tender.organization.name} className="max-w-full text-foreground/80">
            {tender.organization.name}
          </MetaItem>
          <MetaItem icon={MapPin} label="Local" className="shrink-0">
            {place ?? 'Local não informado'}
          </MetaItem>
        </div>

        {!compact && snippet && (
          <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">
            <HighlightedText fragment={snippet} fallback="" />
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <MetaItem icon={CalendarDays} label="Publicado em" className="shrink-0">
            {tender.publishedAt ? (
              <>
                publicado <time dateTime={tender.publishedAt}>{formatDate(tender.publishedAt)}</time>
              </>
            ) : (
              'publicação não informada'
            )}
          </MetaItem>
          <MetaItem icon={Globe} label="Fonte" title={tender.source.name} className="max-w-[14rem]">
            {tender.source.name}
          </MetaItem>
        </div>

        {!compact && tender.categories.length > 0 && (
          <ul aria-label="Categorias" className="mt-3 flex flex-wrap gap-1.5">
            {tender.categories.map((category) => (
              <li key={category.slug} className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {category.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Key facts: value + deadline (+ relevance). Right column ≥sm, full-width strip on mobile. */}
      <dl className="col-span-2 row-start-3 mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3 sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:flex-col sm:flex-nowrap sm:items-end sm:justify-start sm:gap-y-1.5 sm:border-0 sm:pt-0 sm:text-right">
        <div className="min-w-0">
          <dt className="sr-only">Valor estimado</dt>
          <dd>
            <ValueDisplay value={tender.estimatedValue} className="text-[14px]" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="sr-only">Prazo para propostas</dt>
          <dd className="flex sm:justify-end">
            <DeadlineIndicator deadline={tender.proposalDeadline} status={tender.status} variant="inline" className="sm:justify-end" />
          </dd>
        </div>
        {tender.relevance.score !== null && (
          <div className="min-w-0">
            <dt className="sr-only">Relevância</dt>
            <dd>
              <RelevanceMeter score={tender.relevance.score} />
            </dd>
          </div>
        )}
      </dl>

      {/* Save — always visible and focusable (not hover-only). */}
      <div className="col-start-2 row-start-1 -mr-1.5 -mt-1 sm:col-start-3">
        <button
          type="button"
          aria-label={saveLabel}
          aria-describedby={titleId}
          aria-pressed={saved}
          title={saveLabel}
          data-testid={`button-save-${tender.id}`}
          onClick={onSave}
          className={cn(
            'grid h-9 w-9 place-items-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            saved ? 'text-primary' : 'text-muted-foreground hover:text-primary',
          )}
        >
          {saved ? <BookmarkCheck size={17} aria-hidden="true" /> : <Bookmark size={17} aria-hidden="true" />}
        </button>
      </div>
    </article>
  );
}
