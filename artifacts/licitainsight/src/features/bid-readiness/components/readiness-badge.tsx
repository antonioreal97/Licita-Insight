import { CheckCircle2, CircleAlert } from 'lucide-react';
import type { TenderHighlights, TenderSheet } from '@/api';
import { useCompanyDocuments } from '../hooks/use-company-documents';
import { tenderReadiness } from '../lib/readiness';

export function ReadinessBadge({ highlights, sheet }: { highlights?: TenderHighlights; sheet?: TenderSheet }) {
  const documents = useCompanyDocuments();
  const readiness = tenderReadiness(documents.data, { highlights, sheet });
  if (!readiness) return null;
  const ready = readiness.state === 'ready';
  const labels = readiness.state === 'missing' ? readiness.labels : [];
  return (
    <span
      data-testid="tender-readiness-badge"
      title="Ajuda baseada na leitura automática do edital. Confira sempre o texto oficial."
      className={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 type-meta font-semibold ${ready ? 'bg-status-open text-status-open-foreground' : 'bg-status-under-review text-status-under-review-foreground'}`}
    >
      {ready ? <CheckCircle2 size={14} aria-hidden /> : <CircleAlert size={14} aria-hidden />}
      <span className="truncate">{ready ? 'Você está pronto' : `Faltam ${labels.length} ${labels.length === 1 ? 'documento' : 'documentos'}: ${labels.join(', ')}`}</span>
    </span>
  );
}
