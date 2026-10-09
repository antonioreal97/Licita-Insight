# Contrato — recomendações personalizadas v1

Status: implementado. A funcionalidade aparece somente no app do Pardal Digital; não cria e-mail nem notificação.

## Acesso e privacidade

`GET /api/v1/recommendations` e `POST /api/v1/recommendations/{tenderId}/dismiss` exigem sessão e acesso ativo, como salvar/monitorar (`402 SUBSCRIPTION_REQUIRED`). Preferência, exclusão de histórico e exportação LGPD exigem somente sessão, para que continuem acessíveis sem assinatura.

A preferência `recommendationPersonalizationEnabled` nasce `false`. Sem opt-in, a API descarta buscas e visualizações antes de inserir qualquer linha. Ao desligar, o frontend envia `deleteHistory: true` (default da API) e informa que o histórico será apagado. Também existe `DELETE /api/v1/me/recommendation-history`. Eventos são retidos por no máximo 180 dias e a limpeza roda diariamente.

Sinais que não dependem do opt-in: perfil da empresa, editais salvos e monitorados, buscas salvas e feedback de desinteresse. O opt-in acrescenta somente termos normalizados de busca e ids de editais abertos. A exportação `pardal-digital-dados-YYYY-MM-DD.json` inclui preferência, eventos ainda retidos, feedback, perfil calculado e recomendações materializadas. Excluir a conta remove tudo por `ON DELETE CASCADE`.

## Endpoints

| Método | Rota                                         | Contrato                                                                                                 |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/recommendations?page=1&pageSize=10` | página de `Recommendation`, máximo 50; sessão + acesso                                                   |
| POST   | `/api/v1/recommendations/{tenderId}/dismiss` | 204; nunca recomenda o edital novamente e atualiza o perfil em segundo plano                             |
| GET    | `/api/v1/me/recommendation-preferences`      | `{ personalizationEnabled, updatedAt }`                                                                  |
| PUT    | `/api/v1/me/recommendation-preferences`      | `{ personalizationEnabled, deleteHistory? }`; `deleteHistory` default true ao desligar                   |
| DELETE | `/api/v1/me/recommendation-history`          | 204; apaga eventos de busca/visualização                                                                 |
| POST   | `/api/v1/recommendations/events`             | `{type:'search',query}`, `{type:'tender_view',tenderId}` ou `{type:'click',tenderId?}`; 202 `{recorded}` |

```ts
type Recommendation = {
  tender: TenderSummary;
  score: number;
  reasons: Array<{
    kind:
      | "profile"
      | "monitored"
      | "saved"
      | "saved_search"
      | "search"
      | "location"
      | "organization"
      | "value"
      | "platform";
    text: string;
  }>;
  generatedAt: string;
};
```

Impressões são somadas na leitura da página; cliques e dismiss são somados em seus endpoints. `recommendation_metrics_daily` guarda apenas contadores diários globais, sem user id, tender id ou conteúdo de busca.

## Perfil e pesos

O perfil de interesse materializado mantém os 30 termos mais fortes e até 20 categorias, órgãos e modalidades, além de UFs e faixa de valor. Pesos-base:

- perfil da empresa: palavra-chave escolhida `12`, categoria escolhida `12`, oferta livre `6`, descrição inferida `2`, UF de cobertura `5`;
- monitorado: `10`; salvo: `6`;
- busca salva: `3`;
- busca opt-in: `1,5 × decaimento`; detalhe opt-in: `2 × decaimento`.
- plataforma cadastrada (`registeredPlatforms` do perfil): `+6` e motivo `platform`, só como desempate — vale apenas para candidatos que já têm outro motivo; sozinha nunca recomenda um edital.

Eventos usam meia-vida de 30 dias (`2^(-idade/30)`). Termos genéricos de contratação e stopwords portuguesas são eliminados. Sinais escolhidos explicitamente no perfil têm prioridade sobre termos inferidos da descrição e do histórico. Monitorados valem mais do que salvos. O feedback preserva termos/categorias do edital para penalizar semelhantes mesmo depois da próxima atualização.

## Candidatos e pontuação

São candidatos somente editais `open`, com `proposal_deadline > now`, não salvos/monitorados e não descartados. O PostgreSQL usa `to_tsvector('portuguese', search_text)` + `websearch_to_tsquery`, categorias JSONB e UFs; no máximo 500 candidatos por usuário. Não há embedding, modelo local, GPU ou chamada de LLM nesse fluxo.

Pontuação documentada (máximos aproximados): categoria `25`, termos/`ts_rank` `30`, UF/cobertura `14`, órgão `8`, faixa de valor `8`, prazo `6`, novidade `6`. Fora das UFs de cobertura recebe `-35`; fora da faixa, `-5`; categorias/termos parecidos com dismiss recebem penalidade leve de até `-7`. Qualquer ocorrência de uma exclusão livre ou palavra-chave excluída explicitamente elimina o candidato. Os alertas de perfil reutilizam os filtros explícitos antes da avaliação: palavra-chave escolhida soma `0,20` e categoria escolhida soma `0,25` ao score normalizado, enquanto exclusões encerram o candidato sem chamada de modelo. No topo, entram no máximo dois itens do mesmo órgão e três da mesma categoria primária antes dos itens adiados.

O resultado final (top 50, score e até três motivos legíveis) fica em `user_recommendations`. A leitura faz apenas join por rank. Salvar, monitorar, alterar perfil/busca salva e dar feedback agendam rebuild assíncrono com debounce. O job diário roda às 03:00 (`America/Sao_Paulo`), fora da coleta PNCP das 06:00, e também limpa eventos vencidos.

Sem sinal útil e sem perfil não há fallback genérico: retorna lista vazia e a UI convida a cadastrar o perfil de atividade.
