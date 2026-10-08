import { useEffect, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { Bookmark, ChevronDown, Download, Target } from 'lucide-react';
import type { ParticipationStage, SavedTender } from '@/api';
import { Button } from '@/components/common/action-button';
import { EmptyState } from '@/components/common/empty-state';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { ProvenanceLabel } from '@/features/participation/components/provenance-label';
import { useUpdateParticipation } from '@/features/participation/hooks/use-participation';
import { STAGE_LABELS, STAGE_ORDER } from '@/features/participation/lib/stages';
import { SearchPagination } from '@/features/search/components/search-pagination';
import { TenderRow } from '@/features/tenders/components/tender-row';
import { formatCurrencyPrecise, formatDateTime } from '@/lib/format';
import { modalityLabels, statusLabels } from '@/lib/tender-labels';
import { cn } from '@/lib/utils';
import { SavedTenderDecisionActions } from './components/saved-tender-decision-actions';
import { useSavedTenders } from './hooks/use-saved-tenders';
import { fetchAllSavedTenders, useSavedTendersList } from './hooks/use-saved-tenders-list';
import { csvCell } from './lib/csv-cell';

const PAGE_SIZE = 50;
const linkClass = 'type-meta font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring rounded-sm';

/** Stages still heading to the proposal deadline list the nearest deadline first. */
const BY_DEADLINE: ParticipationStage[] = ['analyzing', 'participating'];

const EMPTY: Record<ParticipationStage, { title: string; text: string }> = {
  analyzing: { title: 'Nada em análise', text: 'Editais que você salvar entram aqui até você decidir.' },
  participating: { title: 'Nenhum edital em preparação', text: 'No edital, use “Vou participar” para ver aqui o que preparar e o próximo prazo.' },
  submitted: {
    title: 'Nenhuma participação marcada como enviada',
    text: 'Depois de enviar no sistema indicado no edital, marque “Participação enviada” para continuar acompanhando.',
  },
  awaiting_result: {
    title: 'Nenhum edital aguardando resultado',
    text: 'Marque “Aguardando resultado” no edital enquanto o resultado não sai no portal oficial.',
  },
  completed: { title: 'Nenhum edital concluído', text: 'Editais que você marcar como “Concluída” ficam aqui.' },
  dismissed: { title: 'Nenhum edital descartado', text: 'Editais marcados como “Não vou participar” ficam aqui.' },
};

const countMarks = (item: SavedTender, state: 'have' | 'missing') => item.checklist.filter((mark) => mark.state === state).length;

/** Client-side CSV. `;` + BOM so Excel pt-BR opens it with accents and columns intact. The user's declarations say so in the header. */
function downloadCsv(items: SavedTender[]) {
  const header = [
    'Número',
    'Objeto',
    'Órgão',
    'Modalidade',
    'Status',
    'Valor estimado',
    'Prazo de propostas',
    'Município',
    'UF',
    'Fonte',
    'ID',
    'Etapa (você marcou)',
    'Próxima ação (você marcou)',
    'Prazo da próxima ação (você marcou)',
    'Protocolo (informado por você)',
    'Exigências que tenho (você marcou)',
    'Exigências que não tenho (você marcou)',
  ];
  const rows = items.map((item) => [
    item.tender.tenderNumber,
    item.tender.title,
    item.tender.organization.name,
    modalityLabels[item.tender.modality],
    statusLabels[item.tender.status],
    formatCurrencyPrecise(item.tender.estimatedValue, 'Não informado'),
    formatDateTime(item.tender.proposalDeadline, 'Não informado'),
    item.tender.location.city,
    item.tender.location.state,
    item.tender.source.url,
    item.tender.id,
    STAGE_LABELS[item.stage],
    item.nextAction,
    formatDateTime(item.nextActionDeadline, ''),
    item.protocol,
    countMarks(item, 'have'),
    countMarks(item, 'missing'),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `editais-salvos-${new Date().toLocaleDateString('en-CA')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Under each saved row: the user's stage, marks, next action and protocol, plus the stage menu and monitoring. */
function ParticipationBar({ item, monitored, onMonitor }: { item: SavedTender; monitored: boolean; onMonitor: () => void }) {
  const { update, isPending } = useUpdateParticipation();
  const id = item.tender.id;
  const have = countMarks(item, 'have');
  const missing = countMarks(item, 'missing');

  return (
    <div className="-mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3 sm:px-5" data-testid={`bar-participation-${id}`}>
      <div className="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-x-4 gap-y-1">
        <ProvenanceLabel kind="user">
          <span>
            Você marcou: <span className="font-semibold text-foreground">{STAGE_LABELS[item.stage]}</span>
          </span>
        </ProvenanceLabel>
        {item.checklist.length > 0 && (
          <span className="type-meta text-muted-foreground tabular-nums">
            {have} tenho · {missing} não tenho
          </span>
        )}
        {item.nextAction && (
          <span className="line-clamp-2 min-w-0 break-words type-meta text-muted-foreground">
            Próxima ação: <span className="text-foreground/90">{item.nextAction}</span>
            {item.nextActionDeadline && ` · até ${formatDateTime(item.nextActionDeadline)}`}
          </span>
        )}
        {item.protocol && <span className="min-w-0 break-all type-meta text-muted-foreground">Protocolo informado por você: {item.protocol}</span>}
      </div>
      {item.stage === 'analyzing' ? (
        <SavedTenderDecisionActions
          monitored={monitored}
          pending={isPending}
          describedBy={`tender-title-${id}`}
          onParticipate={() => update({ tenderId: id, previous: item, body: { stage: 'participating' } })}
          onDismiss={() => update({ tenderId: id, previous: item, body: { stage: 'dismissed' } })}
          onMonitor={onMonitor}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                loading={isPending}
                aria-describedby={`tender-title-${id}`}
                className="h-11 sm:h-8"
                data-testid={`button-stage-menu-${id}`}
              >
                Mudar etapa
                <ChevronDown size={13} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-60 rounded-xl bg-surface-raised p-1.5 shadow-lg">
              <DropdownMenuLabel className="px-2.5 py-1.5 type-meta font-semibold text-muted-foreground">Etapa deste edital</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={item.stage}
                onValueChange={(value) => value !== item.stage && update({ tenderId: id, previous: item, body: { stage: value as ParticipationStage } })}
              >
                {STAGE_ORDER.map((stage) => (
                  <DropdownMenuRadioItem key={stage} value={stage} className="cursor-pointer rounded-md py-2 type-ui" data-testid={`menu-stage-${stage}`}>
                    {STAGE_LABELS[stage]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={monitored}
            aria-describedby={`tender-title-${id}`}
            title={monitored ? 'Parar de monitorar este edital' : 'Monitorar mudanças neste edital'}
            onClick={onMonitor}
            className="h-11 sm:h-8"
            data-testid={`button-monitor-saved-${id}`}
          >
            <Target size={13} aria-hidden="true" />
            {monitored ? 'Monitorando' : 'Monitorar'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function SavedTendersPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const stageParam = new URLSearchParams(search).get('etapa');
  const stage = STAGE_ORDER.find((value) => value === stageParam);
  const [page, setPage] = useState(1);
  const list = useSavedTendersList({ page, pageSize: PAGE_SIZE, stage, sort: stage && BY_DEADLINE.includes(stage) ? 'deadline' : undefined });
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

  useEffect(() => {
    if (!list.isSuccess || !window.location.hash.startsWith('#saved-tender-')) return;
    const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
  }, [list.isSuccess, rows.length]);

  const filter = (next: ParticipationStage | undefined) => {
    setPage(1);
    navigate(next ? `/saved-tenders?etapa=${next}` : '/saved-tenders');
  };

  const remove = (id: string) => {
    toggle(id);
  };

  const exportList = async () => {
    setExporting(true);
    try {
      const all = await fetchAllSavedTenders();
      downloadCsv(all);
      toast({ title: `${all.length} ${all.length === 1 ? 'edital exportado' : 'editais exportados'}` });
    } catch (error) {
      console.error('[saved-tenders] Falha ao exportar CSV.', error);
      toast({ variant: 'destructive', title: 'Não foi possível exportar os editais salvos', description: 'Verifique a conexão e tente novamente.' });
    } finally {
      setExporting(false);
    }
  };

  const segments: { value: ParticipationStage | undefined; label: string }[] = [
    { value: undefined, label: 'Todos' },
    ...STAGE_ORDER.map((value) => ({ value, label: STAGE_LABELS[value] })),
  ];

  return (
    <>
      <PageTitle
        title="Editais salvos"
        description="Salvos na sua conta, por etapa. Os dados de cada edital vêm do banco; a etapa, as marcações e o protocolo são informados por você."
        action={
          <Button
            variant="outline"
            data-testid="button-export-saved"
            disabled={exporting || list.isPending || (total === 0 && !stage)}
            title={exporting ? 'Gerando o arquivo…' : 'Baixar CSV de todos os editais salvos'}
            onClick={exportList}
          >
            <Download size={14} aria-hidden="true" />
            {exporting ? 'Exportando…' : 'Exportar CSV'}
          </Button>
        }
      />
      {/* Below sm the control scrolls on its own; the page never scrolls sideways. */}
      <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1">
        <div role="group" aria-label="Filtrar por etapa (você marcou)" className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {segments.map((segment) => (
            <button
              key={segment.value ?? 'all'}
              type="button"
              aria-pressed={stage === segment.value}
              onClick={() => filter(segment.value)}
              className={cn(
                'h-11 whitespace-nowrap rounded-md px-3 type-ui font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring sm:h-7',
                stage === segment.value && 'bg-surface text-foreground shadow-2xs',
              )}
              data-testid={`filter-stage-${segment.value ?? 'all'}`}
            >
              {segment.label}
            </button>
          ))}
        </div>
      </div>
      {list.isPending ? (
        <RowsSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : total === 0 || rows.length === 0 ? (
        stage ? (
          <EmptyState icon={Bookmark} title={EMPTY[stage].title} testId="empty-saved-stage">
            {EMPTY[stage].text}
          </EmptyState>
        ) : (
          <EmptyState icon={Bookmark} title="Nenhum edital salvo ainda" testId="empty-saved">
            Salve um edital na busca ou no detalhe para acompanhar prazo e preparo aqui.{' '}
            <Link href="/search" className={linkClass}>
              Explorar editais
            </Link>
          </EmptyState>
        )
      ) : (
        <div className="@container/results">
          <p aria-live="polite" className="mb-3 type-meta text-muted-foreground" data-testid="text-saved-count">
            {total} {total === 1 ? 'edital salvo' : 'editais salvos'}
            {stage && ` em “${STAGE_LABELS[stage]}”`}
            {stage && BY_DEADLINE.includes(stage) && ' · prazo mais próximo primeiro'}
            {list.isFetching && ' · atualizando…'}
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {rows.map((item) => (
              // The row's own bottom border moves to the wrapper so the participation bar sits inside the same item.
              <div
                key={item.tender.id}
                id={`saved-tender-${item.tender.id}`}
                tabIndex={-1}
                className="scroll-mt-24 border-b border-border last:border-0 target:bg-primary-subtle/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&>article]:border-0"
              >
                <TenderRow tender={item.tender} saved onSave={() => remove(item.tender.id)} />
                <ParticipationBar item={item} monitored={isMonitored(item.tender.id)} onMonitor={() => toggleMonitor(item.tender.id)} />
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <SearchPagination pagination={list.data.pagination} page={page} onPageChange={setPage} noun={['edital salvo', 'editais salvos']} />
          )}
        </div>
      )}
    </>
  );
}
