import { lazy, Suspense, type ReactNode } from 'react';
import {
  MAP_ASPECT,
  MAP_CARD,
  MAP_FIGURE,
  MAP_GRID,
  MAP_LEGEND_TITLE,
  MAP_READOUT,
  MAP_SOURCE_NOTE,
  RANKING_SIZE,
} from '@/features/landing/components/opportunity-map-layout';
import { useOpenTendersByState } from '@/features/landing/hooks/use-open-tenders-by-state';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

// The state outlines (~20 kB) only download when there is something to draw.
const OpportunityMap = lazy(() =>
  import('@/features/landing/components/opportunity-map').then((module) => ({ default: module.OpportunityMap })),
);

export const OPPORTUNITY_MAP_ID = 'mapa';

/** Text that keeps its line breaks but reads as a loading bar. */
function Bar({ children }: { children: ReactNode }) {
  return <span className="rounded bg-muted text-transparent [box-decoration-break:clone] motion-safe:animate-pulse">{children}</span>;
}

// Typical numbers and today's date stand in for the data, so the skeleton wraps where the map will.
const LEGEND_SAMPLE = ['60 a 269', '270 a 479', '480 a 909', '910 a 1.619', '1.620 a 4.210'];

/** The map's own layout with placeholders, so the page below does not move when the data arrives. */
function MapPlaceholder() {
  return (
    <div role="status" aria-label="Carregando o mapa de editais por estado" className={MAP_GRID}>
      <div aria-hidden className={MAP_CARD}>
        <div className={MAP_READOUT}>
          <p className="type-titulo-3">
            <Bar>Brasil</Bar>
          </p>
          <p className="mt-0.5 text-sm">
            <Bar>26.380 editais abertos · selecione um estado para ver os editais</Bar>
          </p>
        </div>
        <div className={cn(MAP_FIGURE, MAP_ASPECT, 'rounded-2xl bg-muted motion-safe:animate-pulse')} />
        <div className="mt-6 border-t border-border-subtle pt-4">
          <p className="type-label">
            <Bar>{MAP_LEGEND_TITLE}</Bar>
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 text-xs">
            {LEGEND_SAMPLE.map((text, index) => (
              <li key={index} className="flex items-center gap-1.5 tabular-nums">
                <span className="size-3.5 rounded-sm border border-transparent bg-muted" />
                <Bar>{text}</Bar>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div aria-hidden>
        <p className="type-titulo-3">
          <Bar>Os cinco estados com mais editais abertos</Bar>
        </p>
        <ul className="mt-5 space-y-2">
          {Array.from({ length: RANKING_SIZE }, (_, index) => (
            // The height of one ranking card: padding, name line, bar and value line.
            <li key={index} className="h-[5.875rem] rounded-xl bg-muted motion-safe:animate-pulse" />
          ))}
        </ul>
        <div className="mt-5 h-[2.875rem] rounded-xl border border-border" />
        <p className="mt-4 type-meta">
          <Bar>
            {MAP_SOURCE_NOTE} Dados atualizados em {formatDateTime(new Date().toISOString())}.
          </Bar>
        </p>
      </div>
    </div>
  );
}

/**
 * "Where the opportunities are now": open tenders by state. The section is a bonus on a public page, so when the
 * API fails or has nothing open it renders nothing instead of an error.
 */
export function OpportunityMapSection() {
  const byState = useOpenTendersByState();
  if (byState.isError || byState.data?.meta.totalOpenTenders === 0) return null;
  return (
    <section
      id={OPPORTUNITY_MAP_ID}
      data-testid="section-opportunity-map"
      aria-labelledby="mapa-titulo"
      className="py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <div className="type-eyebrow font-bold uppercase tracking-eyebrow text-primary">Radar por estado</div>
          <h2 id="mapa-titulo" className="mt-3 type-titulo-2 lg:type-titulo-1">
            Onde estão as oportunidades agora
          </h2>
          <p className="mt-4 type-corpo text-muted-foreground sm:type-corpo-grande">
            Editais com propostas abertas no PNCP, estado por estado. Quanto mais forte a cor, mais editais; escolha um
            estado para abrir a busca já filtrada.
          </p>
        </div>

        {byState.isSuccess ? (
          <Suspense fallback={<MapPlaceholder />}>
            <OpportunityMap data={byState.data} />
          </Suspense>
        ) : (
          <MapPlaceholder />
        )}
      </div>
    </section>
  );
}
