import { useState } from 'react';
import { Bell, MoreHorizontal, Plus, Search } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';

// TODO(saved-searches): static placeholders until the saved-searches API exists (future CODEX_HANDOFF).
export default function SavedSearchesPage() {
  return (
    <>
      <PageTitle
        eyebrow="seus alertas"
        title="Buscas salvas"
        description="Consultas que você escolheu acompanhar. A frequência define quando avisaremos sobre novidades."
        action={
          <Button data-testid="button-new-saved-search">
            <Plus size={15} />
            Nova busca
          </Button>
        }
      />
      <div className="mb-5 rounded-xl border border-primary/20 bg-primary-subtle/50 p-4 type-body text-muted-foreground">
        <Bell size={16} className="mr-2 inline text-primary" />
        Notificações estão prontas para configuração. Conecte seu e-mail em Configurações para receber alertas.
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <SavedSearch
          name="Tecnologia em Curitiba"
          query="software OR equipamentos"
          filters="PR · Aberto · R$ 500 mil+"
          frequency="Diário"
          count="18 resultados novos"
        />
        <SavedSearch
          name="Obras e infraestrutura"
          query="pavimentação drenagem"
          filters="SC, RS · Todos os status"
          frequency="Semanal"
          count="42 resultados novos"
        />
        <SavedSearch
          name="Saúde pública — Nordeste"
          query="hospital manutenção"
          filters="BA, PE, CE · Últimos 30 dias"
          frequency="Desativado"
          count="sem novidades"
        />
      </div>
    </>
  );
}
function SavedSearch({ name, query, filters, frequency, count }: { name: string; query: string; filters: string; frequency: string; count: string }) {
  const [active, setActive] = useState(frequency !== 'Desativado');
  return (
    <div className="flex flex-col gap-4 border-b border-border-subtle p-5 last:border-0 sm:flex-row sm:items-center">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
        <Search size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-foreground">{name}</div>
        <div className="mt-1 type-data type-meta text-muted-foreground">{query}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-3xs text-muted-foreground">
          <span className="rounded bg-muted px-2 py-1">{filters}</span>
          <span className={`rounded px-2 py-1 ${active ? 'bg-primary-subtle font-semibold text-primary-subtle-foreground' : 'bg-muted'}`}>{count}</span>
        </div>
      </div>
      <div className="flex items-center gap-4 sm:ml-auto">
        <select
          aria-label={`Frequência de ${name}`}
          data-testid={`select-frequency-${name}`}
          value={active ? frequency : 'Desativado'}
          onChange={(e) => {
            setActive(e.target.value !== 'Desativado');
          }}
          className="h-9 rounded-lg border border-input bg-background px-2 text-xs text-foreground transition-colors duration-fast hover:border-border-strong"
        >
          <option>Diário</option>
          <option>Semanal</option>
          <option>Desativado</option>
        </select>
        <button
          aria-label={`Mais ações para ${name}`}
          data-testid={`button-more-${name}`}
          className="rounded-md p-1 text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground"
        >
          <MoreHorizontal size={17} />
        </button>
      </div>
    </div>
  );
}
