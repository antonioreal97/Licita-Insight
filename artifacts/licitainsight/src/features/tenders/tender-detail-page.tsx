import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'wouter';
import {
  Banknote,
  Bookmark,
  BookmarkCheck,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
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
  Inbox,
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
import { formatBytes, formatCurrency, formatCurrencyPrecise, formatDate, formatDateNumeric, formatDateTime, formatNumber } from '@/lib/format';
import { modalityLabels } from '@/lib/tender-labels';
import { cn } from '@/lib/utils';
import { DeadlineIndicator } from './components/deadline-indicator';
import { MetaItem } from './components/meta-item';
import { StatusBadge } from './components/status-badge';
import { ValueDisplay } from './components/value-display';
import { useTender } from './hooks/use-tender';
import { isFuture } from './lib/deadline';
import { formatPlace, isMostlyUppercase, shortTenderNumber, sumItems } from './lib/tender-display';

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando licitação" className="space-y-6">
      <div className="h-3 w-40 animate-pulse rounded-sm bg-muted" />
      <div className="h-9 w-3/4 animate-pulse rounded-sm bg-muted" />
      <div className="h-3 w-1/2 animate-pulse rounded-sm bg-muted" />
      <div className="h-20 animate-pulse rounded-xl bg-muted" />
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

const Panel = ({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cn('rounded-xl border border-border bg-card p-5 sm:p-7', className)}>
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="type-section text-foreground">{title}</h2>
      {aside && <span className="shrink-0 type-data text-2xs text-muted-foreground">{aside}</span>}
    </div>
    {children}
  </section>
);

/** Long objetos (PNCP often sends 300–600 chars) are clamped so value and deadline stay above the fold. */
const LONG_TITLE = 140;

/** `true` while the facts strip has left its natural position right under the sentinel, i.e. it is stuck (xl only). */
function useStuck(ready: boolean) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const update = () => {
      const strip = node.nextElementSibling;
      setStuck(Boolean(strip) && strip!.getBoundingClientRect().top - node.getBoundingClientRect().bottom > 1);
    };
    update();
    // Capture phase catches whichever element scrolls (window or the shell's main).
    document.addEventListener('scroll', update, { passive: true, capture: true });
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
    };
  }, [ready]);
  return { sentinel, stuck };
}

