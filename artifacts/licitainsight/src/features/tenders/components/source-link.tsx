import { ExternalLink } from 'lucide-react';
import type { SheetEvidence } from '@/api';

/** "p. N" link to the official document behind an automatically chosen passage. */
export function SourceLink({ evidence }: { evidence: Pick<SheetEvidence, 'documentTitle' | 'documentUrl' | 'page'> | null }) {
  if (!evidence) return null;
  return (
    <a
      href={evidence.documentUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={evidence.documentTitle}
      data-testid="link-sheet-source"
      className="inline-flex shrink-0 items-center gap-1 type-meta font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
    >
      p. {evidence.page}
      <ExternalLink size={11} aria-hidden="true" />
      <span className="sr-only">({evidence.documentTitle}, documento oficial, abre em nova aba)</span>
    </a>
  );
}
