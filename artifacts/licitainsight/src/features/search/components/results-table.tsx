import { Link } from 'wouter';
import type { TenderSummary } from '@/api';
import { modalityLabels } from '@/lib/tender-labels';
import { cn } from '@/lib/utils';
import { DeadlineIndicator } from '@/features/tenders/components/deadline-indicator';
import { HighlightedText } from '@/features/tenders/components/highlighted-text';
import { RelevanceMeter } from '@/features/tenders/components/relevance-meter';
import { NewTenderBadge } from '@/features/tenders/components/new-tender-badge';
import { SaveButton } from '@/features/tenders/components/save-button';
import { StatusBadge } from '@/features/tenders/components/status-badge';
import { ValueDisplay } from '@/features/tenders/components/value-display';
import { highlightFor, relevanceVaries, shortTenderNumber } from '@/features/tenders/lib/tender-display';

type Props = { tenders: TenderSummary[]; isSaved: (id: string) => boolean; onToggleSave: (id: string) => void };

// Sticky header needs its own scroll container: the wrapper scrolls on both axes, so horizontal overflow
// stays inside the table (never the page) and the header sticks while scrolling rows. `relative` makes it the containing
// block of the cells' absolutely positioned sr-only text, which would otherwise widen the page (QA-001).
const th =
  'sticky top-0 z-[2] whitespace-nowrap border-b border-border bg-muted px-3 py-2.5 text-left align-bottom type-label font-medium text-muted-foreground';
const td = 'border-b border-border-subtle px-3 py-2.5 align-top';
// ≥sm the Objeto column stays pinned while the other columns scroll horizontally (needs an opaque background).
// Local z-indexes (1–3) stay below the app header (z-sticky) — the table container does not create a stacking context.
const pinned = 'sm:sticky sm:left-0 sm:border-r sm:border-r-border';
// The save action is pinned on the right so it stays reachable when the table scrolls horizontally.
const pinnedEnd = 'sm:sticky sm:right-0 sm:border-l sm:border-l-border';

/**
 * Dense power-user view. Decision columns (valor, prazo, status) come right after the objeto so they are visible
 * without horizontal scroll at ~1000px; modalidade folds into the objeto meta line and fonte into the órgão cell.
 */
export function ResultsTable({ tenders, isSaved, onToggleSave }: Props) {
  const varies = relevanceVaries(tenders);
  return (
    <div
      role="region"
      aria-label="Resultados em tabela"
      tabIndex={0}
      data-testid="results-table"
      className="relative max-h-[calc(100dvh-9rem)] overflow-auto overscroll-x-contain rounded-xl border border-border bg-card"
    >
      <table className="w-full min-w-[960px] table-fixed border-separate border-spacing-0 text-left type-ui">
        <caption className="sr-only">Licitações encontradas. Role horizontalmente para ver todas as colunas.</caption>
        <colgroup>
          <col />
          <col className="w-[128px]" />
          <col className="w-[116px]" />
          <col className="w-[124px]" />
          <col className="w-[172px]" />
          <col className="w-[104px]" />
          <col className="w-[52px]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={cn(th, pinned, 'pl-4 sm:z-[3]')}>
              Objeto
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
              Órgão · fonte
            </th>
            <th scope="col" className={th}>
              <abbr title="UF / Município" className="no-underline">
                UF / Mun.
              </abbr>
            </th>
            <th scope="col" className={cn(th, pinnedEnd, 'pr-4 sm:z-[3]')}>
              <span className="sr-only">Salvar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tenders.map((t) => {
            const modality = modalityLabels[t.modality];
            const number = shortTenderNumber(t, modality);
            const { state, city } = t.location;
            const titleId = `table-title-${t.id}`;
            return (
              <tr
                key={t.id}
                data-testid={`table-row-${t.id}`}
                className="group transition-colors duration-fast ease-standard hover:bg-surface-sunken [&:last-child>*]:border-b-0"
              >
                <th
                  scope="row"
                  className={cn(td, pinned, 'z-[1] bg-card pl-4 font-normal transition-colors duration-fast ease-standard group-hover:bg-surface-sunken')}
                >
                  <Link
                    id={titleId}
                    href={`/tenders/${t.id}`}
                    title={t.title}
                    className="line-clamp-1 break-words font-semibold text-foreground transition-colors duration-fast ease-standard hover:text-primary"
                  >
                    <HighlightedText fragment={highlightFor(t, 'title')} fallback={t.title} />
                  </Link>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 type-meta text-muted-foreground">
                    <NewTenderBadge isNew={t.isNew} />
                    <span
                      title={t.modalityLabel !== modality ? `Na fonte: ${t.modalityLabel}` : undefined}
                      className="shrink-0 font-semibold text-foreground/80"
                    >
                      {modality}
                    </span>
                    {number && (
                      <span title={t.tenderNumber ?? undefined} className="min-w-0 truncate type-data text-3xs">
                        {number}
                      </span>
                    )}
                    <RelevanceMeter score={t.relevance.score} varies={varies} className="ml-auto shrink-0" />
                  </div>
                </th>
                <td className={cn(td, 'text-right')}>
                  <ValueDisplay value={t.estimatedValue} status={t.estimatedValueStatus} />
                </td>
                <td className={td}>
                  <DeadlineIndicator deadline={t.proposalDeadline} status={t.status} variant="table" />
                </td>
                <td className={td}>
                  <StatusBadge status={t.status} />
                </td>
                <td className={td}>
                  <span title={t.organization.name} className="block truncate text-foreground/80">
                    {t.organization.name}
                  </span>
                  <span title={t.source.name} className="block truncate type-meta text-muted-foreground">
                    {t.source.name}
                  </span>
                </td>
                <td className={td}>
                  <span className="block type-data font-bold text-foreground">{state ?? '—'}</span>
                  <span
                    title={city ?? 'Município não informado'}
                    className={cn('block truncate type-meta', city ? 'text-muted-foreground' : 'italic text-muted-foreground/80')}
                  >
                    {city ?? 'não informado'}
                  </span>
                </td>
                <td className={cn(td, pinnedEnd, 'z-[1] bg-card pr-4 text-right transition-colors duration-fast ease-standard group-hover:bg-surface-sunken')}>
                  <SaveButton
                    saved={isSaved(t.id)}
                    onToggle={() => onToggleSave(t.id)}
                    describedBy={titleId}
                    testId={`button-table-save-${t.id}`}
                    iconSize={16}
                    className="-my-1 ml-auto h-8 w-8"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
