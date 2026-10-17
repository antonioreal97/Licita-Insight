# Contrato — recomendações personalizadas v1

Status: implementado. A funcionalidade aparece somente no app do Pardal Digital; não cria e-mail nem notificação.

## Acesso e privacidade

`GET /api/v1/recommendations` e `POST /api/v1/recommendations/{tenderId}/dismiss` exigem sessão e acesso ativo, como salvar/monitorar (`402 SUBSCRIPTION_REQUIRED`). Preferência, exclusão de histórico e exportação LGPD exigem somente sessão, para que continuem acessíveis sem assinatura.

A preferência `recommendationPersonalizationEnabled` nasce `false`. Sem opt-in, a API descarta buscas e visualizações antes de inserir qualquer linha. Ao desligar, o frontend envia `deleteHistory: true` (default da API) e informa que o histórico será apagado. Também existe `DELETE /api/v1/me/recommendation-history`. Eventos são retidos por no máximo 180 dias e a limpeza roda diariamente.

Sinais que não dependem do opt-in: perfil da empresa, editais salvos e monitorados, buscas salvas e feedback de desinteresse. O opt-in acrescenta somente termos normalizados de busca e ids de editais abertos. A exportação `pardal-digital-dados-YYYY-MM-DD.json` inclui preferência, eventos ainda retidos, feedback, perfil calculado e recomendações materializadas. Excluir a conta remove tudo por `ON DELETE CASCADE`.

As finalidades e os tipos de proponente do perfil da conta são dados **declarados** pelo usuário. Eles pesam materiais sem depender do opt-in de personalização comportamental. Sem resposta de finalidade, o fluxo, formato e ordenação de recomendações permanecem como antes.

## Endpoints

