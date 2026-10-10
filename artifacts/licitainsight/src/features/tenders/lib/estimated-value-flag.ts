import type { EstimatedValueFlag } from '@/api';

export const SUSPECT_VALUE_TEXT = 'Valor informado na fonte parece incorreto';

const REASONS: Record<EstimatedValueFlag, string> = {
  absolute_ceiling: 'Passa de R$ 100 bilhões, patamar que nenhuma contratação pública atinge.',
  dispensa_legal_limit: 'É uma dispensa por valor (Lei 14.133/2021, art. 75, I ou II) mais de mil vezes acima do limite legal.',
  modality_outlier: 'É mais de mil vezes maior que o valor de 99% dos editais desta modalidade.',
};

export const SUSPECT_VALUE_NOTE = 'Mostramos o valor como a fonte publicou, mas ele fica fora de somas, filtros de valor e rankings. Confira o edital.';

/** Why the value was flagged. A reason this build does not know yet still gets the generic note. */
export const suspectValueReason = (flag: EstimatedValueFlag): string => REASONS[flag] ?? '';

/** Reason plus what the flag changes, for tooltips and screen readers. */
export const suspectValueHint = (flag: EstimatedValueFlag): string => [suspectValueReason(flag), SUSPECT_VALUE_NOTE].filter(Boolean).join(' ');