export default function TenderDetailPage() {
  const { id } = useParams();
  const query = useTender(id);
  const { isSaved, toggle } = useSavedTenders();
  // TODO(monitoring): local toggle until the monitoring API exists.
  const [monitoring, setMonitoring] = useState(false);
  const [titleExpanded, setTitleExpanded] = useState(false);
  // Animate the bookmark swap only after a click, never on load.
  const [saveToggled, setSaveToggled] = useState(false);
  const { sentinel, stuck } = useStuck(Boolean(query.data));

  if (query.isPending) return <DetailSkeleton />;
  if (query.isError) {
    const notFound = isApiError(query.error) && query.error.code === 'NOT_FOUND';
    return (
      <div className="space-y-4">
        <ErrorState error={query.error} onRetry={notFound ? undefined : () => query.refetch()} />
        <div className="text-center">
          <Link href="/search" className="type-meta font-semibold text-primary hover:underline">
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
  const number = shortTenderNumber(tender, modality);
  const long = tender.title.length > LONG_TITLE;
  // Official text is never re-cased; an all-caps objeto just gets one step smaller so it reads less like shouting.
  const caps = isMostlyUppercase(tender.title);
  const titleSize = long ? (caps ? 'type-section sm:type-title' : 'type-title') : caps ? 'type-title' : 'type-display-sm lg:type-display text-balance';

  const SaveIcon = saved ? BookmarkCheck : Bookmark;
  const saveIcon = (
    <SaveIcon key={String(saved)} size={15} aria-hidden="true" className={cn(saveToggled && 'animate-in zoom-in-90 duration-fast ease-emphasized')} />
  );
  const onSave = () => {
    setSaveToggled(true);
    toggle(tender.id);
  };
  const openSource = () => tender.source.url && window.open(tender.source.url, '_blank', 'noopener');

  return (
    <>
      <nav aria-label="Trilha" className="mb-5 flex min-w-0 items-center gap-2 type-meta text-muted-foreground">
        <Link href="/search" className="shrink-0 transition-colors duration-fast ease-standard hover:text-primary">
          Explorar editais
        </Link>
        <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-foreground-subtle" />
        <span aria-current="page" className="min-w-0 truncate">
          {tender.tenderNumber ?? tender.id}
        </span>
      </nav>

      {/* Header: identity + actions (actions move to a bottom bar below sm) */}
      <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 max-w-prose">
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 type-meta text-muted-foreground">
            <StatusBadge status={tender.status} />
            <span title={tender.modalityLabel !== modality ? `Na fonte: ${tender.modalityLabel}` : undefined} className="font-semibold text-foreground/80">
              {modality}
            </span>
            {number && (
              <span title={tender.tenderNumber ?? undefined} className="type-data text-3xs">
                {number}
              </span>
            )}
          </div>
          <h1
            id="tender-title"
            title={long ? tender.title : undefined}
            className={cn('break-words text-foreground', titleSize, long && !titleExpanded && 'line-clamp-3')}
          >
            {tender.title}
          </h1>
          {long && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={titleExpanded}
              aria-controls="tender-title"
              data-testid="button-toggle-title"
              onClick={() => setTitleExpanded(!titleExpanded)}
              className="-ml-2.5 mt-1"
            >
              {titleExpanded ? 'Mostrar menos' : 'Ver objeto completo'}
              <ChevronDown size={14} aria-hidden="true" className={cn('transition-transform duration-fast ease-standard', titleExpanded && 'rotate-180')} />
            </Button>
          )}
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <MetaItem icon={Building2} label="Órgão" title={tender.organization.name} className="max-w-full text-foreground/80">
              {tender.organization.name}
            </MetaItem>
            {tender.purchasingUnit && (
              <MetaItem icon={Layers} label="Unidade compradora" title={tender.purchasingUnit} className="max-w-full">
                {tender.purchasingUnit}
              </MetaItem>
            )}
          </div>
        </div>
        <div className="hidden shrink-0 flex-wrap items-start gap-2 sm:flex">
          <div className="inline-flex gap-2">
            <Button variant="outline" aria-pressed={saved} data-testid="button-detail-save" onClick={onSave}>
              {saveIcon}
              {saved ? 'Salvo' : 'Salvar edital'}
            </Button>
            <Button variant="outline" aria-pressed={monitoring} data-testid="button-detail-monitor" onClick={() => setMonitoring(!monitoring)}>
              <Target size={15} aria-hidden="true" />
              {monitoring ? 'Monitorando' : 'Monitorar'}
            </Button>
          </div>
          <div className="ml-1 border-l border-border pl-3">
            {tender.source.url ? (
              <Button variant="primary" data-testid="button-open-source" onClick={openSource}>
                Abrir fonte original <ExternalLink size={14} aria-hidden="true" />
                <span className="sr-only">(abre em nova aba)</span>
              </Button>
            ) : (
              <Button variant="outline" disabled data-testid="button-open-source" title="A fonte não publicou um link direto para este edital">
                Fonte sem link público
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Key facts strip — sticky on desktop so value/deadline stay visible while evaluating items and documents. Shadow only while stuck. */}
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      <section
        aria-label="Principais informações"
        data-stuck={stuck}
        className="z-raised mb-6 rounded-xl border border-border bg-card transition-shadow duration-base ease-standard xl:sticky xl:top-[calc(var(--spacing-header)+0.75rem)] xl:data-[stuck=true]:shadow-sm"
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-4 sm:grid-cols-3 sm:p-5 xl:grid-cols-[1.2fr_1.4fr_1.2fr_1fr_1fr_1.2fr]">
          <MetaItem variant="stacked" icon={Banknote} label="Valor estimado">
            <ValueDisplay
              value={tender.estimatedValue}
              status={tender.estimatedValueStatus}
              nullLabel="Sigiloso / não informado"
              className="whitespace-normal text-base"
            />
          </MetaItem>
          <MetaItem variant="stacked" icon={CalendarClock} label="Prazo de propostas" className="col-span-2 sm:col-span-1">
            <DeadlineIndicator deadline={tender.proposalDeadline} status={tender.status} variant="block" />
          </MetaItem>
          {/* PNCP `dataAberturaProposta` → openingAt: when proposals start being received (before the deadline), not the session. */}
          <MetaItem variant="stacked" icon={Inbox} label="Início das propostas">
            <DateValue value={tender.openingAt} withTime />
          </MetaItem>
          <MetaItem variant="stacked" icon={CalendarDays} label="Publicação">
            <DateValue value={tender.publishedAt} />
          </MetaItem>
          <MetaItem variant="stacked" icon={MapPin} label="Local" title={place ?? undefined}>
            <span className="block break-words font-semibold">
              {tender.location.city ?? <span className="font-medium italic text-muted-foreground">Município não informado</span>}
            </span>
            <span className="type-meta text-muted-foreground">{tender.location.state ?? 'UF não informada'}</span>
          </MetaItem>
          <MetaItem variant="stacked" icon={Globe} label="Fonte" title={tender.source.name}>
            <span className="block break-words font-semibold">{tender.source.name}</span>
            <span className="type-meta text-muted-foreground">
              atualizado{' '}
              <time dateTime={tender.updatedAt} title={formatDateTime(tender.updatedAt)} className="tabular-nums">
                {formatDateNumeric(tender.updatedAt)}
              </time>
            </span>
          </MetaItem>
        </dl>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Objeto">
            <p className="break-words type-body text-foreground/90">{tender.objectSummary ?? 'Resumo não disponível na fonte.'}</p>
            {tender.description && tender.description !== tender.objectSummary && (
              <p className="mt-3 break-words type-body text-muted-foreground">{tender.description}</p>
            )}
            <dl className="mt-5 grid gap-4 border-t border-border-subtle pt-5 sm:grid-cols-3">
              <MetaItem variant="stacked" icon={Hash} label="Número do processo">
                <span className="break-all type-data text-xs">{tender.processNumber ?? '—'}</span>
              </MetaItem>
              <MetaItem variant="stacked" icon={Layers} label="Unidade compradora">
                <span className="break-words text-sm">{tender.purchasingUnit ?? '—'}</span>
              </MetaItem>
              <MetaItem variant="stacked" icon={Gavel} label="Modalidade">
                <span className="text-sm">{modality}</span>
                {tender.modalityLabel !== modality && <span className="block type-meta text-muted-foreground">Na fonte: {tender.modalityLabel}</span>}
              </MetaItem>
            </dl>
            {tender.categories.length > 0 && (
              <ul aria-label="Categorias" className="mt-5 flex flex-wrap gap-1.5">
                {tender.categories.map((category) => (
                  <li key={category.slug} className="rounded-sm px-1.5 py-0.5 text-2xs font-medium text-muted-foreground ring-1 ring-inset ring-border-subtle">
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
        </aside>
      </div>

      {/* Mobile: one sticky action bar instead of the header buttons. */}
      <div aria-hidden="true" className="h-16 sm:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-sticky flex gap-2 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:hidden">
        <Button
          variant="outline"
          size="lg"
          aria-pressed={saved}
          aria-label={saved ? 'Salvo' : 'Salvar edital'}
          data-testid="button-detail-save-mobile"
          onClick={onSave}
          className="w-11 px-0"
        >
          {saveIcon}
        </Button>
        <Button
          variant="outline"
          size="lg"
          aria-pressed={monitoring}
          aria-label={monitoring ? 'Monitorando' : 'Monitorar'}
          data-testid="button-detail-monitor-mobile"
          onClick={() => setMonitoring(!monitoring)}
          className="w-11 px-0"
        >
          <Target size={15} aria-hidden="true" />
        </Button>
        {tender.source.url ? (
          <Button variant="primary" size="lg" data-testid="button-open-source-mobile" onClick={openSource} className="flex-1">
            Abrir fonte original <ExternalLink size={14} aria-hidden="true" />
            <span className="sr-only">(abre em nova aba)</span>
          </Button>
        ) : (
          <Button variant="outline" size="lg" disabled data-testid="button-open-source-mobile" className="flex-1">
            Fonte sem link público
          </Button>
        )}
      </div>
    </>
  );
}

function DateValue({ value, withTime = false }: { value: string | null; withTime?: boolean }) {
  if (!value) return <span className="text-sm font-semibold text-muted-foreground">Não informado</span>;
  return (
    <time dateTime={value} className="text-sm xl:whitespace-nowrap font-semibold tabular-nums">
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
  const missingNote =
    missing > 0 && total !== null ? `${missing} ${missing === 1 ? 'item sem valor informado não somado' : 'itens sem valor informado não somados'}` : null;
  const differenceNote = differsFromEstimate
    ? `A soma dos itens difere do valor estimado do edital (${formatCurrency(tender.estimatedValue)}) — pode refletir periodicidade ou lotes não detalhados.`
    : null;
  const th = 'whitespace-nowrap border-y border-border bg-muted/50 px-3 py-2.5 font-medium';
  const td = 'border-b border-border-subtle px-3 py-3 align-top';

  return (
    <Panel title="Itens da contratação" aside={count}>
      {items.length === 0 ? (
        <p className="rounded-lg bg-muted px-4 py-3 type-meta text-muted-foreground">A fonte não detalhou itens para esta licitação.</p>
      ) : (
        <>
          {/* Mobile: stacked list so unit and total values are never behind a horizontal scroll. */}
          <ul aria-label="Itens da contratação" className="-mx-5 divide-y divide-border-subtle border-y border-border-subtle sm:hidden">
            {items.map((item) => (
              <li key={item.id} className="px-5 py-3">
                <p className="break-words type-ui font-medium">{item.description}</p>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 type-data text-2xs text-muted-foreground">
                    {item.quantity === null ? '—' : formatNumber(item.quantity)}
                    {item.unit ? ` ${item.unit}` : ''} × {formatCurrencyPrecise(item.estimatedUnitValue)}
                  </span>
                  <ValueDisplay value={item.estimatedTotalValue} precise className="type-ui" />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-start justify-between gap-3 sm:hidden">
            <p className="type-meta font-semibold">
              Total estimado dos itens
              {missingNote && <span className="block text-3xs font-normal text-muted-foreground">{missingNote}</span>}
            </p>
            <ValueDisplay value={total} precise className="type-ui" />
          </div>
          {differenceNote && <p className="mt-2 text-3xs text-muted-foreground sm:hidden">{differenceNote}</p>}

          <div role="region" aria-label="Tabela de itens" tabIndex={0} className="-mx-7 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-xs">
              <caption className="sr-only">Itens da contratação com quantidades e valores estimados</caption>
              <thead className="type-label text-muted-foreground">
                <tr>
                  <th scope="col" className={cn(th, 'w-10 pl-7 pr-2')}>
                    #
                  </th>
                  <th scope="col" className={th}>
                    Descrição
                  </th>
                  <th scope="col" className={cn(th, 'text-right')}>
                    Qtd.
                  </th>
                  <th scope="col" className={th}>
                    Unid.
                  </th>
                  <th scope="col" className={cn(th, 'text-right')}>
                    Valor unitário
                  </th>
                  <th scope="col" className={cn(th, 'pl-3 pr-7 text-right')}>
                    Valor total
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className="transition-colors duration-fast ease-standard hover:bg-surface-sunken">
                    <td className={cn(td, 'pl-7 pr-2 type-data text-3xs text-muted-foreground')}>{index + 1}</td>
                    <th scope="row" className={cn(td, 'font-medium')}>
                      <span className="break-words">{item.description}</span>
                    </th>
                    <td className={cn(td, 'whitespace-nowrap text-right tabular-nums')}>
                      {item.quantity === null ? <span className="text-muted-foreground">—</span> : formatNumber(item.quantity)}
                    </td>
                    <td className={cn(td, 'text-muted-foreground')}>{item.unit ?? '—'}</td>
                    <td className={cn(td, 'text-right')}>
                      <ValueDisplay value={item.estimatedUnitValue} precise className="font-medium" />
                    </td>
                    <td className={cn(td, 'pl-3 pr-7 text-right')}>
                      <ValueDisplay value={item.estimatedTotalValue} precise />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={5} className="py-3 pl-7 pr-3 text-right type-meta font-semibold">
                    Total estimado dos itens
                    {missingNote && <span className="block text-3xs font-normal text-muted-foreground">{missingNote}</span>}
                  </th>
                  <td className="py-3 pl-3 pr-7 text-right align-top">
                    <ValueDisplay value={total} precise className="type-ui" />
                  </td>
                </tr>
                {differenceNote && (
                  <tr>
                    <td colSpan={6} className="px-7 pb-1 text-right text-3xs text-muted-foreground">
                      {differenceNote}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

const docIcon = (doc: TenderDocument): LucideIcon => (/\.(xlsx?|csv|ods)$/i.test(doc.name) || /planilha/i.test(doc.type) ? FileSpreadsheet : FileText);

function DocumentsPanel({ documents }: { documents: TenderDocument[] }) {
  const count = `${documents.length} ${documents.length === 1 ? 'arquivo' : 'arquivos'}`;
  return (
    <Panel title="Documentos" aside={count}>
      {documents.length === 0 ? (
        <p className="rounded-lg bg-muted px-3 py-2 type-meta text-muted-foreground">Nenhum documento publicado pela fonte.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-border-subtle">
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
                  className="group flex w-full items-center gap-3 rounded-md px-2 py-3 text-left transition-colors duration-fast ease-standard hover:bg-surface-sunken"
                >
                  <Icon size={18} aria-hidden="true" className="shrink-0 text-foreground-subtle" />
                  <span className="min-w-0 flex-1">
                    <span title={doc.name} className="block truncate text-xs font-medium">
                      {doc.name}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-1.5 text-3xs text-muted-foreground">
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
                  <Download
                    size={14}
                    aria-hidden="true"
                    className="shrink-0 text-foreground-subtle transition-colors duration-fast ease-standard group-hover:text-primary"
                  />
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
        <p className="type-meta text-muted-foreground">Nenhum evento registrado.</p>
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
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 type-meta text-muted-foreground">
                    <span className="font-semibold text-foreground/80">{label}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={event.at} className="tabular-nums">
                      {formatDateTime(event.at)}
                    </time>
                    {upcoming && (
                      <span className="rounded-sm bg-primary-subtle px-1.5 py-0.5 text-3xs font-semibold text-primary-subtle-foreground">Previsto</span>
                    )}
                  </div>
                  <p className="mt-1 break-words type-body">{event.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
