import { EyeOff } from 'lucide-react';
import { formatCurrency, formatCurrencyPrecise } from '@/lib/format';
import { cn } from '@/lib/utils';

const NULL_HINT = 'A fonte não divulgou o valor estimado (orçamento sigiloso ou não informado).';

type Props = {
  value: number | null;
  /** `precise` shows centavos (items table); default rounds to reais. */
  precise?: boolean;
  /** Text shown when the value is `null`. */
  nullLabel?: string;
  className?: string;
};

/** Money value with tabular figures. `null` renders an explicit, muted "Sigiloso / não informado" state. */
export function ValueDisplay({ value, precise = false, nullLabel = 'Não informado', className }: Props) {
  if (value === null) {
    return (
      <span title={NULL_HINT} className={cn('inline-flex items-center gap-1 whitespace-nowrap font-medium italic text-muted-foreground', className)}>
        <EyeOff size={12} aria-hidden="true" className="shrink-0" />
        {nullLabel}
        <span className="sr-only"> — {NULL_HINT}</span>
      </span>
    );
  }
  return (
    <span className={cn('whitespace-nowrap font-semibold tabular-nums text-foreground', className)}>
      {precise ? formatCurrencyPrecise(value) : formatCurrency(value)}
    </span>
  );
}
