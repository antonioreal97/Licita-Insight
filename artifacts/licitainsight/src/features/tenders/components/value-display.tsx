import { EyeOff, Lock } from 'lucide-react';
import type { TenderSummary } from '@/api';
import { formatCurrency, formatCurrencyPrecise } from '@/lib/format';
import { cn } from '@/lib/utils';

const NULL_HINT = 'A fonte não divulgou o valor estimado (orçamento sigiloso ou não informado).';

// v1.1 `estimatedValueStatus` tells sigilo apart from "not published". Absent (older servers) keeps the generic fallback.
const nullStates = {
  confidential: { label: 'Sigiloso', hint: 'Orçamento sigiloso: a fonte não divulga o valor estimado.', icon: Lock },
  not_published: { label: 'Não informado', hint: 'A fonte não publicou o valor estimado.', icon: EyeOff },
};

type Props = {
  value: number | null;
  /** v1.1: why the value is null. */
  status?: TenderSummary['estimatedValueStatus'];
  /** `precise` shows centavos (items table); default rounds to reais. */
  precise?: boolean;
  /** Text shown when the value is `null` and the API did not say why. */
  nullLabel?: string;
  className?: string;
};

/** Money value with tabular figures. `null` renders an explicit, muted state: "Sigiloso", "Não informado" or `nullLabel`. */
export function ValueDisplay({ value, status, precise = false, nullLabel = 'Não informado', className }: Props) {
  if (value === null) {
    const known = status === 'confidential' || status === 'not_published' ? nullStates[status] : null;
    const hint = known?.hint ?? NULL_HINT;
    const Icon = known?.icon ?? EyeOff;
    return (
      <span title={hint} className={cn('inline-flex items-center gap-1 whitespace-nowrap font-medium italic text-muted-foreground', className)}>
        <Icon size={12} aria-hidden="true" className="shrink-0" />
        {known?.label ?? nullLabel}
        <span className="sr-only"> — {hint}</span>
      </span>
    );
  }
  return (
    <span className={cn('whitespace-nowrap font-semibold tabular-nums text-foreground', className)}>
      {precise ? formatCurrencyPrecise(value) : formatCurrency(value)}
    </span>
  );
}
