import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'wouter';
import {
  Banknote,
  Bookmark,
  BookmarkCheck,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Download,
  ExternalLink,
  FilePen,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Gavel,
  Globe,
  Hash,
  Layers,
  MapPin,
  Megaphone,
  RefreshCw,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { isApiError, type TenderDetail, type TenderDocument, type TimelineEvent } from '@/api';
import { Button } from '@/components/common/action-button';
import { ErrorState } from '@/components/common/query-states';
import { useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { formatBytes, formatCurrency, formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { modalityLabels } from '@/lib/tender-labels';
import { cn } from '@/lib/utils';
import { DeadlineIndicator } from './components/deadline-indicator';
import { MetaItem } from './components/meta-item';
import { StatusBadge } from './components/status-badge';
import { ValueDisplay } from './components/value-display';
import { useTender } from './hooks/use-tender';
import { isFuture } from './lib/deadline';
import { formatPlace, sumItems } from './lib/tender-display';

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando licitação" className="space-y-6">
      <div className="h-3 w-40 animate-pulse rounded bg-muted" />
      <div className="h-9 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      <div className="h-20 animate-pulse rounded-xl bg-muted" />
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

const Panel = ({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cn('rounded-xl border border-border bg-card p-5 sm:p-6', className)}>
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="section-title">{title}</h2>
      {aside && <span className="shrink-0 text-xs text-muted-foreground">{aside}</span>}
    </div>
    {children}
  </section>
);

export default function TenderDetailPage() {
  const { id } = useParams();
  const query = useTender(id);
  const { isSaved, toggle } = useSavedTenders();
  // TODO(monitoring): local toggle until the monitoring API exists.
  const [monitoring, setMonitoring] = useState(false);

  if (query.isPending) return <DetailSkeleton />;
  if (query.isError) {
    const notFound = isApiError(query.error) && query.error.code === 'NOT_FOUND';
    return (
      <div className="space-y-4">
        <ErrorState error={query.error} onRetry={notFound ? undefined : () => query.refetch()} />
        <div className="text-center">
          <Link href="/search" className="text-xs font-semibold text-primary hover:underline">
            Voltar para a busca
          </Link>
        </div>
      </div>
    );
  }

  const tender = query.data;
  const saved = isSaved(tender.id);
  const place = formatPlace(tender.location);
  const modality = modalityLabels[tender.modality];

  const openSource = () => tender.source.url && window.open(tender.source.url, '_blank', 'noopener');

  return (
    <>
      <nav aria-label="Trilha" className="mb-5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <Link href="/search" className="shrink-0 hover:text-primary">
          Explorar editais
        </Link>
        <ChevronRight size={13} aria-hidden="true" className="shrink-0" />
        <span aria-current="page" className="min-w-0 truncate">
          {tender.tenderNumber ?? tender.id}
        </span>
      </nav>

      {/* Header: identity + actions */}
      <header className="mb-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-4xl">
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-muted-foreground">
            <StatusBadge status={tender.status} />
            <span title={tender.modalityLabel !== modality ? `Na fonte: ${tender.modalityLabel}` : undefined} className="font-semibold text-foreground/80">
              {modality}
            </span>
            {tender.tenderNumber && <span className="font-mono text-[11px]">{tender.tenderNumber}</span>}
            <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-secondary-foreground">DEMO · não oficial</span>
          </div>
          {/* Long objetos (some exceed 300 chars) step down in size so the facts strip stays above the fold. */}
          <h1
            className={cn(
              'break-words font-semibold leading-tight tracking-[-0.03em]',
              tender.title.length > 140 ? 'text-[19px] sm:text-[22px]' : 'text-[22px] sm:text-[28px] lg:text-[30px]',
            )}
          >
            {tender.title}
          </h1>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            <MetaItem icon={Building2} label="Órgão" title={tender.organization.name} className="max-w-full text-sm text-foreground/80">
              {tender.organization.name}
            </MetaItem>
            {tender.purchasingUnit && (
              <MetaItem icon={Layers} label="Unidade compradora" title={tender.purchasingUnit} className="max-w-full text-sm">
                {tender.purchasingUnit}
              </MetaItem>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-2">
          <Button variant={saved ? 'primary' : 'outline'} aria-pressed={saved} data-testid="button-detail-save" onClick={() => toggle(tender.id)}>
            {saved ? <BookmarkCheck size={15} aria-hidden="true" /> : <Bookmark size={15} aria-hidden="true" />}
            {saved ? 'Salvo' : 'Salvar edital'}
          </Button>
          <Button
            variant={monitoring ? 'primary' : 'outline'}
            aria-pressed={monitoring}
            data-testid="button-detail-monitor"
            onClick={() => setMonitoring(!monitoring)}
          >
            <Target size={15} aria-hidden="true" />
            {monitoring ? 'Monitorando' : 'Monitorar'}
          </Button>
          {tender.source.url ? (
            <Button variant="dark" data-testid="button-open-source" onClick={openSource}>
              Abrir fonte original <ExternalLink size={14} aria-hidden="true" />
              <span className="sr-only">(abre em nova aba)</span>
            </Button>
          ) : (
            <Button variant="outline" disabled data-testid="button-open-source" title="A fonte não publicou um link direto para este edital">
              Fonte sem link público
            </Button>
          )}
        </div>
      </header>

      {/* Key facts strip — sticky on desktop so value/deadline stay visible while evaluating items and documents. */}
      <section aria-label="Principais informações" className="z-10 mb-6 rounded-xl border border-border bg-card shadow-sm xl:sticky xl:top-[88px]">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 p-4 sm:grid-cols-3 sm:p-5 xl:grid-cols-6">
          <MetaItem variant="stacked" icon={Banknote} label="Valor estimado">
            <ValueDisplay value={tender.estimatedValue} nullLabel="Sigiloso / não informado" className="whitespace-normal text-base" />
          </MetaItem>
          <MetaItem variant="stacked" icon={CalendarClock} label="Prazo de propostas" className="col-span-2 sm:col-span-1">
            <DeadlineIndicator deadline={tender.proposalDeadline} status={tender.status} variant="block" />
          </MetaItem>
          <MetaItem variant="stacked" icon={Gavel} label="Abertura da sessão">
            <DateValue value={tender.openingAt} withTime />
          </MetaItem>
          <MetaItem variant="stacked" icon={CalendarDays} label="Publicação">
            <DateValue value={tender.publishedAt} />
          </MetaItem>
          <MetaItem variant="stacked" icon={MapPin} label="Local" title={place ?? undefined}>
            <span className="block break-words font-semibold">
              {tender.location.city ?? <span className="font-medium italic text-muted-foreground">Município não informado</span>}
            </span>
            <span className="text-xs text-muted-foreground">{tender.location.state ?? 'UF não informada'}</span>
          </MetaItem>
          <MetaItem variant="stacked" icon={Globe} label="Fonte" title={tender.source.name}>
            <span className="block break-words font-semibold">{tender.source.name}</span>
            <span className="text-xs text-muted-foreground">
              atualizado <time dateTime={tender.updatedAt}>{formatDate(tender.updatedAt)}</time>
            </span>
          </MetaItem>
        </dl>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Objeto">
            <p className="break-words text-sm leading-7 text-foreground/90">{tender.objectSummary ?? 'Resumo não disponível na fonte.'}</p>
            {tender.description && tender.description !== tender.objectSummary && (
              <p className="mt-3 break-words text-sm leading-7 text-muted-foreground">{tender.description}</p>
            )}
            <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
              <MetaItem variant="stacked" icon={Hash} label="Número do processo">
                <span className="break-all font-mono text-xs">{tender.processNumber ?? '—'}</span>
              </MetaItem>
              <MetaItem variant="stacked" icon={Layers} label="Unidade compradora">
                <span className="break-words text-sm">{tender.purchasingUnit ?? '—'}</span>
              </MetaItem>
              <MetaItem variant="stacked" icon={Gavel} label="Modalidade">
                <span className="text-sm">{modality}</span>
                {tender.modalityLabel !== modality && <span className="block text-xs text-muted-foreground">Na fonte: {tender.modalityLabel}</span>}
              </MetaItem>
            </dl>
            {tender.categories.length > 0 && (
              <ul aria-label="Categorias" className="mt-5 flex flex-wrap gap-1.5">
                {tender.categories.map((category) => (
                  <li key={category.slug} className="rounded bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    {category.label}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <ItemsPanel tender={tender} />
          <TimelinePanel events={tender.timeline} />
        </div>

        <aside className="min-w-0 space-y-6">
          <DocumentsPanel documents={tender.documents} />

          <Panel title="Órgão e fonte">
            <dl className="space-y-4">
              <MetaItem variant="stacked" icon={Building2} label="Órgão contratante">
                <span className="block break-words font-semibold">{tender.organization.name}</span>
                {tender.purchasingUnit && <span className="block break-words text-xs text-muted-foreground">{tender.purchasingUnit}</span>}
              </MetaItem>
              <MetaItem variant="stacked" icon={MapPin} label="Localização">
                <span className="break-words">{place ?? 'Não informada'}</span>
                {tender.location.state && !tender.location.city && (
                  <span className="block text-xs text-muted-foreground">Município não informado na fonte</span>
                )}
              </MetaItem>
              <MetaItem variant="stacked" icon={Globe} label="Fonte dos dados">
                <span className="block break-words font-semibold">{tender.source.name}</span>
                <span className="block text-xs text-muted-foreground">
                  Atualizado em <time dateTime={tender.updatedAt}>{formatDate(tender.updatedAt)}</time>
                </span>
              </MetaItem>
            </dl>
            {tender.source.url ? (
              <a
                href={tender.source.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-source-panel"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3.5 py-2 text-[13px] font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Abrir fonte original <ExternalLink size={14} aria-hidden="true" />
                <span className="sr-only">(abre em nova aba)</span>
              </a>
            ) : (
              <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">A fonte não publicou um link direto para este edital.</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

function DateValue({ value, withTime = false }: { value: string | null; withTime?: boolean }) {
  if (!value) return <span className="text-sm font-semibold text-muted-foreground">Não informado</span>;
  return (
    <time dateTime={value} className="text-sm font-semibold tabular-nums">
      {withTime ? formatDateTime(value) : formatDate(value)}
    </time>
  );
}

function ItemsPanel({ tender }: { tender: TenderDetail }) {
  const { items } = tender;
  const { total, missing } = sumItems(items);
  const estimate = tender.estimatedValue;
  const differsFromEstimate = estimate !== null && total !== null && estimate > 0 && Math.abs(total - estimate) / estimate > 0.01;
  const count = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;

  return (
    <Panel title="Itens da contratação" aside={count}>
      {items.length === 0 ? (
        <p className="rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">A fonte não detalhou itens para esta licitação.</p>
      ) : (
        <div
          role="region"
          aria-label="Tabela de itens"
          tabIndex={0}
          className="-mx-5 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:-mx-6"
        >
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-xs">
            <caption className="sr-only">Itens da contratação com quantidades e valores estimados</caption>
            <thead className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="w-10 border-y border-border bg-muted/50 py-2.5 pl-5 pr-2 font-medium sm:pl-6">
                  #
                </th>
                <th scope="col" className="border-y border-border bg-muted/50 px-3 py-2.5 font-medium">
                  Descrição
                </th>
                <th scope="col" className="border-y border-border bg-muted/50 px-3 py-2.5 text-right font-medium">
                  Qtd.
                </th>
                <th scope="col" className="border-y border-border bg-muted/50 px-3 py-2.5 font-medium">
                  Unid.
                </th>
                <th scope="col" className="border-y border-border bg-muted/50 px-3 py-2.5 text-right font-medium">
                  Valor unitário
                </th>
                <th scope="col" className="border-y border-border bg-muted/50 py-2.5 pl-3 pr-5 text-right font-medium sm:pr-6">
                  Valor total
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id} className="hover:bg-muted/40">
                  <td className="border-b border-border py-3 pl-5 pr-2 align-top font-mono text-[10px] text-muted-foreground sm:pl-6">{index + 1}</td>
                  <th scope="row" className="border-b border-border px-3 py-3 align-top font-medium">
                    <span className="break-words">{item.description}</span>
                  </th>
                  <td className="whitespace-nowrap border-b border-border px-3 py-3 text-right align-top tabular-nums">
                    {item.quantity === null ? <span className="text-muted-foreground">—</span> : formatNumber(item.quantity)}
                  </td>
                  <td className="border-b border-border px-3 py-3 align-top text-muted-foreground">{item.unit ?? '—'}</td>
                  <td className="border-b border-border px-3 py-3 text-right align-top">
                    <ValueDisplay value={item.estimatedUnitValue} precise className="font-medium" />
                  </td>
                  <td className="border-b border-border py-3 pl-3 pr-5 text-right align-top sm:pr-6">
                    <ValueDisplay value={item.estimatedTotalValue} precise />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={5} className="py-3 pl-5 pr-3 text-right text-[11px] font-semibold sm:pl-6">
                  Total estimado dos itens
                  {missing > 0 && total !== null && (
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {missing} {missing === 1 ? 'item sem valor informado não somado' : 'itens sem valor informado não somados'}
                    </span>
                  )}
                </th>
                <td className="py-3 pl-3 pr-5 text-right align-top sm:pr-6">
                  <ValueDisplay value={total} precise className="text-[13px]" />
                </td>
              </tr>
              {differsFromEstimate && (
                <tr>
                  <td colSpan={6} className="px-5 pb-1 text-right text-[10px] text-muted-foreground sm:px-6">
                    A soma dos itens difere do valor estimado do edital ({formatCurrency(tender.estimatedValue)}) — pode refletir periodicidade ou lotes não
                    detalhados.
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  );
}

const docIcon = (doc: TenderDocument): LucideIcon => (/\.(xlsx?|csv|ods)$/i.test(doc.name) || /planilha/i.test(doc.type) ? FileSpreadsheet : FileText);

function DocumentsPanel({ documents }: { documents: TenderDocument[] }) {
  return (
    <Panel title="Documentos" aside={documents.length}>
      {documents.length === 0 ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Nenhum documento publicado pela fonte.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => {
            const Icon = docIcon(doc);
            const size = formatBytes(doc.sizeBytes);
            return (
              <li key={doc.id}>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`button-download-${doc.id}`}
                  aria-label={`Baixar ${doc.name} (${doc.type}${size ? `, ${size}` : ''})`}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon size={18} aria-hidden="true" className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span title={doc.name} className="block truncate text-xs font-medium">
                      {doc.name}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-1.5 text-[10px] text-muted-foreground">
                      <span className="font-semibold text-foreground/70">{doc.type}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{size ?? 'tamanho não informado'}</span>
                      {doc.publishedAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <time dateTime={doc.publishedAt}>{formatDate(doc.publishedAt)}</time>
                        </>
                      )}
                    </span>
                  </span>
                  <Download size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

const timelineMeta: Record<TimelineEvent['type'], { icon: LucideIcon; label: string }> = {
  published: { icon: Megaphone, label: 'Publicação' },
  amended: { icon: FilePen, label: 'Retificação' },
  deadline_changed: { icon: CalendarClock, label: 'Prazo' },
  status_changed: { icon: RefreshCw, label: 'Mudança de status' },
  document_added: { icon: FilePlus2, label: 'Novo documento' },
};

function TimelinePanel({ events }: { events: TimelineEvent[] }) {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <Panel title="Cronologia" aside={`${events.length} ${events.length === 1 ? 'evento' : 'eventos'}`}>
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum evento registrado.</p>
      ) : (
        <ol className="relative space-y-5">
          {sorted.map((event, index) => {
            const { icon: Icon, label } = timelineMeta[event.type];
            const upcoming = isFuture(event.at);
            return (
              <li key={`${event.type}-${event.at}-${index}`} className="relative flex gap-3">
                {index < sorted.length - 1 && <span aria-hidden="true" className="absolute left-[15px] top-8 h-[calc(100%-0.75rem)] w-px bg-border" />}
                <span
                  aria-hidden="true"
                  className={cn(
                    'relative grid h-8 w-8 shrink-0 place-items-center rounded-full border',
                    upcoming ? 'border-dashed border-primary bg-card text-primary' : 'border-border bg-muted text-foreground/70',
                  )}
                >
                  <Icon size={14} />
                </span>
                <div className="min-w-0 pt-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground/80">{label}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={event.at} className="tabular-nums">
                      {formatDateTime(event.at)}
                    </time>
                    {upcoming && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Previsto</span>}
                  </div>
                  <p className="mt-1 break-words text-sm">{event.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
