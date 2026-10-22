import { useState } from 'react';
import { CalendarClock, CheckCircle2, ExternalLink, FileCheck2, TriangleAlert } from 'lucide-react';
import type { CompanyDocumentChecklistItem, CompanyDocumentPut, CompanyDocumentStatus } from '@/api';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { GlossaryTerm } from '@/features/help/components/glossary-term';
import { toast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/format';
import { useCompanyDocuments, usePutCompanyDocument } from './hooks/use-company-documents';
import { documentValidity } from './lib/readiness';

const DAY = 86_400_000;
const addDays = (date: string, days: number) => new Date(`${date}T12:00:00Z`).getTime() + days * DAY;
const dateOnly = (value: number) => new Date(value).toISOString().slice(0, 10);

export function daysUntil(expiresAt: string, asOf: string): number {
  return Math.round((new Date(`${expiresAt}T12:00:00Z`).getTime() - new Date(`${asOf}T12:00:00Z`).getTime()) / DAY);
}

function validityLabel(expiresAt: string | null, asOf: string, expires: boolean) {
  if (!expiresAt) return expires ? 'Validade não informada: não conta como em dia' : 'Não tem vencimento';
  const days = daysUntil(expiresAt, asOf);
  if (days < 0) return `Venceu há ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'}`;
  if (days === 0) return 'Vence hoje';
  return `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

function DocumentRow({ item, asOf, editable }: { item: CompanyDocumentChecklistItem; asOf: string; editable: boolean }) {
  const saved = item.document;
  const [status, setStatus] = useState<CompanyDocumentStatus>(saved?.status ?? 'missing');
  const [issuedAt, setIssuedAt] = useState(saved?.issuedAt ?? '');
  const [expiresAt, setExpiresAt] = useState(saved?.expiresAt ?? '');
  const [reference, setReference] = useState(saved?.reference ?? '');
  const put = usePutCompanyDocument();
  const expired = status === 'have' && Boolean(expiresAt) && expiresAt < asOf;
  // Saving is offered only for a real change; twelve always-on buttons hid which card needed attention.
  const dirty =
    status !== (saved?.status ?? 'missing') ||
    issuedAt !== (saved?.issuedAt ?? '') ||
    expiresAt !== (saved?.expiresAt ?? '') ||
    reference !== (saved?.reference ?? '');
  const save = () => {
    const body: CompanyDocumentPut = { status, issuedAt: issuedAt || null, expiresAt: expiresAt || null, reference: reference || null };
    put.mutate({ kind: item.catalog.kind, body }, {
      onSuccess: () => toast({ title: 'Documento atualizado', description: item.catalog.label }),
      onError: () => toast({ variant: 'destructive', title: 'Não foi possível salvar', description: 'Revise os dados e tente de novo.' }),
    });
  };
  const suggest = () => {
    if (!item.catalog.suggestedValidityDays) return;
    const base = issuedAt || asOf;
    if (!issuedAt) setIssuedAt(asOf);
    setExpiresAt(dateOnly(addDays(base, item.catalog.suggestedValidityDays)));
  };
  return (
    <li className="rounded-xl border border-border bg-card p-4 sm:p-5" data-testid={`company-document-${item.catalog.kind}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${status === 'have' && !expired ? 'bg-status-open text-status-open-foreground' : 'bg-muted text-muted-foreground'}`}>
          {status === 'have' && !expired ? <CheckCircle2 size={17} aria-hidden /> : <FileCheck2 size={17} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <h2 className="type-ui font-semibold text-foreground">{item.catalog.label}</h2>
            <GlossaryTerm termId={item.catalog.glossaryId} variant="icon" />
          </div>
          <p className="mt-1 type-meta text-muted-foreground">{item.catalog.description}</p>
          {status === 'have' && <p className={`mt-2 inline-flex items-center gap-1 type-meta font-semibold ${expired ? 'text-destructive' : 'text-foreground'}`}><CalendarClock size={14} aria-hidden />{validityLabel(expiresAt || null, asOf, item.catalog.suggestedValidityDays !== null)}</p>}
        </div>
        <a href={item.catalog.officialUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:focus-ring" aria-label={`Abrir fonte oficial de ${item.catalog.label}`}><ExternalLink size={16} aria-hidden /></a>
      </div>
      <div className={`mt-4 grid gap-3 ${status === 'have' ? 'sm:grid-cols-3' : 'sm:grid-cols-[minmax(0,16rem)_1fr] sm:items-end'}`}>
        <label className="type-meta font-medium text-foreground">Situação
          <select value={status} disabled={!editable} onChange={(event) => setStatus(event.target.value as CompanyDocumentStatus)} className="mt-1 h-10 w-full rounded-lg border border-input bg-surface px-3 type-ui focus-visible:focus-ring disabled:opacity-60">
            <option value="have">Tenho</option><option value="missing">Falta</option><option value="not_applicable">Não se aplica</option>
          </select>
        </label>
        {status === 'have' ? <>
          <label className="type-meta font-medium text-foreground">Emissão
            <input type="date" value={issuedAt} disabled={!editable} onChange={(event) => setIssuedAt(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-surface px-3 type-ui focus-visible:focus-ring disabled:opacity-60" />
          </label>
          <label className="type-meta font-medium text-foreground">Validade
            <input type="date" value={expiresAt} disabled={!editable} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-surface px-3 type-ui focus-visible:focus-ring disabled:opacity-60" />
          </label>
        </> : <div className="flex justify-end">
          <Button type="button" variant="dark" size="sm" disabled={!editable || !dirty} loading={put.isPending} onClick={save}>Salvar</Button>
        </div>}
      </div>
      {status === 'have' && <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="type-meta font-medium text-foreground">Referência opcional <span className="font-normal text-muted-foreground">(número ou órgão emissor)</span>
          <input value={reference} maxLength={160} disabled={!editable} onChange={(event) => setReference(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-surface px-3 type-ui focus-visible:focus-ring disabled:opacity-60" />
        </label>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {item.catalog.suggestedValidityDays && <Button type="button" variant="ghost" size="sm" disabled={!editable} onClick={suggest} title="A validade sugerida é só um atalho. Confirme a data no documento.">Sugerir {item.catalog.suggestedValidityDays} dias</Button>}
          <Button type="button" variant="dark" size="sm" disabled={!editable || !dirty} loading={put.isPending} onClick={save}>Salvar</Button>
        </div>
      </div>}
    </li>
  );
}

export default function BidReadinessPage() {
  const documents = useCompanyDocuments();
  const billing = useBilling();
  if (documents.isPending) return <RowsSkeleton rows={6} />;
  if (documents.isError) return <ErrorState error={documents.error} onRetry={() => documents.refetch()} />;
  const { ready, total, unknownValidity } = documents.data.progress;
  const percent = total === 0 ? 100 : Math.round((ready / total) * 100);
  const next = documents.data.items
    .filter((item) => item.document?.status !== 'not_applicable' && documentValidity(item, documents.data.asOf) !== 'valid')
    .slice(0, 3);
  return (
    <>
      <PageTitle title="Prontidão para licitar" description="Mantenha os documentos da empresa em dia e veja o que falta antes de preparar uma proposta." />
      <section className="mb-6 rounded-xl border border-border bg-card p-5 sm:p-7" aria-labelledby="readiness-progress-title">
        <div className="flex items-end justify-between gap-4"><div><h2 id="readiness-progress-title" className="type-section">{ready} de {total} documentos em dia</h2><p className="mt-1 type-meta text-muted-foreground">Itens marcados como “não se aplica” ficam fora da conta.{unknownValidity > 0 && ` ${unknownValidity} ${unknownValidity === 1 ? 'documento marcado como “tenho” está' : 'documentos marcados como “tenho” estão'} sem validade informada e não ${unknownValidity === 1 ? 'conta' : 'contam'} como em dia.`}</p></div><span className="type-title type-data">{percent}%</span></div>
        <div role="progressbar" aria-label="Progresso da prontidão" aria-valuemin={0} aria-valuemax={total} aria-valuenow={ready} className="mt-4 h-3 overflow-hidden rounded-pill bg-muted"><div className="h-full rounded-pill bg-accent transition-[width]" style={{ width: `${percent}%` }} /></div>
        {next.length > 0 ? <div className="mt-5 rounded-lg border border-border bg-muted p-4"><h3 className="type-ui font-semibold">Próximos passos</h3><ol className="mt-2 list-decimal space-y-1 pl-5 type-meta text-foreground">{next.map((item) => <li key={item.catalog.kind}>{documentValidity(item, documents.data.asOf) === 'unknown' ? `Informar a validade de ${item.catalog.label}.` : `Obter ou renovar ${item.catalog.label}.`}</li>)}</ol></div> : <p className="mt-5 inline-flex items-center gap-2 type-ui font-semibold text-status-open-foreground"><CheckCircle2 size={17} aria-hidden />Checklist em dia. Revise as exigências de cada edital.</p>}
        {!billing.data?.entitled && <p role="note" className="mt-4 flex gap-2 rounded-lg border border-warning bg-warning-subtle p-3 type-meta text-warning-subtle-foreground"><TriangleAlert size={16} className="shrink-0" aria-hidden />Você pode consultar o checklist. Assine para atualizar os documentos.</p>}
      </section>
      <p role="note" className="mb-4 type-meta text-muted-foreground">A validade sugerida em cada documento é só um atalho: confirme a data no próprio documento. O Pardal Digital guarda apenas estes metadados, sem upload de arquivos. O selo nos editais é uma ajuda baseada na leitura automática e pode errar; confira sempre o edital.</p>
      <ul className="space-y-4">{documents.data.items.map((item) => <DocumentRow key={`${item.catalog.kind}:${item.document?.updatedAt ?? 'new'}`} item={item} asOf={documents.data.asOf} editable={billing.data?.entitled === true} />)}</ul>
    </>
  );
}
