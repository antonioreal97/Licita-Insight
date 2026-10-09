import { cn } from '@/lib/utils';

type Props = {
  /** 0–1. `null` (not relevance-sorted) renders nothing. */
  score: number | null;
  /**
   * Whether scores differ across the visible results. When every result scores the same (real data often
   * returns 1.0 for all), the meter carries no information, so it renders nothing.
   */
  varies: boolean;
  className?: string;
};

/**
 * Match strength as a 5-step bar plus a percentage — the number is always visible, never color-only.
 * Neutral by default (teal means "you can act here"); only a ≥ 90% match gets the primary tint as a "best match" cue.
 */
export function RelevanceMeter({ score, varies, className }: Props) {
  if (!varies || score === null || Number.isNaN(score)) return null;
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  const filled = Math.max(1, Math.round(pct / 20));
  const best = pct >= 90;
  return (
    <span
      data-testid="relevance-meter"
      title={`Relevância para a busca: ${pct}%`}
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap type-meta type-data font-semibold text-muted-foreground', className)}
    >
      <span aria-hidden="true" className="flex items-end gap-px">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={cn('w-1 rounded-lg', step > filled ? 'bg-border' : best ? 'bg-primary' : 'bg-foreground/70')}
            style={{ height: `${4 + step * 2}px` }}
          />
        ))}
      </span>
      <span>
        {pct}%<span className="sr-only"> de relevância</span>
      </span>
    </span>
  );
}
