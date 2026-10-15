import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowDown, ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import type { Recommendation, RecommendationDismissReason, TenderHighlights } from '@/api';
import { Button } from '@/components/common/action-button';
import { PlatformBadge } from '@/features/tenders/components/platform-badge';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { DISMISS_LABELS, shortcutAction, swipeAction, type TriageAction } from './triage-state';

type Props = {
  recommendation: Recommendation; highlights?: TenderHighlights; registeredPlatforms: string[];
  busy: boolean; onAction: (action: TriageAction, reason?: RecommendationDismissReason) => void; onOpen: () => void;
};
export function TriageCard({ recommendation, highlights, registeredPlatforms, busy, onAction, onOpen }: Props) {
  const { tender, reasons } = recommendation;
  const [choosingReason, setChoosingReason] = useState(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const firstReason = useRef<HTMLButtonElement>(null);
  const dismissButton = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { if (choosingReason) firstReason.current?.focus(); }, [choosingReason]);
  function act(action: TriageAction) {
    if (busy || choosingReason) return;
    if (action === 'dismiss') setChoosingReason(true); else onAction(action);
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const interactive = Boolean(target?.closest('a,button,input,textarea,select,[contenteditable="true"],[role="dialog"]'));
      const action = shortcutAction(event.key, interactive, event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
      if (action && !busy && !choosingReason) { event.preventDefault(); act(action); }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  });
  const cancelReason = () => { setChoosingReason(false); dismissButton.current?.focus(); };
  return (
    <article aria-labelledby="triage-tender-title" aria-busy={busy} className="rounded-2xl border border-border bg-card p-5 sm:p-8"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={event => {
        if (event.pointerType !== 'touch' || !event.isPrimary || busy || choosingReason || (event.target as HTMLElement).closest('button,a,input')) return;
        origin.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { origin.current = null; }}
      onPointerUp={event => {
        const start = origin.current; origin.current = null;
        if (start) { const action = swipeAction(event.clientX - start.x, event.clientY - start.y); if (action) act(action); }
      }}>
      <p className="type-eyebrow text-muted-foreground">Uma oportunidade por vez</p>
      <h2 ref={title} tabIndex={-1} id="triage-tender-title" className="mt-3 break-words type-titulo-3 outline-none sm:type-titulo-2">{tender.displayTitle || tender.title}</h2>
      <p className="mt-3 type-body text-muted-foreground">{tender.organization.name}</p>
      <dl className="my-6 grid gap-4 border-y border-border py-5 sm:grid-cols-3">
        <div><dt className="type-meta text-muted-foreground">Local</dt><dd className="mt-1 font-semibold">{[tender.location.city, tender.location.state].filter(Boolean).join(' · ') || 'Não informado'}</dd></div>
        <div><dt className="type-meta text-muted-foreground">Prazo da proposta</dt><dd className="mt-1 font-semibold">{formatDateTime(tender.proposalDeadline, 'Não informado')}</dd></div>
        <div><dt className="type-meta text-muted-foreground">Valor estimado</dt><dd className="mt-1 font-semibold">{tender.estimatedValueFlag ? 'Valor em revisão' : formatCurrency(tender.estimatedValue)}</dd></div>
      </dl>
      <section aria-label="Motivo da aderência" className="rounded-xl bg-primary-subtle p-4 text-primary-subtle-foreground">
        <h3 className="font-semibold">Por que apareceu para você</h3>
        <ul className="mt-2 space-y-1 type-ui">{reasons.map(reason => <li key={`${reason.kind}-${reason.text}`}>{reason.text}</li>)}</ul>
      </section>
      <section aria-label="Exigências do edital" className="my-5">
        <h3 className="font-semibold">O que o edital pede</h3>
        {highlights?.requirements.length ? <ul className="mt-2 list-disc space-y-1 pl-5 type-ui">{highlights.requirements.slice(0, 3).map(item => <li key={item.label}>{item.label}</li>)}</ul>
          : <p className="mt-2 type-ui text-muted-foreground">Exigências ainda não disponíveis. Confira o documento ao abrir o edital.</p>}
        <p className="mt-2 type-meta text-muted-foreground">Aderência ao perfil não garante habilitação.</p>
      </section>
      <PlatformBadge platform={tender.platform} registeredPlatforms={registeredPlatforms} />
      <Link href={`/tenders/${encodeURIComponent(tender.id)}`} onClick={onOpen} className="my-5 flex min-h-11 w-fit items-center gap-2 font-semibold underline underline-offset-4">Abrir edital <ExternalLink size={15} aria-hidden /></Link>
      {choosingReason ? <div role="group" aria-label="Motivo opcional da dispensa" className="space-y-3 border-t border-border pt-5" onKeyDown={event => { if (event.key === 'Escape') cancelReason(); }}>
        <p className="font-semibold">O que não combina? <span className="font-normal text-muted-foreground">Opcional</span></p>
        <div className="grid gap-2 sm:grid-cols-2">{Object.entries(DISMISS_LABELS).map(([reason, label], i) => <Button key={reason} ref={i === 0 ? firstReason : undefined} variant="outline" size="lg" disabled={busy} onClick={() => onAction('dismiss', reason as RecommendationDismissReason)}>{label}</Button>)}</div>
        <div className="flex flex-wrap gap-2"><Button variant="dark" size="lg" disabled={busy} onClick={() => onAction('dismiss')}>Dispensar sem motivo</Button><Button variant="ghost" size="lg" disabled={busy} onClick={cancelReason}>Voltar</Button></div>
      </div> : <>
        <div role="group" aria-label="Avaliar edital" className="grid grid-cols-2 gap-3 border-t border-border pt-5">
          <Button ref={dismissButton} variant="outline" size="lg" className="h-14 px-3" disabled={busy} onClick={() => act('dismiss')}><ArrowLeft size={17} aria-hidden /> Não interessa</Button>
          <Button size="lg" className="h-14" disabled={busy} onClick={() => act('interest')}>Interessa <ArrowRight size={17} aria-hidden /></Button>
          <Button variant="ghost" size="lg" className="col-span-2" disabled={busy} onClick={() => act('skip')}><ArrowDown size={16} aria-hidden /> Pular por agora</Button>
        </div>
        <p className="mt-2 text-center type-meta text-muted-foreground">Setas ← dispensar · → interessa · ↓ pular.<br />No celular, arraste para os lados ou use os botões.</p>
      </>}
    </article>
  );
}
