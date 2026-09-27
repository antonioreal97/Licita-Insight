# CLAUDE_HANDOFF-019 — fila durável, orçamento, retenção, métricas e escala

Status: implementado e validado em 26 set 2026.

## Commits

1. `41fe5a2` — fila PostgreSQL `ai_jobs` e consumidor worker.
2. `b866034` — disjuntor diário que pausa somente lote.
3. `10060e5` — partição estática de RPM do Jev por papel.
4. `69cb9a6` — retenção de 90 dias, tombstone e contrato `expired`.
5. `8b92c7b` — endpoint Prometheus interno e alertas.
6. `6eb7b9a` — harness e baseline de 1,5 milhão.
7. Correções de revisão: `d3a6d68` (imports preguiçosos das métricas) e `261cd42` (fixture do gate lexical usando a fila).

## Mudanças por área

- `artifacts/api-server/src/ai/ai-job-queue.ts`: enqueue idempotente, claim `SKIP LOCKED`, prioridade interactive, concorrência por tipo, heartbeat de visibilidade, recuperação e backoff; executor chama o código existente de índice, fit e ficha.
- `ask-tender-service.ts`, `tender-index-service.ts`, `company-fit-service.ts`, `tender-sheet-service.ts` e `routes/ai.ts`: a API grava o estado e enfileira; `APP_ROLE=all` mantém execução local compatível; API-role não baixa documentos nem roda fit/ficha.
- `ai-budget.ts`, `jev-scheduler.ts` e `jobs/job-lock.ts`: gasto diário ask+fit+sheet no calendário de São Paulo, cache de 30 s, transições do disjuntor, pausa exclusiva do lote e auditoria `skipped_budget`; limites Jev separados por papel.
- `ai-document-retention.ts` e `scripts/report-retention.ts`: job diário com lock, deleção em lotes, preservação de salvos/fichas e CLI dry-run.
- `metrics.ts`, `app.ts`, `index.ts` e `request-protection.ts`: métricas HTTP/processo/pool/fila/jobs/scheduler/orçamento/retenção em porta interna. Dependências de banco e IA são preguiçosas, mantendo middlewares importáveis sem `DATABASE_URL`.
- `scripts/scale-seed.ts`, `scripts/scale-load.ts` e `docs/reviews/scale-baseline.md`: padrão de 1,5 M, amostras de 10 s e concorrências 10/50; a seção “1,5 M” registra a interrupção segura, planos e mitigação avaliada.
- `lib/db/src/schema/{operations,ai,company-fit}.ts`, migrations `0013`–`0015` e scripts `verify:*`: `ai_jobs`, índices diários do orçamento, novo status de auditoria e `tender_ai_indexes.purged_at`, com paridade Drizzle.
- `lib/api-spec/openapi.yaml`, `lib/api-zod` e `lib/api-client-react`: somente o valor público aditivo `expired`.
- `docs/contracts/ai-queue-v1.md`, `ai-cost-v1.md`, `ai-v1.md`, `docs/ops/alerts.md` e `docs/reviews/queue-budget-metrics.md`: contratos, PromQL e evidências operacionais.
- `.env.example` e `docker-compose.yml`: variáveis novas e portas internas opcionais; nenhum container foi iniciado ou reiniciado.

## Variáveis novas e padrões

| Variável | Padrão |
|---|---:|
| `AI_JOB_POLL_MS` | `1000` |
| `AI_JOB_VISIBILITY_TIMEOUT_MS` | `300000` |
| `WORKER_INDEX_CONCURRENCY` | `2` |
| `WORKER_SHEET_CONCURRENCY` | `2` |
| `WORKER_FIT_CONCURRENCY` | `8` |
| `AI_INDEX_ENQUEUE_PER_USER_PER_HOUR` | `60` |
| `AI_QUEUE_MAX_DEPTH_INDEX` | `1000` |
| `AI_QUEUE_MAX_DEPTH_SHEET` | `1000` |
| `AI_QUEUE_MAX_DEPTH_FIT` | `10000` |
| `AI_DAILY_BUDGET_USD` | `10` (`0` desliga) |
| `AI_DAILY_BUDGET_WARN_RATIO` | `0.8` |
| `JEV_RPM_LIMIT_API` | `300` |
| `JEV_RPM_LIMIT_WORKER` | `600` |
| `METRICS_PORT` | ausente (desligado) |

No Compose, `API_METRICS_PORT` e `WORKER_METRICS_PORT` alimentam `METRICS_PORT` sem publicar a porta automaticamente.

## Contrato final de `expired`

- `TenderAskIndexStatus` aceita `expired`.
- `GET .../ask-status` retorna `index: "expired"` para tombstone não reaberto.
- A ficha pronta em cache continua `ready`; sem cache, edital expirado retorna `status: "expired"`.
- `POST .../ask` em índice expirado retorna o envelope existente `409 CONFLICT` com `details: [{ "field": "index", "issue": "index_expired" }]`.
- Salvar o edital depois do purge permite nova indexação para o usuário que o salvou.
- O frontend não foi alterado; deve incorporar o novo valor aditivo.

## Migrations e comandos

Migrations: sim — `0013_ai_jobs.sql`, `0014_ai_budget.sql` e `0015_ai_retention.sql`.

```sh
pnpm --filter @workspace/db run verify:ai-jobs
pnpm --filter @workspace/db run verify:ai-purged-at
pnpm --filter @workspace/api-server run report:retention -- --dry-run --days 90
pnpm --filter @workspace/api-server run scale:seed -- --rows 1500000 --seed 42
pnpm --filter @workspace/api-server run scale:load -- --duration 10 --concurrency 10,50
pnpm --filter @workspace/api-server run scale:drop
```

Produção usa processos separados `APP_ROLE=api` e `APP_ROLE=worker`; desenvolvimento pode continuar com `APP_ROLE=all`.

## Números e verificações

- fila→início: 0,138 s com worker disponível; 15,869 s quando o worker ficou intencionalmente desligado;
- recuperação: `SIGKILL` durante `running`, visibilidade de 3 s no smoke, segundo worker concluiu `attempts=2` e índice `ready`;
- orçamento: fit permaneceu em fila a 10× o teto; pergunta interativa simulada respondeu; ao subir o teto, fit foi consumido;
- consulta de orçamento com 500 mil linhas/dia: p50 13,378 ms, p95 15,673 ms, máximo 15,691 ms (20 amostras após aquecimento);
- retenção dry-run em `licita_cycle4`: zero candidatos/documentos/bytes e zero salvos preservados;
- métricas: API e worker responderam na porta interna; `/metrics` público respondeu 404;
- suíte: 160/160, typecheck/build e duas verificações pelo bundle passaram;
- paridade: `verify:ai-jobs`, `verify:ai-purged-at` e dois `push-force` no banco existente passaram.

## Não verificado / follow-up

- A rodada HTTP em 1,5 M foi interrompida quando o VM do PostgreSQL chegou a 826% de CPU; somente os `EXPLAIN (ANALYZE, BUFFERS)` sequenciais são válidos nessa escala. Não há p95 HTTP para 10/50 conexões.
- A mitigação de 5.000 candidatos atingiu 100% de sobreposição top-20, mas não foi implementada porque piorou o p50 e o termo comum; precisa de estratégia de acesso/lógica de seletividade.
- Jev real não foi chamado e nenhuma chave foi lida; o smoke usou fetch simulado.
- Docker Compose, Fly.io, CDN, pooler externo e frontend não foram alterados/testados operacionalmente.
