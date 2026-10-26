import React, { useMemo, useState } from 'react';
import { Link } from 'wouter';
import type { OpenTendersByStateResponse } from '@/api';
import { BrazilVolumeMap, VOLUME_SWATCHES } from '@/features/landing/components/brazil-volume-map';
import {
  MAP_CARD,
  MAP_FIGURE,
  MAP_GRID,
  MAP_LEGEND_TITLE,
  MAP_READOUT,
  MAP_SOURCE_NOTE,
  RANKING_SIZE,
} from '@/features/landing/components/opportunity-map-layout';
import { openTendersText, rankStates, stateLabel, toStateVolumes } from '@/features/landing/lib/state-volumes';
import type { VolumeBand } from '@/features/landing/lib/volume-scale';
import { formatCurrencyCompact, formatDateTime, formatNumber } from '@/lib/format';
import type { Uf } from '@/lib/ufs';
import { cn } from '@/lib/utils';

const RANKING_ID = 'mapa-ranking';

const bandText = ({ min, max }: VolumeBand) => (min === max ? formatNumber(min) : `${formatNumber(min)} a ${formatNumber(max)}`);

/** Map, legend, top states and the table with all 27, from one answer of `/public/tenders/by-state`. */
export function OpportunityMap({ data }: { data: OpenTendersByStateResponse }) {
  const [active, setActive] = useState<Uf | null>(null);
  const { states, scale } = useMemo(() => toStateVolumes(data.data), [data]);
  const ranked = useMemo(() => rankStates(states), [states]);
  const top = ranked.slice(0, RANKING_SIZE);
  const highest = top[0]?.openTenders ?? 0;
  const activeState = states.find((state) => state.uf === active);
  const hasEmptyState = ranked.length < states.length;

  return (
    <div className={MAP_GRID}>
      <div className={MAP_CARD}>
        <a
          href={`#${RANKING_ID}`}
          className="sr-only rounded-lg px-3 py-1.5 text-xs font-semibold text-primary focus-visible:not-sr-only focus-visible:inline-block"
        >
          Pular o mapa e ir para a lista de estados
        </a>

        <div data-testid="map-readout" className={MAP_READOUT}>
          <p className="type-titulo-3 text-foreground">{activeState ? `${activeState.name} (${activeState.uf})` : 'Brasil'}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {activeState
              ? [activeState.countText, activeState.valueText].filter(Boolean).join(' · ')
              : `${openTendersText(data.meta.totalOpenTenders)} · selecione um estado para ver os editais`}
          </p>
        </div>

        <BrazilVolumeMap
          states={states.map((state) => ({ uf: state.uf, level: state.level, href: state.href, label: stateLabel(state) }))}
          active={active}
          onActiveChange={setActive}
          className={MAP_FIGURE}
        />

        <div className="mt-6 border-t border-border-subtle pt-4">
          <p className="type-label text-muted-foreground">{MAP_LEGEND_TITLE}</p>
          <ul data-testid="map-legend" className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-foreground max-md:text-sm">
            {hasEmptyState && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className={cn('size-3.5 rounded-sm border border-border-strong', VOLUME_SWATCHES[0])} />
                Nenhum
              </li>
            )}
            {scale.map((band) => (
              <li key={band.level} className="flex items-center gap-1.5 tabular-nums">
                <span aria-hidden className={cn('size-3.5 rounded-sm border border-border-strong', VOLUME_SWATCHES[band.level])} />
                {bandText(band)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h3 id={RANKING_ID} tabIndex={-1} className="type-titulo-3 text-foreground outline-none">
          Os {top.length === RANKING_SIZE ? 'cinco ' : ''}estados com mais editais abertos
        </h3>
        <ol data-testid="map-ranking" className="mt-5 space-y-2">
          {top.map((state, index) => (
            <li key={state.uf}>
              <Link
                href={state.href}
                aria-label={stateLabel(state)}
                onMouseEnter={() => setActive(state.uf)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(state.uf)}
                onBlur={() => setActive(null)}
                className="group block rounded-xl border border-border bg-surface p-4 transition-colors duration-fast hover:border-border-strong"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2.5">
                    <span className="type-data text-xs font-bold text-muted-foreground">{index + 1}</span>
                    <span className="truncate text-sm font-semibold text-foreground group-hover:underline">{state.name}</span>
                    <span className="type-data text-xs font-bold text-muted-foreground">{state.uf}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{formatNumber(state.openTenders)}</span>
                </span>
                <span aria-hidden className="mt-2.5 block h-1.5 overflow-hidden rounded-pill bg-muted">
                  <span
                    className={cn('block h-full rounded-pill', VOLUME_SWATCHES[state.level])}
                    style={{ width: `${Math.max(4, (state.openTenders / highest) * 100)}%` }}
                  />
                </span>
                <span className="mt-2 block text-xs text-muted-foreground max-md:text-sm">{state.valueText}</span>
              </Link>
            </li>
          ))}
        </ol>

        <details className="mt-5 rounded-xl border border-border">
          <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-primary">
            Ver os 27 estados em tabela
          </summary>
          <div className="overflow-x-auto border-t border-border-subtle px-4 pb-3">
            <table data-testid="map-table" className="w-full text-left text-xs max-md:text-sm">
              <caption className="sr-only">Editais abertos e valor estimado somado por estado</caption>
              <thead>
                <tr className="type-label text-muted-foreground">
                  <th scope="col" className="py-2.5 pr-3 font-semibold">
                    Estado
                  </th>
                  <th scope="col" className="py-2.5 pr-3 text-right font-semibold">
                    Editais abertos
                  </th>
                  <th scope="col" className="py-2.5 text-right font-semibold">
                    Valor estimado
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...ranked, ...states.filter((state) => state.openTenders === 0)].map((state) => (
                  <tr key={state.uf} className="border-t border-border-subtle">
                    <th scope="row" className="py-2 pr-3 font-medium max-md:py-0">
                      {/* On phones the row is the 44 px tap target. */}
                      <Link href={state.href} className="text-primary hover:underline max-md:flex max-md:min-h-11 max-md:items-center">
                        {state.name} ({state.uf})
                      </Link>
                    </th>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatNumber(state.openTenders)}</td>
                    <td className="py-2 text-right tabular-nums text-foreground">
                      {formatCurrencyCompact(state.estimatedValueTotal, state.openTenders === 0 ? '—' : 'Não informado')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <p className="mt-4 type-meta text-muted-foreground max-md:text-sm">
          {MAP_SOURCE_NOTE}
          {data.meta.indexUpdatedAt && ` Dados atualizados em ${formatDateTime(data.meta.indexUpdatedAt)}.`}
        </p>
      </div>
    </div>
  );
}
