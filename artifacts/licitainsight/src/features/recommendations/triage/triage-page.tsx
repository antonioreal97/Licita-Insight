import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import type { Recommendation, RecommendationDismissReason } from '@/api';
import { Button, buttonClass } from '@/components/common/action-button';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { useCompanyProfile, useSaveCompanyProfile } from '@/features/company-profile/hooks/use-company-profile';
import { useTenderHighlights } from '@/features/tenders/hooks/use-tender-highlights';
import { accountService } from '@/services/account-service';
import { aiService, PROFILE_LIMITS } from '@/services/ai-service';
import { queryKeys } from '@/services/query-keys';
import { useRecommendations } from '../hooks/use-recommendations';
import { advanceProgress, dismissalMessage, suggestedExclusion, TRIAGE_GOAL, type TriageAction } from './triage-state';
import { useTriageProgress } from './use-triage-progress';
import { TriageCard } from './triage-card';

export default function TriagePage() {
  // Only tenders that match the registered profile and region enter the deck.
  const recommendations = useRecommendations(50, { stable: true, scope: 'profile' });
  const profile = useCompanyProfile();
  const saveProfile = useSaveCompanyProfile();
  const client = useQueryClient();
  const { progress, update } = useTriageProgress();
  // Freeze the deck at first load so a server rebuild (1.5s after dismiss) cannot shrink/reorder the queue mid-session.
  const [queue, setQueue] = useState<Recommendation[] | null>(null);
  useEffect(() => {
    if (queue || !recommendations.data?.data?.length) return;
    setQueue(recommendations.data.data);
  }, [queue, recommendations.data?.data]);
  const current = progress.reviewed.length < TRIAGE_GOAL
    ? queue?.find(item => !progress.reviewed.includes(item.tender.id))
    : undefined;
  const highlights = useTenderHighlights(current ? [current.tender.id] : []);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [exclusion, setExclusion] = useState<string | null>(null);
  const finished = !current && !recommendations.isPending && !recommendations.isError && queue !== null;

  async function act(action: TriageAction, reason?: RecommendationDismissReason) {
    if (!current || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    const { tender } = current;
    try {
      if (action === 'interest') {
        await accountService.saveTender(tender.id);
        // Saving is the durable positive signal; a metric failure must never undo a successful save.
        void accountService
          .recordRecommendationInterest(tender.id)
          .catch((metricError) => console.error('[triage] Edital salvo, mas não foi possível registrar a métrica de interesse.', metricError));
        void client.invalidateQueries({ queryKey: queryKeys.me.savedTenders.all });
        setFeedback('Interesse marcado. O edital está em Editais salvos.');
      } else if (action === 'dismiss') {
        await accountService.dismissRecommendation(tender.id, reason);
        setFeedback(dismissalMessage(reason, tender));
      } else setFeedback('Pulado por agora. Isso não altera suas recomendações.');
      setExclusion(reason === 'not_offering' ? suggestedExclusion(tender) || null : null);
      update(advanceProgress(progress, tender.id, action));
      // Mark dashboard cache stale without refetching this page's frozen queue.
      void client.invalidateQueries({ queryKey: queryKeys.me.recommendations, refetchType: 'none' });
    } catch (actionError) {
      console.error(`[triage] Falha ao registrar "${action}" no edital ${tender.id}.`, actionError);
      setError(`Não foi possível registrar sua escolha (${actionError instanceof Error ? actionError.message : String(actionError)}). O edital continua aqui; tente novamente.`);
    } finally { locked.current = false; setBusy(false); }
  }
  async function confirmExclusion() {
    const term = exclusion?.trim();
    if (!term || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      // Re-read to preserve edits made since the triage started. No profile is changed before this confirmation.
      const { profile: latest } = await aiService.getCompanyProfile();
      if (!latest) { setError('Seu perfil ainda não foi configurado. Configure-o antes de adicionar exclusões.'); return; }
      const exclusions = Array.from(new Set([...latest.exclusions, term]));
      if (exclusions.length > PROFILE_LIMITS.terms) { setError(`O perfil já tem o máximo de ${PROFILE_LIMITS.terms} exclusões. Remova uma em Configurações para adicionar “${term}”.`); return; }
      await saveProfile.mutateAsync({ ...latest, exclusions });
      void client.invalidateQueries({ queryKey: queryKeys.me.recommendations, refetchType: 'none' });
      setFeedback(`“${term}” foi adicionado às exclusões do perfil.`); setExclusion(null);
    } catch (profileError) {
      console.error(`[triage] Falha ao adicionar "${term}" às exclusões do perfil.`, profileError);
      setError(`Não foi possível adicionar a exclusão (${profileError instanceof Error ? profileError.message : String(profileError)}).`);
    } finally { locked.current = false; setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-3xl pb-8">
      <Link href="/dashboard" className="inline-flex min-h-11 items-center type-ui underline underline-offset-4">← Visão geral</Link>
      <header className="mb-6 mt-3">
        <h1 className="type-title">Encontre o que combina com você</h1>
        <p className="mt-2 type-body text-muted-foreground">Uma seleção curta para decidir com calma. Suas escolhas ajustam as próximas recomendações.</p>
        <div className="mt-5 flex items-center justify-between gap-3"><p id="triage-progress-label" className="font-semibold">Triagem de hoje: {progress.reviewed.length} de {TRIAGE_GOAL}</p><span className="type-meta text-muted-foreground">No seu ritmo</span></div>
        <div role="progressbar" aria-labelledby="triage-progress-label" aria-valuemin={0} aria-valuemax={TRIAGE_GOAL} aria-valuenow={progress.reviewed.length} className="mt-3 h-2 overflow-hidden rounded-pill bg-muted">
          <div className="h-full rounded-pill bg-primary" style={{ width: `${(progress.reviewed.length / TRIAGE_GOAL) * 100}%` }} />
        </div>
        <p className="mt-2 type-meta text-muted-foreground">Você pode parar quando quiser. Progresso desta sessão, no horário de Brasília.</p>
      </header>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">{current ? `Edital ${progress.reviewed.length + 1}: ${current.tender.displayTitle || current.tender.title}.` : finished ? 'Seleção concluída.' : 'Carregando editais.'} Triagem de hoje: {progress.reviewed.length} de {TRIAGE_GOAL}.</p>
      {feedback && <p role="status" className="mb-4 rounded-xl border border-border bg-primary-subtle p-4 text-primary-subtle-foreground">{feedback}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl border border-border bg-inverse p-4 text-inverse-foreground">{error}</p>}
      {exclusion !== null && <section aria-label="Confirmar exclusão do perfil" className="mb-5 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Quer deixar isso fora do seu perfil?</h2>
        <p className="my-2 type-ui text-muted-foreground">Confirme o termo principal. Editais que o contenham deixarão de ser recomendados.</p>
        {profile.data?.profile ? <><label htmlFor="triage-exclusion" className="type-meta">Termo a excluir</label><input id="triage-exclusion" className="mb-3 mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3" value={exclusion} minLength={2} maxLength={80} onChange={event => setExclusion(event.target.value)} /><Button size="lg" variant="dark" disabled={busy || exclusion.trim().length < 2} onClick={() => void confirmExclusion()}>Confirmar exclusão</Button></>
          : <Link href="/settings#perfil-empresa" className={buttonClass('outline', 'lg')}>Configurar perfil</Link>}
        <Button size="lg" variant="ghost" disabled={busy} onClick={() => setExclusion(null)}>Agora não</Button>
      </section>}
      {recommendations.isPending ? <RowsSkeleton rows={3} /> : recommendations.isError ? <ErrorState error={recommendations.error} onRetry={() => recommendations.refetch()} /> : current ?
        <TriageCard key={current.tender.id} recommendation={current} registeredPlatforms={profile.data?.profile?.registeredPlatforms ?? []} highlights={highlights.data?.results[current.tender.id]} busy={busy} onAction={(action, reason) => void act(action, reason)} onOpen={() => { void accountService.recordRecommendationClick(current.tender.id).catch((clickError) => console.error('[triage] Não foi possível registrar o clique no edital.', clickError)); }} />
        : <section className="rounded-2xl border border-border bg-card p-6 sm:p-8" aria-label="Resumo da triagem">
          <h2 className="type-section">{progress.reviewed.length >= TRIAGE_GOAL ? 'Sua triagem de hoje está pronta' : progress.reviewed.length ? 'Você chegou ao fim desta seleção' : 'Ainda não há editais para triar'}</h2>
          {progress.reviewed.length === 0
            ? <p className="my-3 type-body">{profile.data?.profile
              ? 'A triagem só mostra editais abertos que combinam com o que você cadastrou no perfil (ofertas, palavras-chave ou categorias) e estão dentro da sua região de atuação. Quando surgir um assim, ele aparece aqui.'
              : 'A triagem mostra editais que combinam com o perfil da sua empresa. Cadastre o que você oferece e onde atua para começar.'}</p>
            : <p className="my-3 type-body">{progress.interested ? `Você marcou ${progress.interested} de interesse — estão em Editais salvos.` : 'Nenhum interesse marcado por aqui hoje. Tudo bem: a próxima oportunidade pode combinar melhor.'}</p>}
          {progress.skipped > 0 && <p className="mb-4 type-ui text-muted-foreground">{progress.skipped} pulados por agora. Eles podem voltar em outra seleção.</p>}
          <div className="mt-5 flex flex-wrap gap-3"><Link href="/saved-tenders" className={buttonClass('primary', 'lg')}>Ver Editais salvos</Link><Link href="/settings#perfil-empresa" className={buttonClass('outline', 'lg')}>Ajustar meu perfil</Link></div>
        </section>}
    </div>
  );
}
