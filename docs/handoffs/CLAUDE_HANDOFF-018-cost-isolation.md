# CLAUDE_HANDOFF-018 — custo e isolamento

Status: implementado e validado em 26 set 2026.

## Commits

1. `fad9451` — papéis `APP_ROLE=all|api|worker` e health opcional do worker.
2. `f1047a5` — advisory locks de sessão e auditoria dos jobs.
3. `8fcd6bf` — view `ai_usage_ledger`, paridade e `report:ai-cost`.
4. `af5e7db` — faixas interactive/batch do Jev.
5. commit que contém este handoff — gate lexical, relatório, testes finais e documentação.

## Mudanças por área

- `artifacts/api-server/src/index.ts`, `app-role.ts`, `worker-health.ts` e `server-runtime.ts`: um bundle com papel HTTP, worker ou compatível `all`; shutdown funciona mesmo sem servidor HTTP.
- agendadores em `account/`, `email/`, `ai/` e `ingest/`: ciclos protegidos por `jobs/job-lock.ts`, conexão dedicada e auditoria.
- `ai/jev-scheduler.ts` e `ai/jev-client.ts`: todas as cinco operações passam pelo scheduler; fit e porte são batch, pergunta e ficha são interactive.
- `ai/company-fit-service.ts` e `fit-lexical-gate.ts`: gate por radical de qualquer palavra, modos off/shadow/on e persistência da decisão.
- scripts: `report-ai-cost.ts` e `report-fit-gate.ts`; verificações de view e coluna em `lib/db/scripts/`.
- schema/migrations: `job_run_audit`, view `ai_usage_ledger` e `company_tender_fits.lexical_gate_pass`.
- Compose: serviço `worker` somente no profile `scale`; `api` continua com o padrão `all`.
- contratos e revisão: [`ai-cost-v1.md`](../contracts/ai-cost-v1.md), complemento de [`company-fit-v1.md`](../contracts/company-fit-v1.md), [`cost-isolation.md`](../reviews/cost-isolation.md) e seção 8 de [`architecture-scale.md`](../architecture-scale.md).

## Variáveis novas e padrões

| Variável | Padrão |
|---|---:|
| `APP_ROLE` | `all` |
| `WORKER_HEALTH_PORT` | ausente (não abre porta) |
| `JEV_MAX_CONCURRENCY` | `16` |
| `JEV_BATCH_MAX_SHARE` | `0.5` |
| `JEV_RPM_LIMIT` | `900` |
| `JEV_INTERACTIVE_RESERVE_RPM` | `300` |
| `JEV_BACKOFF_MS` | `30000` |
| `JEV_INTERACTIVE_QUEUE_TIMEOUT_MS` | `5000` |
| `AI_FIT_LEXICAL_GATE` | `shadow` |

## Comandos

```sh
pnpm --filter @workspace/api-server run dev:worker
pnpm --filter @workspace/api-server run start:worker
pnpm --filter @workspace/api-server run report:ai-cost -- --days 30 --json
pnpm --filter @workspace/api-server run report:fit-gate -- --json
pnpm --filter @workspace/db run verify:ai-ledger
pnpm --filter @workspace/db run verify:fit-gate
docker compose --profile scale up --build
```

Antes de `push-force` num banco novo, executar `prepare-extensions`. O script `push-force` aplica o schema Drizzle e depois recria de forma idempotente a view declarada como `pgView(...).existing()`, evitando que o segundo push a remova.

## Migrations

- sim: `0010_job_run_audit.sql`;
- sim: `0011_ai_usage_ledger.sql`;
- sim: `0012_company_fit_lexical_gate.sql`.

## Segurança dos jobs

| Job | Evidência anterior | Resultado |
|---|---|---|
| ingest reconciliation | update idempotente | advisory lock |
| trial notifications | dedupe | advisory lock |
| email immediate/retry | unique dedupe | advisory lock |
| saved searches | lock por busca + dedupe | advisory lock global do ciclo |
| digest/profile alerts | cotas e dedupe | advisory lock global do ciclo |
| AI retention | delete idempotente | advisory lock |
| document retry | retry state | advisory lock |
| PNCP/cultural collect | `ingest_runs_one_running` | advisory lock no disparo + unique existente |

O smoke de dois workers mostrou um sucesso e um salto por lock para cada ciclo de startup; detalhes estão em [`docs/reviews/cost-isolation.md`](../reviews/cost-isolation.md).

## Resultados Jev

Com 50 interactive + 50 batch: pico global 10, pico batch 5, espera p95 12 ms interactive e 31 ms batch, duração 33 ms e zero pendências. O scheduler também passou pausa de batch em 429/529, prioridade interactive e timeout de fila.

## Contrato e fronteiras

Não houve rota, envelope ou alteração de frontend. O motivo interno `no_offering_term` não foi adicionado ao OpenAPI/tipos gerados para evitar ampliar o contrato público neste ciclo; a rota não faz parse de saída e o `switch` atual do `fit-badge.tsx` retorna `undefined` para um kind desconhecido, que React ignora sem lançar erro. Essa é uma divergência intencional entre o registro interno documentado e o union tipado v1.

Extração, `runningIndexes`, `runningFits` e geração de ficha continuam na API quando disparadas por request; mover isso ao worker pertence ao HANDOFF-019.

## Verificado e não verificado

Verificado: 153 testes com Postgres em schema isolado de `licita_cycle4`, typecheck, build, testes via `dist/`, dois push-force, relatórios, smoke HTTP com 2 workers + 1 API e graceful shutdown. Os bancos descartáveis foram apagados.

Não verificado: chamada real ao Jev (fetch simulado, sem ler chave), execução do profile Docker `scale` (containers não foram parados, reiniciados nem iniciados), nem comportamento sob carga pesada. O gate continua `shadow`; o banco existente ainda tem zero medições pós-migração.
