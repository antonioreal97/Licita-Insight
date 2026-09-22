import { Link } from 'wouter';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import type { TenderSummary } from '@/api';
import { modalityLabels } from '@/lib/tender-labels';
import { cn } from '@/lib/utils';
import { DeadlineIndicator } from '@/features/tenders/components/deadline-indicator';
import { HighlightedText } from '@/features/tenders/components/highlighted-text';
import { RelevanceMeter } from '@/features/tenders/components/relevance-meter';
import { StatusBadge } from '@/features/tenders/components/status-badge';
import { ValueDisplay } from '@/features/tenders/components/value-display';
import { highlightFor } from '@/features/tenders/lib/tender-display';

type Props = { tenders: TenderSummary[]; isSaved: (id: string) => boolean; onToggleSave: (id: string) => void };

// Sticky header needs its own scroll container: the wrapper scrolls on both axes, so horizontal overflow
// stays inside the table (never the page) and the header sticks while scrolling rows.
const th =
  'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-3 py-2.5 text-left align-bottom font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground';
const td = 'border-b border-border px-3 py-3 align-top';
// ≥sm the Objeto column stays pinned while the other columns scroll horizontally (needs an opaque background).
const pinned = 'sm:sticky sm:left-0 sm:border-r sm:border-r-border';

export function ResultsTable({ tenders, isSaved, onToggleSave }: Props) {
  return (
    <div
      role="region"
      aria-label="Resultados em tabela"
      tabIndex={0}
      data-testid="results-table"
      className="max-h-[calc(100dvh-9rem)] overflow-auto overscroll-x-contain rounded-xl border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table className="w-full min-w-[1100px] table-fixed border-separate border-spacing-0 text-left text-xs">
        <caption className="sr-only">Licitações encontradas. Role horizontalmente para ver todas as colunas.</caption>
        <colgroup>
          <col className="min-w-[240px]" />
          <col className="w-[150px]" />
          <col className="w-[96px]" />
          <col className="w-[120px]" />
          <col className="w-[116px]" />
          <col className="w-[108px]" />
          <col className="w-[116px]" />
          <col className="w-[100px]" />
          <col className="w-[48px]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={cn(th, pinned, 'pl-4 sm:z-20')}>
              Objeto
            </th>
            <th scope="col" className={th}>
              Órgão
            </th>
            <th scope="col" className={th}>
              <abbr title="UF / Município" className="no-underline">
                UF / Mun.
              </abbr>
            </th>
            <th scope="col" className={th}>
              Modalidade
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Valor estimado
            </th>
            <th scope="col" className={th}>
              Prazo
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={th}>
              Fonte
            </th>
            <th scope="col" className={cn(th, 'pr-4')}>
              <span className="sr-only">Salvar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tenders.map((t) => {
            const saved = isSaved(t.id);
            const modality = modalityLabels[t.modality];
            const { state, city } = t.location;
            return (
              <tr key={t.id} data-testid={`table-row-${t.id}`} className="group transition-colors hover:bg-muted [&:last-child>*]:border-b-0">
                <th scope="row" className={cn(td, pinned, 'z-[1] bg-card pl-4 font-normal transition-colors group-hover:bg-muted')}>
                  <Link
                    href={`/tenders/${t.id}`}
                    title={t.title}
                    className="line-clamp-2 break-words rounded-sm font-semibold leading-[1.35rem] text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <HighlightedText fragment={highlightFor(t, 'title')} fallback={t.title} />
                  </Link>
                  <div className="mt-1 flex min-w-0 items-center gap-2">
                    {t.tenderNumber && (
                      <span title={t.tenderNumber} className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                        {t.tenderNumber}
                      </span>
                    )}
                    <RelevanceMeter score={t.relevance.score} className="ml-auto shrink-0" />
                  </div>
                </th>
                <td className={cn(td, 'text-muted-foreground')}>
                  <span title={t.organization.name} className="line-clamp-2 break-words">
                    {t.organization.name}
                  </span>
                </td>
                <td className={td}>
                  <span className="block font-mono text-[11px] font-bold text-foreground">{state ?? '—'}</span>
                  <span
                    title={city ?? 'Município não informado'}
                    className={cn('block truncate', city ? 'text-muted-foreground' : 'italic text-muted-foreground/80')}
                  >
                    {city ?? 'não informado'}
                  </span>
                </td>
                <td className={td}>
                  <span
                    title={t.modalityLabel !== modality ? `${modality} (na fonte: ${t.modalityLabel})` : modality}
                    className="line-clamp-2 hyphens-auto"
                    lang="pt-BR"
                  >
                    {modality}
                  </span>
                </td>
                <td className={cn(td, 'text-right')}>
                  <ValueDisplay value={t.estimatedValue} className="text-[12px]" />
                </td>
                <td className={td}>
                  <DeadlineIndicator deadline={t.proposalDeadline} status={t.status} variant="table" />
                </td>
                <td className={td}>
                  <StatusBadge status={t.status} />
                </td>
                <td className={cn(td, 'text-muted-foreground')}>
                  <span title={t.source.name} className="block truncate">
                    {t.source.name}
                  </span>
                </td>
                <td className={cn(td, 'pr-4 text-right')}>
                  <button
                    type="button"
                    aria-label={saved ? 'Remover dos salvos' : 'Salvar edital'}
                    aria-pressed={saved}
                    title={saved ? 'Remover dos salvos' : 'Salvar edital'}
                    data-testid={`button-table-save-${t.id}`}
                    onClick={() => onToggleSave(t.id)}
                    className={cn(
                      '-my-1 grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      saved ? 'text-primary' : 'text-muted-foreground hover:text-primary',
                    )}
                  >
                    {saved ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
