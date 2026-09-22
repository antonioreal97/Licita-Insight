import { Link } from 'wouter';
import { ArrowRight, RefreshCw, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState, RowsSkeleton } from '@/components/common/query-states';
import { useTenderSearch } from '@/features/search/hooks/use-tender-search';
import { useSavedTenders } from '@/features/saved-tenders/hooks/use-saved-tenders';
import { TenderRow } from '@/features/tenders/components/tender-row';

// TODO(dashboard): metrics and activity are static placeholders until an analytics endpoint exists.
function MiniMetric({ label, value, detail, tone = 'green' }: { label: string; value: string; detail: string; tone?: 'green' | 'amber' | 'blue' }) {
  const toneClass = tone === 'green' ? 'text-primary' : tone === 'amber' ? 'text-[#b2730a]' : 'text-[#3378ad]';
  return (
    <div className="border-l-2 border-primary/30 pl-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-[25px] font-semibold tracking-[-0.04em]">{value}</div>
      <div className={`mt-1 text-xs font-medium ${toneClass}`}>{detail}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { isSaved, toggle } = useSavedTenders();
  const priority = useTenderSearch({ pageSize: 4, sort: 'deadline_asc', status: ['open'], facets: false });
  return (
    <>
      <PageTitle
        eyebrow="terça-feira, 22 out 2024"
        title="Bom dia, Marina."
        description="Uma leitura rápida do que mudou no seu radar de compras públicas."
        action={
          <Link href="/search" data-testid="link-dashboard-search">
            <Button>
              <Search size={15} />
              Explorar editais
            </Button>
          </Link>
        }
      />
      <div className="mb-8 grid gap-6 border-y border-border bg-card px-5 py-6 sm:grid-cols-3 sm:px-7">
        <MiniMetric label="Editais no radar" value="1.248" detail="+12,4% nesta semana" />
        <MiniMetric label="Oportunidades novas" value="47" detail="8 acima de R$ 1 mi" tone="amber" />
        <MiniMetric label="Aberturas próximas" value="12" detail="nos próximos 7 dias" tone="blue" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Prioridade para você</h2>
              <p className="mt-1 text-xs text-muted-foreground">Editais com maior aderência ao seu perfil</p>
            </div>
            <Link href="/search" data-testid="link-dashboard-all" className="text-xs font-semibold text-primary hover:underline">
              Ver todos <ArrowRight size={13} className="ml-1 inline" />
            </Link>
          </div>
          {priority.isPending ? (
            <RowsSkeleton rows={4} />
          ) : priority.isError ? (
            <ErrorState error={priority.error} onRetry={() => priority.refetch()} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {priority.data.data.map((tender) => (
                <TenderRow key={tender.id} tender={tender} saved={isSaved(tender.id)} onSave={() => toggle(tender.id)} />
              ))}
            </div>
          )}
        </section>
        <aside className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Atividade recente</h2>
              <button data-testid="button-refresh-activity" aria-label="Atualizar atividade" className="text-muted-foreground hover:text-primary">
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="space-y-4">
              {[
                ['09:42', 'Novo documento', 'PE 042/2024 · Curitiba'],
                ['ontem', 'Prazo alterado', 'Concorrência 018/2024'],
                ['18 out', 'Edital salvo', 'PE 301/2024 · TJBA'],
              ].map(([time, title, detail]) => (
                <div key={title} className="flex gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium">{title}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{detail}</div>
                    <div className="mt-1 font-mono text-[9px] text-muted-foreground">{time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-5">
            <div className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Sparkles size={16} />
            </div>
            <h3 className="text-sm font-semibold">Seu radar está aprendendo</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Salve editais relevantes para calibrar as próximas recomendações.</p>
            <Link href="/settings" data-testid="link-dashboard-preferences" className="mt-4 inline-block text-xs font-semibold text-primary">
              Revisar preferências <ArrowRight size={13} className="ml-1 inline" />
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
