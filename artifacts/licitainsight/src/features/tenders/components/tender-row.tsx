import { Link } from 'wouter';
import { Bookmark, BookmarkCheck, MapPin } from 'lucide-react';
import type { TenderSummary } from '@/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { HighlightedText } from './highlighted-text';
import { StatusBadge } from './status-badge';

type Props = { tender: TenderSummary; saved: boolean; onSave: () => void; compact?: boolean };

export function TenderRow({ tender, saved, onSave, compact = false }: Props) {
  const { state, city } = tender.location;
  const titleFragment = tender.relevance.highlights.find((h) => h.field === 'title')?.fragments[0];
  const score = tender.relevance.score;
  const saveLabel = saved ? 'Remover dos salvos' : 'Salvar edital';

  return (
    <div data-testid={`row-tender-${tender.id}`} className="group border-b border-border px-4 py-4 transition-colors last:border-0 hover:bg-muted/40 sm:px-5">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-8 w-8 shrink-0 rounded-md bg-secondary text-center font-mono text-[10px] font-bold leading-8 text-primary">{state ?? '—'}</div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={tender.status} />
            {tender.tenderNumber && <span className="font-mono text-[10px] text-muted-foreground">{tender.tenderNumber}</span>}
          </div>
          <Link
            href={`/tenders/${tender.id}`}
            data-testid={`link-tender-${tender.id}`}
            className="line-clamp-2 block max-w-3xl text-[14px] font-semibold leading-5 text-foreground hover:text-primary"
          >
            <HighlightedText fragment={titleFragment} fallback={tender.title} />
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {(city || state) && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} />
                {[city, state].filter(Boolean).join(', ')}
              </span>
            )}
            <span className="min-w-0 truncate">{tender.organization.name}</span>
          </div>
          {!compact && tender.categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tender.categories.map((category) => (
                <span key={category.slug} className="rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                  {category.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <div className="font-mono text-[13px] font-bold text-foreground">{formatCurrency(tender.estimatedValue)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">abre {formatDate(tender.openingAt)}</div>
          <div className="mt-2 flex items-center justify-end gap-2">
            {score !== null && <span className="font-mono text-[10px] text-primary">{Math.round(score * 100)}% match</span>}
            <button
              aria-label={saveLabel}
              aria-pressed={saved}
              data-testid={`button-save-${tender.id}`}
              onClick={onSave}
              className={`rounded-md p-1.5 ${saved ? 'text-primary' : 'text-muted-foreground opacity-0 hover:bg-muted hover:text-primary focus-visible:opacity-100 group-hover:opacity-100'}`}
            >
              {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            </button>
          </div>
        </div>
        <button
          aria-label={saveLabel}
          aria-pressed={saved}
          data-testid={`button-save-mobile-${tender.id}`}
          onClick={onSave}
          className={`rounded-md p-1.5 sm:hidden ${saved ? 'text-primary' : 'text-muted-foreground'}`}
        >
          {saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
        </button>
      </div>
    </div>
  );
}
