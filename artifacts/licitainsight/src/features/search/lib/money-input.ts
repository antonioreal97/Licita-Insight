const grouped = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** Accepts "1.500.000", "1500000", "R$ 1.500.000,00" → 1500000 (whole reais). Empty/invalid → undefined. */
export function parseBRL(text: string): number | undefined {
  const [integer] = text.replace(/[^\d,]/g, '').split(',');
  if (!integer) return undefined;
  const value = Number(integer);
  return Number.isFinite(value) ? value : undefined;
}

export const formatBRLInput = (value: number | undefined) => (value === undefined ? '' : grouped.format(value));
