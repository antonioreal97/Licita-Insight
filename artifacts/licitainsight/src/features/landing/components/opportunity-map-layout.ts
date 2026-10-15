/**
 * Layout shared by the map and its loading skeleton, so the skeleton takes the same space and nothing below the
 * section moves when the data arrives. Kept apart from the map so the eager bundle does not pull the state outlines.
 */
export const MAP_GRID = 'mt-12 grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-start lg:gap-14';
export const MAP_CARD = 'rounded-2xl border border-border p-5 sm:p-7';
/** Room for the place name and two lines below it: a long state with its value wraps, and the map must not jump. */
export const MAP_READOUT = 'min-h-[4.625rem]';
export const MAP_FIGURE = 'mx-auto mt-4 max-w-[19rem] sm:max-w-md lg:max-w-lg';
/** The `viewBox` of `BrazilVolumeMap`: the 1000 × 1031 mesh plus a 12-unit margin on each side. */
export const MAP_ASPECT = 'aspect-[1024/1055]';
export const MAP_LEGEND_TITLE = 'Editais abertos por estado';
export const MAP_SOURCE_NOTE = 'Fonte: PNCP. Valor estimado soma só os editais que publicaram valor.';
export const RANKING_SIZE = 5;
