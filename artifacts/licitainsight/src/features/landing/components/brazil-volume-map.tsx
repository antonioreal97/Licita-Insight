import React from 'react';
import { Link } from 'wouter';
import { BRAZIL_MAP_HEIGHT, BRAZIL_MAP_WIDTH, BRAZIL_SMALL_UF_CENTERS, BRAZIL_UF_PATHS } from '@/features/landing/lib/brazil-uf-paths';
import { UFS, type Uf } from '@/lib/ufs';
import { cn } from '@/lib/utils';

/** Fill per level of the volume scale: index 0 is a state without open tenders. */
export const VOLUME_FILLS = ['fill-mapa-vazio', 'fill-mapa-1', 'fill-mapa-2', 'fill-mapa-3', 'fill-mapa-4', 'fill-mapa-5'];
export const VOLUME_SWATCHES = ['bg-mapa-vazio', 'bg-mapa-1', 'bg-mapa-2', 'bg-mapa-3', 'bg-mapa-4', 'bg-mapa-5'];

export type MapState = { uf: Uf; level: number; label: string; href: string };

const MARGIN = 12;
// Radius, in map units, of the invisible click target around a state too small to hit.
const SMALL_TARGET_RADIUS = 22;
const shapeId = (uf: Uf) => `mapa-uf-${uf}`;

type Props = {
  states: readonly MapState[];
  active: Uf | null;
  onActiveChange: (uf: Uf | null) => void;
  className?: string;
};

/**
 * Static choropleth of the 27 states (IBGE mesh, embedded). Every state is a link with its own label; the fill
 * comes from the level, and the hovered or focused state gets a two-tone ring that reads on any fill.
 */
export function BrazilVolumeMap({ states, active, onActiveChange, className }: Props) {
  // Small states go last so their enlarged click target sits above the neighbors it overlaps.
  const ordered = [...states].sort((a, b) => Number(a.uf in BRAZIL_SMALL_UF_CENTERS) - Number(b.uf in BRAZIL_SMALL_UF_CENTERS));
  return (
    <svg
      viewBox={`${-MARGIN} ${-MARGIN} ${BRAZIL_MAP_WIDTH + 2 * MARGIN} ${BRAZIL_MAP_HEIGHT + 2 * MARGIN}`}
      role="group"
      aria-label="Mapa do Brasil: editais abertos por estado"
      className={cn('block h-auto w-full', className)}
    >
      <defs>
        {UFS.map((uf) => (
          // Strokes keep their width in CSS pixels however the map is scaled. The property is not inherited.
          <path key={uf} id={shapeId(uf)} d={BRAZIL_UF_PATHS[uf]} vectorEffect="non-scaling-stroke" />
        ))}
      </defs>

      {/* Coastline: the half of this stroke that falls inside the country is covered by the fills above it. */}
      <g aria-hidden className="fill-none stroke-texto" strokeWidth={2.5} strokeLinejoin="round">
        {UFS.map((uf) => (
          <use key={uf} href={`#${shapeId(uf)}`} />
        ))}
      </g>

      <g className="stroke-fundo" strokeWidth={1} strokeLinejoin="round">
        {ordered.map(({ uf, level, label, href }) => (
          <Link
            key={uf}
            href={href}
            aria-label={label}
            data-uf={uf}
            // The ring below is the focus indicator: an outline would follow the bounding box, not the state.
            className="cursor-pointer outline-none"
            onMouseEnter={() => onActiveChange(uf)}
            onMouseLeave={() => onActiveChange(null)}
            onFocus={() => onActiveChange(uf)}
            onBlur={() => onActiveChange(null)}
          >
            <use href={`#${shapeId(uf)}`} className={VOLUME_FILLS[level]} />
            {BRAZIL_SMALL_UF_CENTERS[uf] && (
              <circle
                cx={BRAZIL_SMALL_UF_CENTERS[uf][0]}
                cy={BRAZIL_SMALL_UF_CENTERS[uf][1]}
                r={SMALL_TARGET_RADIUS}
                className="fill-transparent stroke-none"
              />
            )}
          </Link>
        ))}
      </g>

      {active && (
        <g aria-hidden className="pointer-events-none fill-none" strokeLinejoin="round">
          <use href={`#${shapeId(active)}`} className="stroke-fundo" strokeWidth={5} />
          <use href={`#${shapeId(active)}`} className="stroke-foco" strokeWidth={2} />
        </g>
      )}
    </svg>
  );
}
