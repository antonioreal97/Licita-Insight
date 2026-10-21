import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { useRecommendations } from '../hooks/use-recommendations';
import { TRIAGE_GOAL } from './triage-state';
import { useTriageProgress } from './use-triage-progress';
export function TriageEntry() {
  // Same strict deck as /triagem, so the count matches what the page will show.
  const recommendations = useRecommendations(50, { scope: 'profile' });
  const { progress } = useTriageProgress();
  const count = Math.min(TRIAGE_GOAL - progress.reviewed.length, recommendations.data?.data.filter(item => !progress.reviewed.includes(item.tender.id)).length ?? 0);
  if (!count && progress.reviewed.length === 0) return null;
  return <Link href="/triagem" className="flex items-center justify-between gap-4 rounded-xl border border-border bg-primary-subtle p-5 text-primary-subtle-foreground" data-testid="triage-entry">
    <div><h2 className="type-section">{count ? `${count} ${count === 1 ? 'edital esperando sua triagem' : 'editais esperando sua triagem'}` : 'Confira sua triagem de hoje'}</h2><p className="mt-1 type-ui">{progress.reviewed.length ? `Triagem de hoje: ${progress.reviewed.length} de ${TRIAGE_GOAL}.` : 'Interessa ou não interessa? Suas escolhas melhoram a seleção.'}</p></div><ArrowRight aria-hidden className="shrink-0" />
  </Link>;
}
