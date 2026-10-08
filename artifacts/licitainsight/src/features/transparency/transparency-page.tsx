import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import { ArrowUpRight, FileCheck2, Search } from 'lucide-react';
import type { TransparencyContract, TransparencyContractSearchParams } from '@/api';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchPagination } from '@/features/search/components/search-pagination';
import { formatCurrencyPrecise, formatDate, formatDateTime } from '@/lib/format';
import { queryKeys } from '@/services/query-keys';
import { transparencyParamsFromUrl, transparencyParamsToUrl, transparencyService } from '@/services/transparency-service';

const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');

const cnpj = (contract: TransparencyContract) => {
  const identifier = contract.supplier?.identifier?.replace(/\D/g, '') ?? '';
  return contract.supplier?.type === 'CNPJ' && identifier.length === 14
    ? identifier.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : null;
};

function ContractRow({ contract }: { contract: TransparencyContract }) {
  const value = contract.values.global ?? contract.values.initial;
  const place = [contract.location.city, contract.location.state].filter(Boolean).join(' / ');
  return (
    <li className="border-b border-border-subtle px-4 py-5 last:border-0 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-x-3 gap-y-1 type-meta text-muted-foreground">
            <span className="font-semibold text-foreground">Contrato publicado</span>
            <span>{formatDate(contract.dates.publishedAt, 'Data não informada')}</span>
            {place && <span>{place}</span>}
          </div>
          <h2 className="mt-2 break-words type-ui font-semibold text-foreground">{contract.object || contract.contractNumber || contract.pncpControlNumber}</h2>
          <p className="mt-2 break-words text-sm text-muted-foreground">{contract.organizationName || 'Órgão não informado'}</p>
        </div>
        <div className="min-w-[8rem] sm:text-right">
          <p className="type-label text-muted-foreground">{contract.values.global !== null ? 'Valor global do contrato' : 'Valor inicial do contrato'}</p>
          <p className="mt-1 type-data text-base font-semibold text-foreground">{formatCurrencyPrecise(value, 'Não publicado')}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-border-subtle pt-4">
        <div className="min-w-0 text-sm">
          <p className="type-label text-muted-foreground">Fornecedor do contrato</p>
          <p className="mt-1 break-words font-medium">{contract.supplier?.name || 'Não informado pela fonte'}</p>
          {cnpj(contract) && <p className="mt-0.5 type-data text-xs text-muted-foreground">CNPJ {cnpj(contract)}</p>}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold">
          {contract.tenderId && <Link href={`/tenders/${encodeURIComponent(contract.tenderId)}`} className="text-primary hover:underline">Ver edital de origem</Link>}
          {contract.officialUrl && <a href={contract.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Fonte oficial <ArrowUpRight size={14} aria-hidden /></a>}
        </div>
      </div>
    </li>
  );
}

export default function TransparencyPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => transparencyParamsFromUrl(search), [search]);
  const [draft, setDraft] = useState(params.q ?? '');
  useEffect(() => setDraft(params.q ?? ''), [params.q]);
  useEffect(() => {
    const canonical = transparencyParamsToUrl(params);
    if (canonical !== (search ? `?${search}` : '')) navigate(`/transparencia${canonical}`, { replace: true });
  }, [navigate, params, search]);
  const update = (patch: Partial<TransparencyContractSearchParams>) =>
    navigate(`/transparencia${transparencyParamsToUrl({ ...params, ...patch, page: patch.page ?? undefined })}`);
  const contracts = useQuery({
    queryKey: queryKeys.transparency.contracts(params),
    queryFn: ({ signal }) => transparencyService.searchContracts(params, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: (query) => query.state.data && !query.state.data.meta.indexUpdatedAt ? 30_000 : false,
  });
  const awaitingFirstCollection = contracts.data?.pagination.total === 0 && !contracts.data.meta.indexUpdatedAt;
  const onSearch = (event: FormEvent) => { event.preventDefault(); update({ q: draft.trim() || undefined }); };

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-6">
        <div className="flex items-center gap-2 type-eyebrow text-primary"><FileCheck2 size={15} aria-hidden /> Transparência</div>
        <h1 className="mt-3 type-titulo-3 text-foreground">Contratos e resultados publicados</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Consulte contratos divulgados pelo PNCP e siga o vínculo com o edital de origem. O fornecedor do contrato pode ser diferente do vencedor de cada item.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section aria-label="Contratos publicados" className="min-w-0 @container/results">
          <form onSubmit={onSearch} role="search" className="flex gap-2">
            <label htmlFor="transparency-query" className="sr-only">Buscar contratos</label>
            <Input id="transparency-query" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={160} placeholder="Fornecedor, órgão, objeto ou número" />
            <button type="submit" aria-label="Buscar contratos" className="grid size-9 shrink-0 place-items-center rounded-pill bg-action text-action-foreground hover:bg-action-hover"><Search size={17} aria-hidden /></button>
          </form>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="type-meta text-muted-foreground">{contracts.data ? `${contracts.data.pagination.total.toLocaleString('pt-BR')} contratos encontrados` : 'Consultando contratos'}</p>
            <div className="w-48">
              <label htmlFor="transparency-sort" className="sr-only">Ordenar contratos</label>
              <Select value={params.sort ?? 'published_desc'} onValueChange={(value) => update({ sort: value as TransparencyContractSearchParams['sort'] })}>
                <SelectTrigger id="transparency-sort"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="published_desc">Mais recentes</SelectItem>
                  <SelectItem value="published_asc">Mais antigos</SelectItem>
                  <SelectItem value="value_desc">Maior valor</SelectItem>
                  <SelectItem value="value_asc">Menor valor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {contracts.isPending ? <div className="mt-4"><RowsSkeleton /></div> : contracts.isError ? <div className="mt-4"><ErrorState error={contracts.error} onRetry={() => void contracts.refetch()} /></div> : (
            <>
              {contracts.data.data.length > 0 ? (
                <ul className="mt-4 overflow-hidden rounded-md border border-border bg-card">{contracts.data.data.map((contract) => <ContractRow key={contract.id} contract={contract} />)}</ul>
              ) : (
                <div className="mt-4 border-y border-border py-12 text-center">
                  <p className="font-semibold">{awaitingFirstCollection ? 'Primeira coleta ainda não concluída' : 'Nenhum contrato na cobertura consultada'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{awaitingFirstCollection ? 'Os contratos aparecerão aqui assim que a base receber os primeiros registros.' : 'A fonte pode não ter publicado dados para esses filtros, ou o período ainda não ter sido coletado.'}</p>
                  {!awaitingFirstCollection && <button type="button" onClick={() => { setDraft(''); navigate('/transparencia'); }} className="mt-4 text-sm font-semibold text-primary hover:underline">Limpar filtros</button>}
                </div>
              )}
              <SearchPagination pagination={contracts.data.pagination} page={params.page ?? 1} onPageChange={(page) => update({ page })} noun={['contrato', 'contratos']} />
            </>
          )}
        </section>

        <aside aria-label="Filtros e cobertura" className="space-y-5">
          <div className="border-t border-border pt-4">
            <h2 className="type-ui font-semibold">Filtros</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="transparency-state" className="type-label text-muted-foreground">UF</label>
                <Select value={params.state ?? 'all'} onValueChange={(value) => update({ state: value === 'all' ? undefined : value })}>
                  <SelectTrigger id="transparency-state" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Todos os estados</SelectItem>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label htmlFor="transparency-from" className="type-label text-muted-foreground">Publicado de</label><Input id="transparency-from" type="date" className="mt-1" value={params.publishedFrom ?? ''} onChange={(event) => update({ publishedFrom: event.target.value || undefined })} /></div>
                <div><label htmlFor="transparency-to" className="type-label text-muted-foreground">Até</label><Input id="transparency-to" type="date" className="mt-1" value={params.publishedTo ?? ''} onChange={(event) => update({ publishedTo: event.target.value || undefined })} /></div>
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
            <h2 className="type-ui font-semibold text-foreground">Sobre os dados</h2>
            <p className="mt-2">{contracts.data?.meta.coverage ?? 'A cobertura depende das janelas de coleta do PNCP.'}</p>
            {contracts.data?.meta.indexUpdatedAt && <p className="mt-2">Última coleta concluída: {formatDateTime(contracts.data.meta.indexUpdatedAt)}</p>}
            <p className="mt-2">Valores de contrato não indicam pagamento. Resultados homologados por item aparecem no edital de origem quando publicados.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
