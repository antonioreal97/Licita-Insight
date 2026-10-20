import React from 'react';
import { ArrowRightLeft } from 'lucide-react';
import type { ParticipationStage } from '@/api';
import { Button } from '@/components/common/action-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { STAGE_LABELS, STAGE_ORDER } from '@/features/participation/lib/stages';

type Props = {
  tenderId: string;
  stage: ParticipationStage;
  pending: boolean;
  /** Another card is moving: one change at a time, like the list's stage menu. */
  disabled?: boolean;
  /** Id of the card title, so the trigger reads "Mover para…, <título>". */
  describedBy: string;
  onMove: (stage: ParticipationStage) => void;
};

/** Keyboard path of the board: a menu of every stage, the current one checked (Radix: arrows, Enter, Escape). */
export function MoveStageMenu({ tenderId, stage, pending, disabled = false, describedBy, onMove }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          disabled={disabled}
          aria-describedby={describedBy}
          className="h-11 sm:h-8"
          data-move-trigger={tenderId}
          data-testid={`button-move-stage-${tenderId}`}
        >
          <ArrowRightLeft size={13} aria-hidden="true" />
          Mover para…
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-60 rounded-xl bg-surface-raised p-1.5">
        <DropdownMenuLabel className="px-2.5 py-1.5 type-meta font-semibold text-muted-foreground">Mover para a etapa</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={stage} onValueChange={(value) => value !== stage && onMove(value as ParticipationStage)}>
          {STAGE_ORDER.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} className="cursor-pointer rounded-lg py-2 type-ui" data-testid={`menu-move-${option}`}>
              {STAGE_LABELS[option]}
              {option === stage && <span className="sr-only"> (etapa atual)</span>}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
