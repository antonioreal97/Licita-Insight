import { Sparkles, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { ProfileInviteCard } from '@/features/company-profile/components/profile-invite-card';
import { useCompanyProfile } from '@/features/company-profile/hooks/use-company-profile';
import { useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { TenderRow } from '@/features/tenders/components/tender-row';
import { accountService } from '@/services/account-service';
import { useDismissRecommendation, useRecommendations } from '../hooks/use-recommendations';
import { trackRecommendationAction } from '@/features/analytics/google-analytics';

export function RecommendationsSection() {
  const recommendations = useRecommendations();
  const profile = useCompanyProfile();
  const dismiss = useDismissRecommendation();
  const { isSaved, toggle } = useSavedTenders();
  return (
    <section aria-labelledby="recommendations-title" data-testid="dashboard-recommendations">
      <div className="mb-3">
        <h2 id="recommendations-title" className="flex items-center gap-2 type-section text-foreground">
          <Sparkles size={16} aria-hidden /> Recomendados para você
        </h2>
        <p className="mt-1 type-meta text-muted-foreground">Editais em aberto ordenados pelos seus sinais. Os motivos mostram por que cada item apareceu.</p>
      </div>
      {recommendations.isPending ? (
        <RowsSkeleton rows={3} />
      ) : recommendations.isError ? (
        <ErrorState error={recommendations.error} onRetry={() => recommendations.refetch()} />
      ) : recommendations.data?.data.length ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {recommendations.data.data.map((recommendation) => (
            <div key={recommendation.tender.id} className="border-b border-border last:border-0">
              <TenderRow
                tender={recommendation.tender}
                saved={isSaved(recommendation.tender.id)}
                onSave={() => toggle(recommendation.tender.id)}
                onOpen={() => {
                  trackRecommendationAction('recommendation_interest');
                  void accountService.recordRecommendationClick(recommendation.tender.id).catch(() => undefined);
                }}
                compact
              />
              <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-sunken px-4 py-2.5 sm:px-5">
                <ul className="min-w-0 flex-1 space-y-1 type-meta text-muted-foreground">
                  {recommendation.reasons.map((reason) => (
                    <li key={`${reason.kind}-${reason.text}`}>• {reason.text}</li>
                  ))}
                </ul>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={dismiss.isPending && dismiss.variables === recommendation.tender.id}
                  onClick={() => dismiss.mutate(recommendation.tender.id)}
                >
                  <ThumbsDown size={14} aria-hidden /> Não tenho interesse
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : !profile.data?.profile ? (
        <ProfileInviteCard />
      ) : (
        <p className="rounded-xl border border-border bg-card p-5 type-ui text-muted-foreground">
          Ainda não há recomendações suficientes. Salve ou monitore editais e buscas para melhorar esta seleção.
        </p>
      )}
    </section>
  );
}
