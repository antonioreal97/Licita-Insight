import { Trash2 } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { Switch } from '@/components/ui/switch';
import { useDeleteRecommendationHistory, useRecommendationPreferences, useUpdateRecommendationPreferences } from '../hooks/use-recommendations';

export function RecommendationPreferencesSection() {
  const preferences = useRecommendationPreferences();
  const update = useUpdateRecommendationPreferences();
  const clear = useDeleteRecommendationHistory();
  const enabled = preferences.data?.personalizationEnabled ?? false;
  return (
    <section id="recomendacoes" aria-labelledby="settings-recommendations" className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-7">
      <h2 id="settings-recommendations" className="type-section">
        Recomendações
      </h2>
      <p className="mt-1 type-meta text-muted-foreground">
        O perfil da empresa, editais salvos, monitorados e buscas salvas sempre ajudam a ordenar recomendações.
      </p>
      <div className="mt-5 flex items-start justify-between gap-4">
        <span className="min-w-0 flex-1">
          <label htmlFor="switch-recommendation-personalization" className="block type-ui font-medium">
            Personalizar recomendações com minhas buscas e cliques
          </label>
          <span id="switch-recommendation-personalization-desc" className="mt-0.5 block type-meta text-muted-foreground">
            Desligado por padrão. Quando ligado, guardamos termos normalizados de buscas e aberturas de editais por até 180 dias. Não usamos esse histórico para
            e-mail.
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
        <p className="mt-3 type-meta text-muted-foreground">Seu histórico de buscas e cliques é apagado ao desligar esta opção.</p>
      )}
      {enabled && (
        <Button variant="outline" size="sm" className="mt-4" loading={clear.isPending} onClick={() => clear.mutate()}>
          <Trash2 size={14} aria-hidden /> Apagar histórico agora
        </Button>
      )}
      {(preferences.isError || update.isError || clear.isError) && (
        <p role="alert" className="mt-3 type-meta text-destructive-subtle-foreground">
          Não foi possível atualizar a preferência. Tente novamente.
        </p>
      )}
    </section>
  );
}
