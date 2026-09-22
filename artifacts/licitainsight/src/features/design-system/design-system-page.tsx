import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { StatusBadge } from '@/features/tenders/components/status-badge';

export default function DesignSystemPage() {
  return (
    <>
      <PageTitle eyebrow="referência viva" title="Design system" description="A linguagem visual do Licita Insight, em componentes reais." />
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="section-title">Cores & tipografia</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            <div className="h-16 w-28 rounded-lg bg-primary p-3 text-xs text-primary-foreground">Signal green</div>
            <div className="h-16 w-28 rounded-lg bg-sidebar p-3 text-xs text-white">Instrument navy</div>
            <div className="h-16 w-28 rounded-lg bg-accent p-3 text-xs text-accent-foreground">Attention amber</div>
            <div className="h-16 w-28 rounded-lg bg-secondary p-3 text-xs">Soft slate</div>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="label">Display / DM Sans</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight">Confiança na leitura</div>
            </div>
            <div>
              <div className="label">Dados / Space Mono</div>
              <div className="mt-2 font-mono text-lg">PE-042/2024 · 96%</div>
            </div>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="section-title">Controles</h2>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button data-testid="button-system-primary">Ação principal</Button>
            <Button variant="outline" data-testid="button-system-outline">
              Secundária
            </Button>
            <Button variant="dark" data-testid="button-system-dark">
              Instrument navy
            </Button>
            <Button variant="ghost" data-testid="button-system-ghost">
              Texto
            </Button>
            <StatusBadge status="open" />
            <StatusBadge status="under_review" />
            <StatusBadge status="suspended" />
          </div>
          <div className="mt-5 grid max-w-xl gap-3 sm:grid-cols-2">
            <input
              data-testid="input-system"
              placeholder="Campo de pesquisa"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <select data-testid="select-system" className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
              <option>Filtro de exemplo</option>
            </select>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="section-title">Estados</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-dashed border-border p-5 text-center">
              <CircleAlert size={17} className="mx-auto text-muted-foreground" />
              <div className="mt-3 text-xs font-semibold">Sem resultados</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Ajuste sua pesquisa</div>
            </div>
            <div className="rounded-lg border border-border p-5">
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-2 w-full animate-pulse rounded bg-muted" />
              <div className="mt-2 h-2 w-1/2 animate-pulse rounded bg-muted" />
            </div>
            <div className="rounded-lg border border-[#e9c4c0] bg-[#fff8f7] p-5">
              <CircleAlert size={17} className="text-destructive" />
              <div className="mt-3 text-xs font-semibold">Não foi possível carregar</div>
              <button data-testid="button-system-retry" className="mt-2 text-[11px] font-semibold text-destructive">
                Tentar novamente
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
