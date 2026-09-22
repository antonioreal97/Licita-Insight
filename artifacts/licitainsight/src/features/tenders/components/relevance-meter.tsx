import { cn } from '@/lib/utils';

type Props = {
  /** 0–1. `null` (not relevance-sorted) renders nothing. */
  score: number | null;
  className?: string;
};

/** Match strength as a 5-step bar plus a percentage — the number is always visible, never color-only. */
export function RelevanceMeter({ score, className }: Props) {
  if (score === null || Number.isNaN(score)) return null;
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  const filled = Math.max(1, Math.round(pct / 20));
  return (
    <span
      data-testid="relevance-meter"
      title={`Relevância para a busca: ${pct}%`}
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold tabular-nums text-primary', className)}
    >
      <span aria-hidden="true" className="flex items-end gap-px">
        {[1, 2, 3, 4, 5].map((step) => (
          <span key={step} className={cn('w-1 rounded-sm', step <= filled ? 'bg-primary' : 'bg-primary/15')} style={{ height: `${4 + step * 2}px` }} />
        ))}
      </span>
      <span>
        {pct}%<span className="sr-only"> de relevância</span>
      </span>
    </span>
  );
}
