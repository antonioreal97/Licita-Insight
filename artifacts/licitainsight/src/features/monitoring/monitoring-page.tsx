import { Bell, CalendarDays, FileText, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';

// TODO(monitoring): static placeholders until the monitoring/alerts API exists.
export default function MonitoringPage() {
  return (
    <>
      <PageTitle
        eyebrow="sinais importantes"
        title="Monitoramento"
        description="Acompanhe mudanças nos editais que importam para o seu negócio."
        action={
          <Button variant="outline" data-testid="button-monitoring-settings">
            <Bell size={14} />
            Preferências de alerta
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="label">Editais monitorados</div>
          <div className="mt-2 text-2xl font-semibold tracking-heading tabular-nums">12</div>
          <div className="mt-1 text-xs text-muted-foreground">3 com atividade</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="label">Mudanças nesta semana</div>
          <div className="mt-2 text-2xl font-semibold tracking-heading tabular-nums text-primary">7</div>
          <div className="mt-1 text-xs text-muted-foreground">+2 que na semana anterior</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="label">Próximo prazo</div>
          <div className="mt-2 text-2xl font-semibold tracking-heading tabular-nums">04 nov</div>
          <div className="mt-1 text-xs font-medium text-status-under-review-foreground">PE 042/2024</div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="type-section text-foreground">Atividade recente</h2>
        </div>
        {[
          [
            'Hoje, 09:42',
            'Novo documento publicado',
            'PE 042/2024 · Prefeitura Municipal de Curitiba',
            'Documento adicionado: Termo de Referência revisado',
            'document',
          ],
          ['Ontem, 16:18', 'Prazo de abertura confirmado', 'Concorrência 018/2024 · Governo de Pernambuco', 'Sessão mantida para 31 out 2024', 'calendar'],
          ['18 out, 11:05', 'Valor estimado atualizado', 'PE 301/2024 · Tribunal de Justiça da Bahia', 'Alteração de R$ 2.102.000 para R$ 2.189.000', 'value'],
        ].map(([time, title, tender, detail, icon]) => (
          <div key={title} className="flex gap-4 border-b border-border-subtle px-5 py-5 last:border-0">
            <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
              {icon === 'calendar' ? <CalendarDays size={15} /> : icon === 'value' ? <TrendingUp size={15} /> : <FileText size={15} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col justify-between gap-1 sm:flex-row">
                <div className="text-sm font-semibold">{title}</div>
                <span className="type-data text-3xs text-muted-foreground">{time}</span>
              </div>
              <div className="mt-1 text-xs text-primary">{tender}</div>
              <div className="mt-2 text-xs text-muted-foreground">{detail}</div>
            </div>
            <button
              aria-label="Arquivar atividade"
              data-testid={`button-archive-${title}`}
              className="self-start rounded-md p-1 text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
