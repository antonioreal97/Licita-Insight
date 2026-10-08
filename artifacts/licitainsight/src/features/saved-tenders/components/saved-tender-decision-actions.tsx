import React from 'react';
import { Bell, Check, X } from 'lucide-react';
import { Button } from '@/components/common/action-button';

type Props = {
  monitored: boolean;
  pending: boolean;
  describedBy: string;
  onParticipate: () => void;
  onDismiss: () => void;
  onMonitor: () => void;
};

/** The three immediate decisions available while a newly saved tender is still being analyzed. */
export function SavedTenderDecisionActions({ monitored, pending, describedBy, onParticipate, onDismiss, onMonitor }: Props) {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto" role="group" aria-label="Decidir sobre este edital">
      <Button
        type="button"
        variant="dark"
        size="sm"
        disabled={pending}
        aria-describedby={describedBy}
        onClick={onParticipate}
        className="h-11 sm:h-8"
        data-testid="button-quick-participating"
      >
        <Check size={13} aria-hidden /> Vou participar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-describedby={describedBy}
        onClick={onDismiss}
        className="h-11 sm:h-8"
        data-testid="button-quick-dismissed"
      >
        <X size={13} aria-hidden /> Não vou participar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-pressed={monitored}
        aria-describedby={describedBy}
        onClick={onMonitor}
        className="h-11 max-w-full whitespace-normal text-center sm:h-8 sm:whitespace-nowrap"
        data-testid="button-quick-monitor"
      >
        <Bell size={13} aria-hidden /> {monitored ? 'Parar de acompanhar (desativar notificações)' : 'Só acompanhar (receber notificações)'}
      </Button>
    </div>
  );
}
