import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { TenderSummary } from '@/api';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/hooks/use-toast';
import { SearchPagination } from '@/features/search/components/search-pagination';
import { TenderRow } from '@/features/tenders/components/tender-row';
import { formatCurrencyPrecise, formatDateTime } from '@/lib/format';
import { modalityLabels, statusLabels } from '@/lib/tender-labels';
import { useSavedTenders } from './hooks/use-saved-tenders';
import { fetchAllSavedTenders, useSavedTendersList } from './hooks/use-saved-tenders-list';

const PAGE_SIZE = 50;

const csvCell = (value: string | number | null) => `"${String(value ?? '').replace(/"/g, '""')}"`;

/** Client-side CSV. `;` + BOM so Excel pt-BR opens it with accents and columns intact. */
function downloadCsv(tenders: TenderSummary[]) {
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
  const [page, setPage] = useState(1);
  const list = useSavedTendersList({ page, pageSize: PAGE_SIZE });
  const { isSaved, isMonitored, toggle, toggleMonitor, status } = useSavedTenders();
  const [exporting, setExporting] = useState(false);

  const total = list.data?.pagination.total ?? 0;
  // Removed rows disappear at once (optimistic ids); the list refetches when the change settles.
  const rows = (list.data?.data ?? []).filter((item) => status !== 'ready' || isSaved(item.tender.id));

  // Removing the last row of the last page leaves an empty page: step back.
  const totalPages = list.data?.pagination.totalPages ?? 1;
  useEffect(() => {
    if (page > 1 && page > totalPages) setPage(Math.max(1, totalPages));
  }, [page, totalPages]);

  const remove = (id: string) => {
    const wasMonitored = isMonitored(id);
    toggle(id);
    toast({
      title: 'Edital removido dos salvos',
      action: (
        // Turning monitoring back on also saves it, so one request restores both.
        <ToastAction altText="Desfazer remoção" data-testid="button-undo-remove-saved" onClick={() => (wasMonitored ? toggleMonitor(id) : toggle(id))}>
          Desfazer
        </ToastAction>
      ),
    });
  };

  const exportList = async () => {
    setExporting(true);
    try {
      const all = await fetchAllSavedTenders();
      downloadCsv(all.map((item) => item.tender));
      toast({ title: `${all.length} ${all.length === 1 ? 'edital exportado' : 'editais exportados'}` });
    } catch (error) {
      console.error('[saved-tenders] Falha ao exportar CSV.', error);
      toast({ variant: 'destructive', title: 'Não foi possível exportar os editais salvos', description: 'Verifique a conexão e tente novamente.' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageTitle
        eyebrow="sua shortlist"
        title="Editais salvos"
        description="Salvos na sua conta. Os dados de cada edital vêm do banco."
        action={
          <Button
            variant="outline"
            data-testid="button-export-saved"
            disabled={exporting || list.isPending || total === 0}
            title={exporting ? 'Gerando o arquivo…' : total === 0 ? 'Nenhum edital salvo para exportar' : 'Baixar CSV dos editais salvos'}
            onClick={exportList}
          >
            <Download size={14} aria-hidden="true" />
            {exporting ? 'Exportando…' : 'Exportar CSV'}
          </Button>
        }
      />
      {list.isPending ? (
        <RowsSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : total === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-16 text-center type-body text-muted-foreground">
          Nenhum edital salvo ainda.
        </div>
      ) : (
        <div className="@container/results">
          <p aria-live="polite" className="mb-3 type-meta text-muted-foreground" data-testid="text-saved-count">
            {total} {total === 1 ? 'edital salvo' : 'editais salvos'}
            {list.isFetching && ' · atualizando…'}
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {rows.map(({ tender }) => (
              <TenderRow key={tender.id} tender={tender} saved onSave={() => remove(tender.id)} />
            ))}
          </div>
          {totalPages > 1 && <SearchPagination pagination={list.data.pagination} page={page} onPageChange={setPage} />}
        </div>
      )}
    </>
  );
}
