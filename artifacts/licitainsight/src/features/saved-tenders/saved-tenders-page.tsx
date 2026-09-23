import { useQueries } from '@tanstack/react-query';
import { CircleAlert, Download, RefreshCw, Trash2 } from 'lucide-react';
import { isApiError, type TenderDetail } from '@/api';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/hooks/use-toast';
import { TenderRow } from '@/features/tenders/components/tender-row';
import { tenderQuery } from '@/features/tenders/hooks/use-tender';
import { formatCurrencyPrecise, formatDateTime } from '@/lib/format';
import { modalityLabels, statusLabels } from '@/lib/tender-labels';
import { useSavedTenders } from './hooks/use-saved-tenders';

// Saved ids live in the browser; each one is resolved through the detail endpoint (no saved-tenders API yet).

const csvCell = (value: string | number | null) => `"${String(value ?? '').replace(/"/g, '""')}"`;

/** Client-side CSV of the rows that loaded. `;` + BOM so Excel pt-BR opens it with accents and columns intact. */
function downloadCsv(tenders: TenderDetail[]) {
  const header = ['Número', 'Objeto', 'Órgão', 'Modalidade', 'Status', 'Valor estimado', 'Prazo de propostas', 'Município', 'UF', 'Fonte', 'ID'];
  const rows = tenders.map((t) => [
    t.tenderNumber,
    t.title,
    t.organization.name,
    modalityLabels[t.modality],
    statusLabels[t.status],
    formatCurrencyPrecise(t.estimatedValue, 'Não informado'),
    formatDateTime(t.proposalDeadline, 'Não informado'),
    t.location.city,
    t.location.state,
    t.source.url,
    t.id,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `editais-salvos-${new Date().toLocaleDateString('en-CA')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function SavedTendersPage() {
  const { saved, toggle, restore } = useSavedTenders();
  const queries = useQueries({ queries: saved.map((id) => tenderQuery(id)) });
  const loaded = queries.flatMap((q) => (q.data ? [q.data] : []));
  const pending = queries.some((q) => q.isPending);
  const failed = saved.length - loaded.length;

  const remove = (id: string) => {
    const index = saved.indexOf(id);
    toggle(id);
    toast({
      title: 'Edital removido dos salvos',
      action: (
        <ToastAction altText="Desfazer remoção" data-testid="button-undo-remove-saved" onClick={() => restore(id, index)}>
          Desfazer
        </ToastAction>
      ),
    });
  };

  const exportList = () => {
    downloadCsv(loaded);
    toast({
      title: `${loaded.length} ${loaded.length === 1 ? 'edital exportado' : 'editais exportados'}`,
      description: failed > 0 ? `${failed} ${failed === 1 ? 'edital não carregou e ficou' : 'editais não carregaram e ficaram'} fora do arquivo.` : undefined,
    });
  };

  return (
    <>
      <PageTitle
        eyebrow="sua shortlist"
        title="Editais salvos"
        description="Salvos neste navegador. Os dados de cada edital vêm do banco."
        action={
          <Button
            variant="outline"
            data-testid="button-export-saved"
            disabled={pending || loaded.length === 0}
            title={pending ? 'Aguarde os editais carregarem' : loaded.length === 0 ? 'Nenhum edital carregado para exportar' : 'Baixar CSV dos editais salvos'}
            onClick={exportList}
          >
            <Download size={14} aria-hidden="true" />
            Exportar CSV
          </Button>
        }
      />
      {saved.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-16 text-center type-body text-muted-foreground">
          Nenhum edital salvo ainda.
        </div>
      ) : (
        <>
          <p aria-live="polite" className="mb-3 type-meta text-muted-foreground" data-testid="text-saved-count">
            {saved.length} {saved.length === 1 ? 'edital salvo' : 'editais salvos'}
            {pending && ' · carregando…'}
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {saved.map((id, index) => {
              const query = queries[index];
              if (query.data) return <TenderRow key={id} tender={query.data} saved onSave={() => remove(id)} />;
              if (query.isPending) return <PendingRow key={id} />;
              return <FailedRow key={id} id={id} error={query.error} onRetry={() => query.refetch()} onRemove={() => remove(id)} />;
            })}
          </div>
        </>
      )}
    </>
  );
}

function PendingRow() {
  return (
    <div role="status" aria-label="Carregando edital" className="border-b border-border px-4 py-4 last:border-0 sm:px-5">
      <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
      <div className="mt-2 h-4 w-3/4 animate-pulse rounded-sm bg-muted" />
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded-sm bg-muted" />
    </div>
  );
}

function FailedRow({ id, error, onRetry, onRemove }: { id: string; error: Error | null; onRetry: () => void; onRemove: () => void }) {
  const notFound = isApiError(error) && error.code === 'NOT_FOUND';
  const requestId = isApiError(error) ? error.requestId : undefined;
  return (
    <div
      role={notFound ? undefined : 'alert'}
      data-testid={`row-saved-unavailable-${id}`}
      className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:px-5"
    >
      <div className="flex min-w-0 gap-2.5">
        <CircleAlert size={16} aria-hidden="true" className={notFound ? 'mt-0.5 shrink-0 text-muted-foreground' : 'mt-0.5 shrink-0 text-destructive'} />
        <div className="min-w-0">
          <p className="type-ui font-semibold text-foreground">
            {notFound ? 'Edital não encontrado na base' : 'Não foi possível carregar este edital'}{' '}
            <span className="break-all type-data text-2xs font-normal text-muted-foreground">(id {id})</span>
          </p>
          <p className="mt-0.5 type-meta text-muted-foreground">
            {notFound ? 'Ele pode ter sido removido da fonte ou salvo numa versão anterior do banco.' : 'Verifique a conexão e tente novamente.'}
            {requestId && <span className="ml-1.5 type-data text-3xs">ref. {requestId}</span>}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {!notFound && (
          <Button variant="outline" size="sm" data-testid={`button-retry-saved-${id}`} onClick={onRetry}>
            <RefreshCw size={13} aria-hidden="true" />
            Tentar novamente
          </Button>
        )}
        <Button variant="outline" size="sm" data-testid={`button-remove-saved-${id}`} aria-label={`Remover ${id} dos salvos`} onClick={onRemove}>
          <Trash2 size={13} aria-hidden="true" />
          Remover
        </Button>
      </div>
    </div>
  );
}
