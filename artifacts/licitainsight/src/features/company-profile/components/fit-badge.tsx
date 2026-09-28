import { Target } from 'lucide-react';
import type { FitReason, TenderFit } from '@/api';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

export const PROFILE_HREF = '/settings#perfil-empresa';

type Look = { label: string; className: string };

/** Level colour is a cue only: the label always says it. Blue is kept for "high" (the one worth acting on). */
function look(fit: TenderFit): Look | null {
  if (fit.status === 'filtered') return { label: 'Fora do seu perfil', className: 'bg-muted text-muted-foreground ring-border-subtle' };
  if (fit.status !== 'ready' || !fit.level) return null;
  if (fit.level === 'high') return { label: 'Alta aderência', className: 'bg-primary-subtle text-primary-subtle-foreground ring-primary/25' };
  if (fit.level === 'medium') return { label: 'Aderência média', className: 'bg-surface text-foreground ring-border' };
  return { label: 'Baixa aderência', className: 'bg-muted text-muted-foreground ring-border-subtle' };
}

const joinTerms = (terms: string[]) => terms.map((term) => `“${term}”`).join(', ');

/** Every sentence comes from a checkable source: the profile's own terms, a tender field, or a cited passage. */
export function reasonText(reason: FitReason): string {
  switch (reason.kind) {
    case 'offering_match':
      return `Combina com ${joinTerms(reason.terms)}, do seu perfil.`;
    case 'exclusion':
      return `Parece ser algo que vocês não atendem: ${joinTerms(reason.terms)}.`;
    case 'out_of_coverage':
      return reason.state ? `Edital em ${reason.state}, fora da sua área de atuação.` : 'Fora da sua área de atuação.';
    case 'out_of_value_range':
      return `Valor estimado de ${formatCurrency(reason.estimatedValue)}, fora da sua faixa de valor.`;
    case 'value_not_published':
      return 'O órgão não publicou o valor estimado; a faixa de valor não foi aplicada.';
    case 'size_restricted':
      return reason.restriction === 'me_epp_exclusive' ? 'O edital é exclusivo para ME/EPP.' : 'O edital reserva cota para ME/EPP.';
  }
}

/** Compact badge for result rows. Pending or missing fits render nothing: no placeholder noise in a list. */
export function FitBadge({ fit, className }: { fit: TenderFit | undefined; className?: string }) {
  const style = fit && look(fit);
  if (!fit || !style) return null;
  const why = fit.reasons.map(reasonText).join(' ');
  return (
    <span
      data-testid="badge-fit"
      data-level={fit.status === 'filtered' ? 'filtered' : fit.level}
      title={why || undefined}
      className={cn('relative z-raised inline-flex items-center gap-1 rounded-sm px-1.5 py-px text-3xs font-semibold ring-1 ring-inset', style.className, className)}
    >
      <Target size={11} aria-hidden="true" />
      {style.label}
      {why && <span className="sr-only">. {why}</span>}
    </span>
  );
}
