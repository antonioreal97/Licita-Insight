import { lazy, Suspense } from 'react';
import { useOpenTendersByState } from '@/features/landing/hooks/use-open-tenders-by-state';

// The state outlines (~20 kB) only download when there is something to draw.
const OpportunityMap = lazy(() =>
  import('@/features/landing/components/opportunity-map').then((module) => ({ default: module.OpportunityMap })),
);

export const OPPORTUNITY_MAP_ID = 'mapa';

function MapPlaceholder() {
  return (
    <div
      role="status"
      aria-label="Carregando o mapa de editais por estado"
      className="mt-12 h-[26rem] animate-pulse rounded-2xl bg-muted lg:h-[34rem]"
    />
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
      className="border-t border-border py-24 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <div className="type-eyebrow font-bold uppercase tracking-eyebrow text-primary">Radar por estado</div>
          <h2 id="mapa-titulo" className="mt-4 type-titulo-2 lg:type-titulo-1">
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
