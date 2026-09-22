import type { TenderStatus } from '@/api';
import { statusLabels } from '@/lib/tender-labels';

// DS-DEBT: hard-coded hex tones. Design System Architect to replace with status tokens (--status-*).
const tones: Record<TenderStatus, string> = {
  open: 'bg-[#e1f4ed] text-[#14765c]',
  under_review: 'bg-[#fff2d9] text-[#95610b]',
  closed: 'bg-muted text-muted-foreground',
  suspended: 'bg-[#fde7e4] text-[#ad4239]',
  cancelled: 'bg-muted text-muted-foreground line-through decoration-1',
};

export function StatusBadge({ status }: { status: TenderStatus }) {
  return (
    <span data-testid={`status-${status}`} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabels[status]}
    </span>
  );
}
