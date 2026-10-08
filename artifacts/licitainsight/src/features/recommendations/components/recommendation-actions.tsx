import React from 'react';
import { BookmarkCheck, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/common/action-button';

export const RECOMMENDATION_INTEREST_TOAST = 'Salvo em Editais salvos. Defina se vai participar.';

type Props = {
  saved: boolean;
  saving: boolean;
  dismissing: boolean;
  describedBy: string;
  onInterest: () => void;
  onDismiss: () => void;
};

/** Explicit, mutually clear feedback actions for a recommendation card. */
export function RecommendationActions({ saved, saving, dismissing, describedBy, onInterest, onDismiss }: Props) {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto" role="group" aria-label="Avaliar recomendação">
      <Button
        type="button"
        size="sm"
        loading={saving}
        disabled={saved}
        aria-describedby={describedBy}
        onClick={onInterest}
        className="h-11 sm:h-8"
        data-testid={`button-recommendation-interest-${describedBy.replace('tender-title-', '')}`}
      >
        {saved ? <BookmarkCheck size={14} aria-hidden /> : <ThumbsUp size={14} aria-hidden />}
        {saved ? 'Salvo' : 'Tenho interesse'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={dismissing}
        disabled={saved || saving}
        aria-describedby={describedBy}
        onClick={onDismiss}
        className="h-11 sm:h-8"
        data-testid={`button-recommendation-dismiss-${describedBy.replace('tender-title-', '')}`}
      >
        <ThumbsDown size={14} aria-hidden /> Não tenho interesse
      </Button>
    </div>
  );
}
