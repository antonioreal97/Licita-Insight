import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { Bookmark, BookmarkCheck, ChevronRight, Download, ExternalLink, FileText, Target } from 'lucide-react';
import { isApiError } from '@/api';
import { Button } from '@/components/common/action-button';
import { ErrorState } from '@/components/common/query-states';
import { useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { formatBytes, formatCurrency, formatCurrencyPrecise, formatDate, formatNumber } from '@/lib/format';
import { StatusBadge } from './components/status-badge';
import { useTender } from './hooks/use-tender';

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando licitação" className="space-y-6">
      <div className="h-3 w-40 animate-pulse rounded bg-muted" />
      <div className="h-9 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

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
  const place = [tender.location.city, tender.location.state].filter(Boolean).join(' · ');

  return (
    <>
      <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/search" className="hover:text-primary">
          Explorar editais
        </Link>
        <ChevronRight size={13} />
        <span className="truncate">{tender.tenderNumber ?? tender.id}</span>
      </div>

      <div className="mb-7 flex flex-col justify-between gap-5 border-b border-border pb-7 lg:flex-row">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={tender.status} />
            <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[10px] text-secondary-foreground">DEMO · não oficial</span>
          </div>
          <h1 className="text-[27px] font-semibold leading-tight tracking-[-0.04em] sm:text-[36px]">{tender.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{[tender.organization.name, tender.purchasingUnit].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <Button variant={saved ? 'primary' : 'outline'} aria-pressed={saved} data-testid="button-detail-save" onClick={() => toggle(tender.id)}>
            {saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
            {saved ? 'Salvo' : 'Salvar edital'}
          </Button>
          <Button
            variant={monitoring ? 'primary' : 'outline'}
            aria-pressed={monitoring}
            data-testid="button-detail-monitor"
            onClick={() => setMonitoring(!monitoring)}
          >
            <Target size={15} />
            {monitoring ? 'Monitorando' : 'Monitorar'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_310px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-base font-semibold">Resumo executivo</h2>
            </div>
            <p className="text-sm leading-7 text-muted-foreground">{tender.objectSummary ?? 'Resumo não disponível na fonte.'}</p>
            <div className="mt-6 grid grid-cols-2 gap-y-5 sm:grid-cols-4">
              <div>
                <div className="label">Valor estimado</div>
                <div className="value">{formatCurrency(tender.estimatedValue, 'Sigiloso')}</div>
              </div>
              <div>
                <div className="label">Publicação</div>
                <div className="value">{formatDate(tender.publishedAt)}</div>
              </div>
              <div>
                <div className="label">Abertura</div>
                <div className="value text-primary">{formatDate(tender.openingAt)}</div>
              </div>
              <div>
                <div className="label">Modalidade</div>
                <div className="value">{tender.modalityLabel}</div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 sm:p-7">
            <h2 className="mb-5 text-base font-semibold">Objeto completo</h2>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <div className="label">Número do processo</div>
                <div className="mt-1 font-mono text-xs">{tender.processNumber ?? '—'}</div>
              </div>
              <div>
                <div className="label">Unidade compradora</div>
                <div className="mt-1">{tender.purchasingUnit ?? '—'}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="label">Descrição</div>
                <p className="mt-1 leading-6 text-muted-foreground">{tender.description ?? '—'}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 sm:p-7">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-semibold">Itens da contratação</h2>
              <span className="text-xs text-muted-foreground">{tender.items.length} itens</span>
            </div>
            {tender.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">A fonte não detalhou itens para esta licitação.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="border-y border-border font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-3">Descrição</th>
                      <th>Quantidade</th>
                      <th>Unidade</th>
                      <th className="text-right">Estimativa unitária</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tender.items.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="py-3 font-medium">{item.description}</td>
                        <td className="text-muted-foreground">{item.quantity === null ? '—' : formatNumber(item.quantity)}</td>
                        <td className="text-muted-foreground">{item.unit ?? '—'}</td>
                        <td className="text-right font-mono">{formatCurrencyPrecise(item.estimatedUnitValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 sm:p-7">
            <h2 className="mb-6 text-base font-semibold">Cronologia</h2>
            <ol className="ml-2 border-l border-border pl-6">
              {tender.timeline.map((event, index) => (
                <li key={`${event.type}-${event.at}-${index}`} className="relative pb-6 last:pb-0">
                  <div
                    className={`absolute -left-[31px] top-0 h-2.5 w-2.5 rounded-full border-2 border-card ${index === tender.timeline.length - 1 ? 'bg-primary' : 'bg-muted-foreground'}`}
                  />
                  <div className="font-mono text-[10px] text-muted-foreground">{formatDate(event.at)}</div>
                  <div className="mt-1 text-sm font-semibold">{event.description}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Organização contratante</h2>
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-lg bg-secondary font-mono text-sm font-bold text-primary">
              {tender.location.state ?? '—'}
            </div>
            <div className="text-sm font-semibold">{tender.organization.name}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              {tender.purchasingUnit}
              {tender.purchasingUnit && place && <br />}
              {place}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Documentos</h2>
              <span className="text-xs text-muted-foreground">{tender.documents.length}</span>
            </div>
            {tender.documents.map((doc) => (
              <a
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                data-testid={`button-download-${doc.id}`}
                className="mb-2 flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted"
              >
                <FileText size={17} className="shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{doc.name}</span>
                  <span className="text-[10px] text-muted-foreground">{[doc.type, formatBytes(doc.sizeBytes)].filter(Boolean).join(' · ')}</span>
                </span>
                <Download size={14} className="text-muted-foreground" />
              </a>
            ))}
            {tender.source.url && (
              <Button
                variant="outline"
                data-testid="button-open-source"
                onClick={() => window.open(tender.source.url!, '_blank', 'noopener')}
                className="mt-2 w-full"
              >
                Abrir fonte original <ExternalLink size={14} />
              </Button>
            )}
            <div className="mt-3 text-center text-[10px] text-muted-foreground">Fonte: {tender.source.name}</div>
          </div>
        </aside>
      </div>
    </>
  );
}
