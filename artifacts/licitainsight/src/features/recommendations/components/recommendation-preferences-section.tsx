import { Trash2 } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { Switch } from '@/components/ui/switch';
import { useDeleteRecommendationHistory, useRecommendationPreferences, useUpdateRecommendationPreferences } from '../hooks/use-recommendations';

export function RecommendationPreferencesSection() {
  const preferences = useRecommendationPreferences();
  const update = useUpdateRecommendationPreferences();
  const clear = useDeleteRecommendationHistory();
  const enabled = preferences.data?.personalizationEnabled ?? false;
  const international = preferences.data?.showInternationalOpportunities ?? false;
  return (
    <section id="recomendacoes" aria-labelledby="settings-recommendations" className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-7">
      <h2 id="settings-recommendations" className="type-section">
        Recomendações
      </h2>
      <p className="mt-1 type-meta text-muted-foreground">
        O perfil da empresa, editais salvos, monitorados, buscas salvas e as respostas da triagem (Interessa / Não interessa) ajudam a ordenar recomendações.
      </p>
      <div className="mt-5 flex items-start justify-between gap-4">
        <span className="min-w-0 flex-1">
          <label htmlFor="switch-recommendation-personalization" className="block type-ui font-medium">
            Personalizar recomendações com minhas buscas e cliques
          </label>
          <span id="switch-recommendation-personalization-desc" className="mt-0.5 block type-meta text-muted-foreground">
            Desligado por padrão. Quando ligado, guardamos termos normalizados de buscas e aberturas de editais por até 180 dias. A triagem (Interessa / Não
            interessa) ensina mesmo com esta opção desligada. Não usamos esse histórico para e-mail.
          </span>
        </span>
        <Switch
          id="switch-recommendation-personalization"
          aria-describedby="switch-recommendation-personalization-desc"
          checked={enabled}
          disabled={preferences.isPending || update.isPending}
          onCheckedChange={(checked) => update.mutate({ enabled: checked, deleteHistory: !checked })}
        />
      </div>
      {!enabled && preferences.data && (
        <p className="mt-3 type-meta text-muted-foreground">Ao desligar, apagamos buscas/cliques e também o aprendizado da triagem.</p>
      )}
      <Button variant="outline" size="sm" className="mt-4" loading={clear.isPending} onClick={() => clear.mutate()}>
        <Trash2 size={14} aria-hidden /> Apagar aprendizado e histórico
      </Button>
      <div className="mt-6 flex items-start justify-between gap-4 border-t border-border-subtle pt-5">
        <span className="min-w-0 flex-1">
          <label htmlFor="switch-international-opportunities" className="block type-ui font-medium">
            Mostrar oportunidades internacionais
          </label>
          <span id="switch-international-opportunities-desc" className="mt-0.5 block type-meta text-muted-foreground">
            Desligado por padrão. Quando ligado, avisos do Banco Mundial e do BID e chamadas da União Europeia entram na combinação com o seu perfil e nas
            recomendações. A aba Internacionais do hub continua disponível de qualquer forma.
          </span>
        </span>
        <Switch
          id="switch-international-opportunities"
          data-testid="switch-international-opportunities"
          aria-describedby="switch-international-opportunities-desc"
          checked={international}
          disabled={preferences.isPending || update.isPending}
          // Only this preference changes: personalization stays as it is and no history is erased.
          onCheckedChange={(checked) => update.mutate({ enabled, deleteHistory: false, showInternationalOpportunities: checked })}
        />
      </div>
      {(preferences.isError || update.isError || clear.isError) && (
        <p role="alert" className="mt-3 type-meta text-destructive-subtle-foreground">
          Não foi possível atualizar a preferência. Tente novamente.
        </p>
      )}
    </section>
  );
}
