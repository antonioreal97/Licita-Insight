import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { useRecommendations } from '../hooks/use-recommendations';
import { TRIAGE_GOAL, triageEntryCopy } from './triage-state';
import { useTriageProgress } from './use-triage-progress';
export function TriageEntry() {
  // Same strict deck as /triagem, so the count matches what the page will show.
  const recommendations = useRecommendations(50, { scope: 'profile' });
  const { progress } = useTriageProgress();
  const count = Math.min(TRIAGE_GOAL - progress.reviewed.length, recommendations.data?.data.filter(item => !progress.reviewed.includes(item.tender.id)).length ?? 0);
  if (!count && progress.reviewed.length === 0) return null;
  const { title, subtitle } = triageEntryCopy(count, progress.reviewed.length);
  return <Link href="/triagem" className="flex items-center justify-between gap-4 rounded-xl border border-border bg-primary-subtle p-5 text-primary-subtle-foreground" data-testid="triage-entry">
    <div><h2 className="type-section">{title}</h2><p className="mt-1 type-ui">{subtitle}</p></div><ArrowRight aria-hidden className="shrink-0" />
  </Link>;
}
