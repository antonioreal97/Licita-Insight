import { Link } from 'wouter';
import { ExternalLink, Loader2, Target } from 'lucide-react';
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

/** Detail view: level plus every reason, with the cited passage when the reason has one. */
export function FitDetails({ fit }: { fit: TenderFit | undefined }) {
  if (!fit || fit.status === 'pending') {
    return (
      <p role="status" className="flex items-center gap-2 type-meta text-muted-foreground" data-testid="text-fit-pending">
        <Loader2 size={14} aria-hidden="true" className="animate-spin" />
        Avaliando a aderência ao seu perfil…
      </p>
    );
  }
  const style = look(fit);
  return (
    <div className="space-y-3" data-testid="fit-details">
      {style && <FitBadge fit={{ ...fit, reasons: [] }} className="text-2xs" />}
      {fit.reasons.length > 0 && (
        <ul className="space-y-2.5">
          {fit.reasons.map((reason, index) => (
            <li key={`${reason.kind}-${index}`} className="type-meta text-foreground/90">
              {reasonText(reason)}
              {reason.kind === 'size_restricted' && (
                <figure className="mt-2">
                  <blockquote className="border-l-2 border-primary/50 pl-3 text-muted-foreground">{reason.evidence.text}</blockquote>
                  <figcaption className="mt-1.5">
                    <a
                      href={reason.evidence.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
                    >
                      <span className="truncate">{reason.evidence.documentTitle}</span>
                      <span className="shrink-0">· página {reason.evidence.page}</span>
                      <ExternalLink size={12} aria-hidden="true" className="shrink-0" />
                      <span className="sr-only">(documento oficial, abre em nova aba)</span>
                    </a>
                  </figcaption>
                </figure>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="type-meta text-muted-foreground">
        Avaliação automática com base no{' '}
        <Link href={PROFILE_HREF} className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring">
          perfil da empresa
        </Link>
        . Confira o edital antes de decidir.
      </p>
    </div>
  );
}
