import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  return (
    <>
      <PageTitle eyebrow="workspace" title="Configurações" description="Ajuste como o Licita Insight trabalha para você." />
      <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
        <nav className="flex gap-2 overflow-x-auto xl:block xl:space-y-1">
          {['Perfil e conta', 'Preferências de busca', 'Notificações', 'Aparência'].map((item, index) => (
            <button
              key={item}
              data-testid={`button-settings-${index}`}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs font-semibold ${index === 0 ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 sm:p-7">
            <h2 className="text-base font-semibold">Perfil e conta</h2>
            <p className="mt-1 text-xs text-muted-foreground">Informações usadas para personalizar seu workspace.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="field">
                Nome completo
                <input data-testid="input-settings-name" defaultValue="Marina Almeida" />
              </label>
              <label className="field">
                E-mail profissional
                <input data-testid="input-settings-email" defaultValue="marina@atlasengenharia.com.br" />
              </label>
              <label className="field sm:col-span-2">
                Empresa
                <input data-testid="input-settings-company" defaultValue="Atlas Engenharia e Projetos" />
              </label>
            </div>
            <Button data-testid="button-save-settings" onClick={() => setSaved(true)} className="mt-5">
              {saved ? <Check size={14} /> : null}
              {saved ? 'Alterações salvas' : 'Salvar alterações'}
            </Button>
          </section>
          <section className="rounded-xl border border-border bg-card p-5 sm:p-7">
            <h2 className="text-base font-semibold">Notificações</h2>
            <div className="mt-5 divide-y divide-border">
              {[
                ['Novos resultados', 'Receba oportunidades que combinam com suas buscas salvas.'],
                ['Mudanças em editais', 'Seja avisada quando prazos, valores ou documentos mudarem.'],
                ['Resumo semanal', 'Uma visão compacta do que aconteceu no seu radar.'],
              ].map(([name, desc], index) => (
                <label key={name} className="flex cursor-pointer items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <span>
                    <span className="block text-sm font-medium">{name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{desc}</span>
                  </span>
                  <input
                    aria-label={name}
                    data-testid={`checkbox-notification-${index}`}
                    type="checkbox"
                    defaultChecked={index < 2}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
