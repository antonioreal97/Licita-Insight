# Contrato administrativo — relatório de custo de IA v1

O comando local `pnpm --filter @workspace/api-server run report:ai-cost -- [--days 30] [--user <id|email>] [--json]` lê a view `ai_usage_ledger`. Ele não expõe rota HTTP e não altera nenhum contrato público.

## Ledger

Cada linha contém `occurred_at`, `user_id` (nulo para custo da plataforma), `feature`, `tender_id`, `model`, `input_tokens` e `cost_usd`.

- `ask`: perguntas com status `answered` ou `not_found`; o instante é `created_at`.
- `fit`: avaliações com status `ready`; o instante é `checked_at` e os tokens já incluem a checagem de porte.
- `sheet`: fichas com status `ready`; o instante é `generated_at`. `user_id` é sempre nulo porque a ficha é cache global por edital e seu custo pertence à plataforma.

## Definições do relatório

Usuário ativo é um usuário com pelo menos uma linha `ask` ou `fit` no período. Média, p50, p90, p99 e máximo usam o custo total por usuário no período; percentis usam nearest-rank. O top 10 inclui id e e-mail e, por isso, o comando é apenas administrativo local.

O total e a tendência diária incluem ficha. O bloco `platform` isola `sheet`; `userAttributed` soma `ask` e `fit`. `--user` filtra as linhas atribuídas ao usuário, enquanto custos de ficha não são atribuídos a ele. Os contadores de teto usam `ai_daily_usage` e `ai_fit_daily_usage`; para perguntas, a assinatura vigente distingue o limite pago do limite de teste. Essa leitura de assinatura é uma aproximação para períodos históricos.

A projeção mensal é `custo do período / dias solicitados × 30`. Ela é uma extrapolação simples, não uma previsão, e não incorpora sazonalidade, mudança de preço do modelo nem dias sem operação.

## Disjuntor diário

`AI_DAILY_BUDGET_USD` (padrão `10`; `0` desliga) soma `ask`, `fit` e `sheet` no dia de `America/Sao_Paulo`. A leitura usa os três contadores diários e cache local de no máximo 30 segundos; `AI_DAILY_BUDGET_WARN_RATIO` (padrão `0.8`) define o aviso.

Ao atingir o teto, somente o lote é pausado: jobs `fit` permanecem `queued` e o alerta de perfil registra `skipped_budget`. Perguntas e fichas continuam. A fila retoma automaticamente após a virada do dia ou aumento do teto.

## Partição do limite Jev

Processos `api` usam `JEV_RPM_LIMIT_API=300` e processos `worker` usam `JEV_RPM_LIMIT_WORKER=600`; a soma configurada não pode exceder 1.200 RPM. `APP_ROLE=all` mantém `JEV_RPM_LIMIT=900`. A divisão estática pode subutilizar uma faixa quando o outro papel está ocioso, mas impede excesso entre réplicas sem coordenação distribuída. Um balde compartilhado no PostgreSQL é a alternativa futura e não faz parte deste contrato.
