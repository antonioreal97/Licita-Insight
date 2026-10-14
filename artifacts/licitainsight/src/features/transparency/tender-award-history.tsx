import * as React from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowRight, ArrowUpRight, History, Lock } from 'lucide-react';
import type { AwardHistory, AwardHistoryMeta, AwardHistoryWinner } from '@/api';
import { Button, buttonClass } from '@/components/common/action-button';
import { ErrorState } from '@/components/common/query-states';
import { signInWithGoogle, useSession } from '@/features/auth/hooks/use-session';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { queryKeys } from '@/services/query-keys';
import { transparencyService } from '@/services/transparency-service';

const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const formatPercent = (value: number) => `${percent.format(value)}%`;

const formatCnpj = (digits: string | null) =>
  digits && /^\d{14}$/.test(digits) ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : null;

const GROUP_LABEL: Record<Exclude<AwardHistoryWinner['kind'], 'company'>, string> = {
  individual: 'Pessoa física',
  foreign: 'Fornecedor estrangeiro',
  unidentified: 'Fornecedor não identificado',
};

export const winnerLabel = (winner: AwardHistoryWinner) =>
  winner.kind === 'company' ? winner.name ?? 'Empresa' : GROUP_LABEL[winner.kind];

const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`;

function Stat({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div className="min-w-0 rounded-lg border border-border-subtle bg-surface-sunken p-3 sm:p-4">
      <dt className="type-label text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words type-data text-lg font-semibold text-foreground">{value}</dd>
      {detail && <dd className="mt-1 type-meta text-muted-foreground">{detail}</dd>}
    </div>
  );
}

function HowWeCompare({ history, meta }: { history: AwardHistory; meta: AwardHistoryMeta }) {
  return (
    <details className="group border-t border-border-subtle pt-4">
      <summary className="cursor-pointer type-ui font-semibold text-primary hover:underline">Como comparamos</summary>
      <div className="mt-3 space-y-3 type-meta text-muted-foreground">
        <p>{history.criteria.rule}</p>
        {history.criteria.keywords.length > 0 && (
          <div>
            <p>Palavras-chave deste edital:</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Palavras-chave usadas na comparação">
              {history.criteria.keywords.map((keyword) => (
                <li key={keyword} className="rounded-pill border border-border-subtle bg-muted px-2 py-0.5 type-data text-xs text-foreground">{keyword}</li>
              ))}
            </ul>
          </div>
        )}
        {history.criteria.categories.length > 0 && <p>Categoria: {history.criteria.categories.map(({ label }) => label).join(', ')}.</p>}
        <p>Fornecedores pessoa física aparecem só como “Pessoa física”, sem nome nem CPF.</p>
        <p>{meta.valueSemantics}</p>
        <p>{meta.coverage}</p>
      </div>
    </details>
  );
}

/** Pure view, so it renders the same in the page and in tests. `lockedAction` is the sign-in or subscribe step. */
export function AwardHistoryView({ history, meta, lockedAction }: { history: AwardHistory; meta: AwardHistoryMeta; lockedAction?: ReactNode }) {
  const where = history.scope === 'unit' && history.purchasingUnit ? history.purchasingUnit : history.organizationName;
  const { purchases, winners, prices } = history;
  const locked = !meta.access.unlocked;

  if (purchases.total === 0) {
    return (
      <div className="mt-4 space-y-4">
        <p className="type-body text-foreground/90">
          Não encontramos compras parecidas de <span className="font-semibold">{history.organizationName}</span> nos últimos {history.windowMonths} meses.
        </p>
        <p className="type-meta text-muted-foreground">Isso não quer dizer que nunca houve: o histórico usa os contratos do PNCP que já coletamos.</p>
        <HowWeCompare history={history} meta={meta} />
      </div>
    );
  }

  const topWins = winners.top[0]?.wins ?? 1;
  return (
    <div className="mt-4 space-y-6">
      <p className="type-body text-foreground/90">
        Nos últimos {history.windowMonths} meses, <span className="font-semibold">{where}</span> fez{' '}
        {plural(purchases.total, 'compra parecida', 'compras parecidas')} com esta.
      </p>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Compras parecidas" value={formatNumber(purchases.total)} detail={`${formatNumber(purchases.last12Months)} nos últimos 12 meses`} />
        <Stat label="Fornecedores que venceram" value={formatNumber(winners.distinct)} detail={plural(purchases.withResults, 'compra com resultado publicado', 'compras com resultado publicado')} />
        <Stat
          label="Preço praticado"
          value={prices.purchaseValue ? formatCurrency(prices.purchaseValue.median) : 'Não publicado'}
          detail={prices.purchaseValue && prices.purchaseValue.count > 1
            ? `por compra, de ${formatCurrency(prices.purchaseValue.min)} a ${formatCurrency(prices.purchaseValue.max)}`
            : prices.purchaseValue ? 'por compra' : null}
        />
        <Stat
          label="Desconto típico"
          value={prices.discountPercent ? formatPercent(prices.discountPercent.median) : 'Não informado'}
          detail={prices.discountPercent && prices.discountPercent.count >= 3
            ? `metade dos itens entre ${formatPercent(prices.discountPercent.p25)} e ${formatPercent(prices.discountPercent.p75)}`
            : prices.discountPercent ? plural(prices.discountPercent.count, 'item com desconto informado', 'itens com desconto informado') : null}
        />
      </dl>

      {winners.top.length > 0 && (
        <div>
          <h3 className="type-ui font-semibold">Quem costuma vencer</h3>
          <ol className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
            {winners.top.map((winner, index) => {
              const cnpj = formatCnpj(winner.cnpj);
              const hidden = locked && winner.kind === 'company';
              return (
                <li key={`${winner.kind}-${winner.cnpj ?? winner.name ?? index}`} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="min-w-0 break-words text-sm font-semibold">
                      <span className="mr-2 type-data text-xs text-muted-foreground">{index + 1}.</span>
                      {hidden ? <span className="italic text-muted-foreground">Nome disponível com acesso ativo</span> : winnerLabel(winner)}
                    </p>
                    <p className="type-meta text-muted-foreground">venceu {winner.wins} de {formatNumber(purchases.total)}</p>
                  </div>
                  {cnpj && <p className="mt-0.5 type-data text-xs text-muted-foreground">CNPJ {cnpj}</p>}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-muted" aria-hidden>
                    <div className="h-full rounded-pill bg-primary" style={{ width: `${Math.max(8, Math.round((winner.wins / topWins) * 100))}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>
          {locked && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-primary-subtle p-3 text-primary-subtle-foreground">
              <Lock size={16} aria-hidden />
              <p className="min-w-0 flex-1 type-meta">Os números são públicos. Os nomes das empresas vencedoras aparecem para quem tem acesso ativo.</p>
              {lockedAction}
            </div>
          )}
        </div>
      )}

      {history.recent.length > 0 && (
        <div>
          <h3 className="type-ui font-semibold">Compras recentes</h3>
          <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
            {history.recent.map((purchase) => {
              const names = locked ? [] : purchase.winners.map(winnerLabel);
              return (
                <li key={purchase.purchasePncpControlNumber} className="flex flex-wrap justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="type-label text-muted-foreground">{formatDate(purchase.date, 'Data não informada')}</p>
                    <p className="mt-1 line-clamp-2 break-words text-sm">{purchase.object ?? 'Objeto não informado'}</p>
                    {names.length > 0 && <p className="mt-1 break-words type-meta text-muted-foreground">Venceu: {names.join(', ')}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 type-meta">
                      {purchase.tenderId && (
                        <Link href={`/tenders/${encodeURIComponent(purchase.tenderId)}`} className="font-semibold text-primary hover:underline">Ver no Pardal</Link>
                      )}
                      {purchase.officialUrl && (
                        <a href={purchase.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                          Resultado no PNCP <ArrowUpRight size={13} aria-hidden /><span className="sr-only">(abre em nova aba)</span>
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <p className="type-label text-muted-foreground">{purchase.valueSource === 'contracts' ? 'Valor contratado' : 'Valor homologado'}</p>
                    <p className="mt-1 type-data text-sm font-semibold">{formatCurrency(purchase.value, 'Não publicado')}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <HowWeCompare history={history} meta={meta} />
    </div>
  );
}

function LockedAction() {
  const session = useSession();
  if (session.status === 'anonymous') {
    return <Button size="sm" onClick={() => signInWithGoogle()}>Entrar com Google</Button>;
  }
  return (
    <Link href="/settings?billing=required#assinatura" className={buttonClass('primary', 'sm')}>
      Ver assinatura <ArrowRight size={15} aria-hidden />
    </Link>
  );
}

/** Loads after the detail page and on its own: a slow or failed history never holds the page. */
export function TenderAwardHistory({ tenderId }: { tenderId: string }) {
  const session = useSession();
  const viewer = session.user?.id ?? 'anonymous';
  const history = useQuery({
    queryKey: queryKeys.transparency.tenderAwardHistory(tenderId, viewer),
    queryFn: ({ signal }) => transparencyService.getTenderAwardHistory(tenderId, signal),
    enabled: session.status !== 'loading' || Boolean(session.error),
    staleTime: 5 * 60_000,
  });
  return (
    <section id="historico-compras" className="rounded-xl border border-border bg-card p-5 sm:p-7" aria-labelledby="award-history-title" aria-busy={history.isPending}>
      <div className="flex items-center gap-2">
        <History size={18} aria-hidden className="text-primary" />
        <h2 id="award-history-title" className="type-section">Histórico de compras parecidas</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Quem já vendeu algo parecido para este órgão, e por quanto. Ajuda a decidir se vale disputar e a calibrar o preço.</p>
      {history.isPending && (
        <div role="status" className="mt-4 space-y-3">
          <span className="sr-only">Buscando o histórico deste órgão…</span>
          <div aria-hidden className="h-4 w-3/4 animate-pulse rounded-lg bg-muted" />
          <div aria-hidden className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-muted" />)}
          </div>
        </div>
      )}
      {history.isError && <div className="mt-4"><ErrorState error={history.error} onRetry={() => void history.refetch()} /></div>}
      {history.data && <AwardHistoryView history={history.data.data} meta={history.data.meta} lockedAction={<LockedAction />} />}
    </section>
  );
}
