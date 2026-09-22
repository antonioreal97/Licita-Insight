import type { TenderStatus } from '@/api';
import { statusLabels } from '@/lib/tender-labels';

// Status tones come from --status-* tokens (src/index.css). Each pair is AA (≥4.5:1) in light and dark — see /design-system/tokens.md.
const tones: Record<TenderStatus, string> = {
  open: 'bg-status-open text-status-open-foreground',
  under_review: 'bg-status-under-review text-status-under-review-foreground',
  closed: 'bg-status-closed text-status-closed-foreground',
  suspended: 'bg-status-suspended text-status-suspended-foreground',
  cancelled: 'bg-status-cancelled text-status-cancelled-foreground',
};

export function StatusBadge({ status }: { status: TenderStatus }) {
  const cancelled = status === 'cancelled';
  return (
    <span
      data-testid={`status-${status}`}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-semibold ${tones[status]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${cancelled ? 'border border-current bg-transparent' : 'bg-current'}`} />
      <span className={cancelled ? 'line-through decoration-1' : undefined}>{statusLabels[status]}</span>
    </span>
  );
}
