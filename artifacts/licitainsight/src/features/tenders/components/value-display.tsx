import React from 'react';
import { EyeOff, Lock, TriangleAlert } from 'lucide-react';
import type { TenderSummary } from '@/api';
import { formatCurrency, formatCurrencyPrecise } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SUSPECT_VALUE_NOTE, SUSPECT_VALUE_TEXT, suspectValueHint, suspectValueReason } from '../lib/estimated-value-flag';

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
  /** Set when the official value looks wrong: the value stays, toned down, with a warning. */
  flag?: TenderSummary['estimatedValueFlag'];
  /** How much of the warning is visible: only the icon (tables), the sentence (cards) or the sentence and its reason (detail). */
  flagVariant?: 'icon' | 'label' | 'explained';
  /** `precise` shows centavos (items table); default rounds to reais. */
  precise?: boolean;
  /** Text shown when the value is `null` and the API did not say why. */
  nullLabel?: string;
  className?: string;
};

/** Money value with tabular figures. `null` renders an explicit, muted state: "Sigiloso", "Não informado" or `nullLabel`. */
export function ValueDisplay({ value, status, flag, flagVariant = 'label', precise = false, nullLabel = 'Não informado', className }: Props) {
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
  const amount = precise ? formatCurrencyPrecise(value) : formatCurrency(value);
  if (!flag) {
    return <span className={cn('whitespace-nowrap font-semibold tabular-nums text-foreground', className)}>{amount}</span>;
  }
  const hint = suspectValueHint(flag);
  const icon = <TriangleAlert size={12} aria-hidden="true" className="inline-block shrink-0 align-[-0.125em] text-warning" />;
  // One box, so the warning stays under its value and follows the text alignment of the cell or column it sits in.
  return (
    <span data-testid="value-suspect" data-flag={flag} className="inline-block max-w-full align-top">
      <span className={cn('whitespace-nowrap font-medium tabular-nums text-muted-foreground', className)}>{amount}</span>
      {flagVariant === 'icon' ? (
        <span title={`${SUSPECT_VALUE_TEXT}. ${hint}`} className="ml-1 whitespace-nowrap">
          {icon}
          <span className="sr-only">
            {' '}
            — {SUSPECT_VALUE_TEXT}. {hint}
          </span>
        </span>
      ) : (
        <span
          title={flagVariant === 'label' ? hint : undefined}
          className={cn('mt-0.5 block whitespace-normal text-xs font-medium leading-4 text-muted-foreground', flagVariant === 'label' && 'max-w-44')}
        >
          {icon} {SUSPECT_VALUE_TEXT}
          {flagVariant === 'label' ? (
            <span className="sr-only">. {hint}</span>
          ) : (
            <span className="mt-0.5 block font-normal">
              {suspectValueReason(flag)} {SUSPECT_VALUE_NOTE}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
