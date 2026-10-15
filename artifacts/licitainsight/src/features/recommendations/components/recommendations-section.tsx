import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Link } from 'wouter';
import type { RecommendationsResponse } from '@/api';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { ToastAction } from '@/components/ui/toast';
import { ProfileInviteCard } from '@/features/company-profile/components/profile-invite-card';
import { useCompanyProfile } from '@/features/company-profile/hooks/use-company-profile';
import { useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { TenderRow } from '@/features/tenders/components/tender-row';
import { toast } from '@/hooks/use-toast';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';
import { Sparkles } from 'lucide-react';
import { useDismissRecommendation, useRecommendations } from '../hooks/use-recommendations';
import { RecommendationActions, RECOMMENDATION_INTEREST_TOAST } from './recommendation-actions';
import { ApplicationBadge } from '@/features/opportunities/components/application-panel';

export function RecommendationsSection() {
  const recommendations = useRecommendations();
  const profile = useCompanyProfile();
  const dismiss = useDismissRecommendation();
  const { isSaved, save, changingId } = useSavedTenders();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const markInterest = (tenderId: string) => {
    save(tenderId, () => {
      void accountService
        .recordRecommendationInterest(tenderId)
        .catch((error) => console.error('[recommendations] Edital salvo, mas não foi possível registrar a métrica de interesse.', error));
      queryClient.setQueriesData<RecommendationsResponse>({ queryKey: queryKeys.me.recommendations }, (current) => {
        if (!current || !current.data.some(({ tender }) => tender.id === tenderId)) return current;
        const data = current.data.filter(({ tender }) => tender.id !== tenderId);
        const total = Math.max(0, current.pagination.total - 1);
        return {
          ...current,
          data,
          pagination: {
            ...current.pagination,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / current.pagination.pageSize),
          },
        };
      });
      toast({
        title: RECOMMENDATION_INTEREST_TOAST,
        action: (
          <ToastAction
            altText="Abrir este edital em Editais salvos"
            data-testid="button-toast-open-saved-tender"
            onClick={() => navigate(`/saved-tenders?etapa=analyzing#saved-tender-${encodeURIComponent(tenderId)}`)}
          >
            Abrir
          </ToastAction>
        ),
      });
    });
  };
  return (
    <section aria-labelledby="recommendations-title" data-testid="dashboard-recommendations">
      <div className="mb-3">
        <h2 id="recommendations-title" className="flex items-center gap-2 type-section text-foreground">
          <Sparkles size={16} aria-hidden /> Recomendados para você
        </h2>
        <p className="mt-1 type-meta text-muted-foreground">Oportunidades e editais em aberto ligados aos seus interesses. Os motivos mostram por que cada item apareceu.</p>
      </div>
      {recommendations.isPending ? (
        <RowsSkeleton rows={3} />
      ) : recommendations.isError ? (
        <ErrorState error={recommendations.error} onRetry={() => recommendations.refetch()} />
      ) : recommendations.data && (recommendations.data.data.length || recommendations.data.opportunities?.length) ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {recommendations.data.opportunities?.map(({ opportunity, reasons }) => <div key={`opportunity-${opportunity.id}`} className="border-b border-border px-4 py-4 last:border-0 sm:px-5">
            <div className="flex flex-wrap items-center gap-2 type-meta text-muted-foreground"><span className="rounded-full bg-secondary px-2 py-1 text-secondary-foreground">{opportunity.sourceName}</span><span>{opportunity.opportunityType ?? 'Oportunidade'}</span><ApplicationBadge application={opportunity.application} /></div>
            <Link href={`/oportunidades/${encodeURIComponent(opportunity.id)}`} className="mt-2 block rounded-lg type-section text-foreground hover:text-primary focus-visible:focus-ring">{opportunity.title}</Link>
            <p className="mt-1 type-meta text-muted-foreground">{opportunity.organizationName}</p>
            <ul className="mt-2 type-meta text-muted-foreground">{reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>
          </div>)}
          {recommendations.data.data.map((recommendation) => (
            <div key={recommendation.tender.id} className="border-b border-border last:border-0">
              <TenderRow
                tender={recommendation.tender}
                saved={isSaved(recommendation.tender.id)}
                onOpen={() => void accountService.recordRecommendationClick(recommendation.tender.id).catch(() => undefined)}
                compact
                showSave={false}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-sunken px-4 py-2.5 sm:px-5">
                <ul className="min-w-0 flex-1 space-y-1 type-meta text-muted-foreground">
                  {recommendation.reasons.map((reason) => (
                    <li key={`${reason.kind}-${reason.text}`}>• {reason.text}</li>
                  ))}
                </ul>
                <RecommendationActions
                  saved={isSaved(recommendation.tender.id)}
                  saving={changingId === recommendation.tender.id}
                  dismissing={dismiss.isPending && dismiss.variables === recommendation.tender.id}
                  describedBy={`tender-title-${recommendation.tender.id}`}
                  onInterest={() => markInterest(recommendation.tender.id)}
                  onDismiss={() => dismiss.mutate(recommendation.tender.id)}
                />
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
