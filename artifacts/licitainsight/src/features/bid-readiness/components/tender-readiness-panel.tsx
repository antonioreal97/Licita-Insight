import { Link } from 'wouter';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { useTenderSheet } from '@/features/tenders/hooks/use-tender-sheet';
import { useCompanyDocuments } from '../hooks/use-company-documents';
import { tenderReadiness } from '../lib/readiness';
import { ReadinessBadge } from './readiness-badge';

export function TenderReadinessPanel({ tenderId }: { tenderId: string }) {
  const billing = useBilling();
  const sheet = useTenderSheet(tenderId, billing.data?.entitled === true);
  const documents = useCompanyDocuments();
  const readiness = tenderReadiness(documents.data, { sheet: sheet.data });
  if (!readiness) return null;
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-7" aria-labelledby="tender-readiness-title" data-testid="tender-readiness-panel">
      <h2 id="tender-readiness-title" className="type-section">Prontidão da sua empresa</h2>
      <ReadinessBadge sheet={sheet.data} />
      <p className="mt-3 type-meta text-muted-foreground">Ajuda baseada na leitura automática da ficha; ela pode errar e não substitui a conferência do edital.</p>
      <Link href="/readiness" className="mt-3 inline-flex rounded-lg type-meta font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring">Revisar documentos da empresa</Link>
    </section>
  );
}
