import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, FileCheck2 } from 'lucide-react';
import type { TransparencySupplier } from '@/api';
import { ErrorState } from '@/components/common/query-states';
import { formatCurrencyPrecise, formatDate } from '@/lib/format';
import { queryKeys } from '@/services/query-keys';
import { transparencyService } from '@/services/transparency-service';

const cnpj = (supplier: TransparencySupplier | null) => {
  const digits = supplier?.identifier?.replace(/\D/g, '') ?? '';
  return supplier?.type === 'CNPJ' && digits.length === 14
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : null;
};

export function TenderTransparency({ tenderId }: { tenderId: string }) {
  const contracts = useQuery({
    queryKey: queryKeys.transparency.tenderContracts(tenderId),
    queryFn: ({ signal }) => transparencyService.getTenderContracts(tenderId, signal),
    staleTime: 60_000,
  });
  const results = useQuery({
    queryKey: queryKeys.transparency.tenderResults(tenderId),
    queryFn: ({ signal }) => transparencyService.getTenderResults(tenderId, signal),
    staleTime: 60_000,
  });
  return (
    <section id="transparencia-edital" className="rounded-xl border border-border bg-card p-5 sm:p-7" aria-labelledby="transparency-title">
      <div className="flex items-center gap-2"><FileCheck2 size={18} aria-hidden className="text-primary" /><h2 id="transparency-title" className="type-section">Transparência</h2></div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Resultados homologados pertencem a itens da contratação. Contratos são publicações posteriores e seus valores não comprovam pagamento.</p>
      {(contracts.isPending || results.isPending) && <p role="status" className="mt-5 type-meta text-muted-foreground">Consultando publicações oficiais...</p>}
      {(contracts.isError || results.isError) && <div className="mt-5"><ErrorState error={contracts.error ?? results.error} onRetry={() => { void contracts.refetch(); void results.refetch(); }} /></div>}
      {contracts.data && results.data && (
        <div className="mt-5 space-y-6">
          <div>
            <h3 className="type-ui font-semibold">Resultados por item <span className="ml-1 type-data text-xs text-muted-foreground">{results.data.data.length}</span></h3>
            {results.data.data.length === 0 ? <p className="mt-2 type-meta text-muted-foreground">Nenhum resultado de item consta na cobertura coletada. Consulte também o edital no PNCP.</p> : (
              <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
                {results.data.data.map((result) => (
                  <li key={result.id} className="py-4">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div className="min-w-0">
                        <p className="type-label text-muted-foreground">Item {result.itemNumber} · resultado {result.resultSequence}</p>
                        <p className="mt-1 break-words text-sm font-semibold">{result.supplier?.name || 'Fornecedor não informado'}</p>
                        {cnpj(result.supplier) && <p className="mt-1 type-data text-xs text-muted-foreground">CNPJ {cnpj(result.supplier)}</p>}
                      </div>
                      <div className="sm:text-right">
                        <p className="type-label text-muted-foreground">{result.status.active ? result.values.totalValueHomologated !== null ? 'Valor homologado do item' : 'Valor unitário homologado' : 'Resultado cancelado'}</p>
                        <p className="mt-1 type-data text-sm font-semibold">{result.status.active ? formatCurrencyPrecise(result.values.totalValueHomologated ?? result.values.unitValueHomologated, 'Não publicado') : 'Sem vencedor ativo'}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 type-meta text-muted-foreground">
                      <span>{result.status.name || 'Situação não informada'}</span>
                      {result.resultDate && <span>{formatDate(result.resultDate)}</span>}
                      {result.status.cancelReason && <span>{result.status.cancelReason}</span>}
                      {result.officialUrl && <a href={result.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">Resultado no PNCP <ArrowUpRight size={13} aria-hidden /></a>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="type-ui font-semibold">Contratos e empenhos publicados <span className="ml-1 type-data text-xs text-muted-foreground">{contracts.data.data.length}</span></h3>
            {contracts.data.data.length === 0 ? <p className="mt-2 type-meta text-muted-foreground">Nenhum contrato vinculado consta na cobertura coletada.</p> : (
              <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
                {contracts.data.data.map((contract) => (
                  <li key={contract.id} className="flex flex-wrap justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="type-label text-muted-foreground">{contract.contractNumber || contract.pncpControlNumber}</p>
                      <p className="mt-1 break-words text-sm font-semibold">{contract.supplier?.name || 'Fornecedor não informado'}</p>
                      {cnpj(contract.supplier) && <p className="mt-1 type-data text-xs text-muted-foreground">CNPJ {cnpj(contract.supplier)}</p>}
                      {contract.officialUrl && <a href={contract.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 type-meta font-semibold text-primary hover:underline">Contrato no PNCP <ArrowUpRight size={13} aria-hidden /></a>}
                    </div>
                    <div className="sm:text-right">
                      <p className="type-label text-muted-foreground">Valor {contract.values.global !== null ? 'global' : 'inicial'} do contrato</p>
                      <p className="mt-1 type-data text-sm font-semibold">{formatCurrencyPrecise(contract.values.global ?? contract.values.initial, 'Não publicado')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="border-t border-border-subtle pt-4 type-meta text-muted-foreground">{results.data.meta.coverage}</p>
        </div>
      )}
    </section>
  );
}
