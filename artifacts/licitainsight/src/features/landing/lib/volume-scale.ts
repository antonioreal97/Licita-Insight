/** Steps of the sequential scale (`--mapa-1` … `--mapa-5`). Level 0 means "no open tenders" (`--mapa-vazio`). */
export const VOLUME_LEVELS = 5;

export type VolumeBand = {
  /** 1 (least) to `VOLUME_LEVELS` (most). */
  level: number;
  min: number;
  max: number;
};

/**
 * Quantile bands over the positive values: each band holds about the same number of states, which keeps the map
 * readable when a few states concentrate most of the volume. Equal values always share a band, bands are
 * contiguous (`max` is the next `min` minus one) and the band with the highest values always gets the top level.
 */
export function buildVolumeScale(values: readonly number[], levels = VOLUME_LEVELS): VolumeBand[] {
  const positive = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (positive.length === 0) return [];

  const mins: number[] = [];
  let previousQuantile = -1;
  positive.forEach((value, index) => {
    if (index > 0 && value === positive[index - 1]) return;
    const quantile = Math.floor((index * levels) / positive.length);
    if (quantile === previousQuantile) return;
    previousQuantile = quantile;
    mins.push(value);
  });

  const highest = positive[positive.length - 1];
  return mins.map((min, index) => ({
    level: mins.length === 1 ? levels : 1 + Math.round((index * (levels - 1)) / (mins.length - 1)),
    min,
    max: index === mins.length - 1 ? highest : mins[index + 1] - 1,
  }));
}

/** Level of a value on the scale: 0 without open tenders, otherwise the level of its band. */
export function volumeLevel(value: number, scale: readonly VolumeBand[]): number {
  if (value <= 0) return 0;
  return scale.findLast((band) => value >= band.min)?.level ?? scale[0]?.level ?? 0;
}