| Método | Rota                                         | Contrato                                                                                                 |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/recommendations?page=1&pageSize=10` | página de `Recommendation`, máximo 50; sessão + acesso                                                   |
| POST   | `/api/v1/recommendations/{tenderId}/dismiss` | 204; nunca recomenda o edital novamente e atualiza o perfil em segundo plano                             |
| GET    | `/api/v1/me/recommendation-preferences`      | `{ personalizationEnabled, showInternationalOpportunities, updatedAt }`                                  |
| PUT    | `/api/v1/me/recommendation-preferences`      | `{ personalizationEnabled, deleteHistory?, showInternationalOpportunities? }`; `deleteHistory` default true ao desligar; `showInternationalOpportunities` omitido fica como está |
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

Pontuação documentada (máximos aproximados): categoria de perfil `25`, termos de perfil/`ts_rank` `30`, reforço de histórico `10`+`12`, UF/cobertura `32`/`18` remoto, órgão `8`, faixa de valor `8`, prazo `6`, novidade `6`. **Condição mínima:** só entra candidato que casa com o perfil (oferta/palavra-chave como expressão inteira, ou categoria escolhida). Sinais de histórico (salvos, monitorados, buscas, órgãos) só reforçam; sozinhos não recomendam. Em cobertura `custom` + `strict`, fora da região → descartado; `prioritize` só pontua. “Aceito remoto” só libera fora da região quando já há casamento direto com o perfil (nunca só por categoria remota genérica). Termos genéricos do vocabulário de perfil (#142) são ignorados no histórico. Fora da faixa, `-5`; categorias/termos parecidos com dismiss recebem penalidade leve de até `-7`. Qualquer ocorrência de uma exclusão livre ou palavra-chave excluída explicitamente elimina o candidato. Os alertas de perfil reutilizam os filtros explícitos antes da avaliação: palavra-chave escolhida soma `0,20` e categoria escolhida soma `0,25` ao score normalizado, enquanto exclusões encerram o candidato sem chamada de modelo. No topo, entram no máximo dois itens do mesmo órgão e três da mesma categoria primária antes dos itens adiados.

Após mudar as regras, as linhas já materializadas em `user_recommendations` precisam ser refeitas: o job diário às 03:00 (`America/Sao_Paulo`) regenera todos os usuários, e o comando manual `pnpm --filter @workspace/api-server run rebuild:recommendations` faz o mesmo sob demanda (no container da API).

O resultado final (top 50, score e até três motivos legíveis) fica em `user_recommendations`. A leitura faz apenas join por rank. Salvar, monitorar, alterar perfil/busca salva e dar feedback agendam rebuild assíncrono com debounce. O job diário roda às 03:00 (`America/Sao_Paulo`), fora da coleta PNCP das 06:00, e também limpa eventos vencidos.

Com finalidades declaradas, a resposta acrescenta `opportunities`: chamadas abertas de `cultural_opportunities`, ordenadas por `kind`, `source`, `areas` e termos de `audience`/`opportunity_type`/título/resumo conforme a finalidade. `culture` prioriza cultura e fontes culturais; `funding` prioriza fomento, bolsas e apoio; `research` prioriza CNPq, CAPES, FINEP e chamadas de pesquisa/inovação. O tipo de proponente soma apenas um bônus quando há indício textual de público correspondente; público ausente ou incerto nunca exclui uma chamada. Exemplos: uma pessoa física interessada em cultura recebe uma chamada Mapas Culturais acima de uma chamada sem público informado; uma empresa interessada em pesquisa recebe uma chamada FINEP acima de uma chamada cultural sem relação. Sem `procurement`, a primeira página limita licitações a três para que não dominem a seção. `study` é aceito e não gera conteúdo artificial, pois não há fonte homologada. A preferência internacional existente continua controlando se chamadas internacionais entram.

Sem sinal útil e sem perfil não há fallback genérico: retorna lista vazia e a UI convida a cadastrar o perfil de atividade.

### Triagem rápida

`/triagem` apresenta um edital por vez e reutiliza os mesmos sinais de salvar/interesse e dispensa. A rota própria permite acesso direto pelo resumo diário e mantém a Visão geral compacta. O cartão de entrada conta apenas os editais disponíveis, até dez; oportunidades culturais não entram nesta fila.

A dispensa aceita corpo opcional `{ "reason": "not_offering" | "region" | "value" | "deadline" }`; valores desconhecidos retornam 400. Sem corpo, preserva a penalidade anterior. Sem migração: `recommendation_dismissals.terms` continua um array JSONB de strings e pode incluir um marcador versionado `@triage:v1:` seguido de JSON com motivo, UF e valor do edital dispensado. O marcador não é termo de pesquisa. `not_offering` preserva termos/categorias; os outros motivos guardam apenas o marcador e categorias vazias, evitando punir o serviço por incompatibilidade de localização, valor ou prazo. Repetir a dispensa substitui os sinais do mesmo edital.

Na reconstrução existente, região penaliza em 4 pontos candidatos da mesma UF; valor penaliza em 4 a faixa aproximada de ±25% (valores ausentes/suspeitos não contam); prazo penaliza em 4 os próximos três dias. Esses ajustes são leves, não filtros obrigatórios, e não mudam a cobertura/faixa declarada no perfil. Os termos explicitamente confirmados pelo usuário são adicionados às exclusões pelo PUT existente do perfil. A personalização de navegação continua separada dos sinais explícitos de salvar/dispensar.

A meta é de dez decisões/itens vistos, incluindo os pulados; pular não grava sinal no servidor. Ao esgotar uma seleção menor, o resumo informa isso sem simular dez itens. Progresso por usuário e dia de Brasília fica em memória durante a navegação; com consentimento de armazenamento opcional, também em `sessionStorage` para sobreviver a recargas da aba. Não sincroniza entre dispositivos/abas e não cria streak. Logout ou recusa de cookies remove a cópia opcional; nenhum token é armazenado. As exigências vêm somente das fichas prontas, sem iniciar análise. Custo adicional de IA por triagem/alerta: zero.
