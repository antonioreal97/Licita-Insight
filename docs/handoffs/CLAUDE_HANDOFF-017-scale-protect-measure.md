# CLAUDE_HANDOFF-017 — Fase 1a: proteger e medir

Status: backend concluído; frontend não alterado.

## O que mudou

- `artifacts/api-server/scripts/scale-*`: banco descartável `licita_scale`, seed determinística, cenários autocannon, rajada com dois IPs, métricas de RSS/event loop, configuração PostgreSQL e planos `EXPLAIN (ANALYZE, BUFFERS)`. O harness espera o banco ficar ocioso entre células.
- `lib/db`: pool por env, erro de cliente ocioso, extensão `pg_trgm`, GIN `gin_trgm_ops` em `tenders.search_text` e `cultural_opportunities.search_text`, migration 0009 e verificador de dois `push-force`.
- `artifacts/api-server/src/server-runtime.ts` e schedulers: timeouts/socket bounds, parada dos timers, espera de requisições em curso, fechamento do pool e saída 0 em SIGTERM/SIGINT.
- `GET /api/readyz`: novo endpoint OpenAPI; 200 com Postgres pronto, 503 indisponível/timeout de 2 s. Clientes gerados foram atualizados.
- `request-protection.ts`: limites de janela e concorrência por IP/usuário, load shedding global, timeout da aplicação, cache/ETag/304, `Retry-After` e cabeçalhos RateLimit.
- `app.ts`: trust proxy opt-in, `helmet` sem CSP, compressão JSON acima de 1 KiB, corpo máximo explícito e `no-store` por padrão.
- Clientes Google, Asaas, Resend, PNCP e Mapas usam timeout configurável. O Jev já usava `JEV_TIMEOUT_MS`; download de documentos já usava `AI_DOCUMENT_TIMEOUT_MS`.
- Erro de espera do pool agora vira `503 SERVICE_OVERLOADED`, não 500.

Rotas e formatos existentes foram preservados. `SERVICE_OVERLOADED`, `REQUEST_TIMEOUT` e `PAYLOAD_TOO_LARGE` são códigos aditivos; o Claude deve apenas garantir que qualquer união local de erros seja regenerada/atualizada antes de mexer no frontend. O cliente gerado deste worktree já contém os três.

Oportunidades culturais continuam atrás de sessão + assinatura, como definido em [`docs/account-api.md`](../account-api.md) e nos testes de monetização; por isso o middleware de cache emite `private, no-cache`, não cache público. Não remover esse gate neste handoff.

## Números

Detalhes e planos: [scale-baseline.md](../reviews/scale-baseline.md).

- 100 mil, termo raro, 50 conexões: p95 2.188 ms → 60 ms; RPS 25,9 → 978,9.
- 300 mil, termo raro, 50 conexões: p95 8.349 ms → 89,6 ms; RPS 5 → 675; buffers 70.091 → 478 (−99,32%).
- Termo comum (50% da tabela) permanece em Seq Scan e não melhorou: p95 2.233 → 2.305 ms em 100 mil/50 conexões.
- Rajada 500 + segundo cliente 10: antes, nenhum cliente concluiu resposta em 10 s; depois, cliente A recebeu 155.032 respostas 429, cliente B concluiu 322/322 em p95 283 ms e não houve 5xx inesperado.
- A carga limpa foi feita em 100 mil e 300 mil linhas. A rodada antiga de 1 milhão foi rejeitada como benchmark HTTP, mas seu EXPLAIN foi preservado. A retomada parou em 300 mil ao observar saturação no baseline de 100 conexões, conforme orientação do owner.

## Migration e paridade do schema

- Migration: **sim**, `lib/db/migrations/0009_search_trigram.sql`.
- Compose: `db-setup` executa `prepare-extensions` antes de `push-force`.
- `SEARCH_INDEX_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/postgres pnpm --filter @workspace/db run verify:search-index`: passou em banco vazio, segundo push sobre banco existente e confirmou `Bitmap Index Scan`.
- `push-force` foi executado duas vezes pelo verificador sem recriar/apagar os índices.

## Variáveis novas

Todos os padrões estão em `.env.example` e em [scale-protection-v1.md](../contracts/scale-protection-v1.md). Pontos principais: pool 10, espera de conexão 2 s, statement 15 s, request 30 s, ingest/export 120 s, concorrência 10/20/200 e janelas 60/240/20/3 por minuto.

## Validação executada

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server run build
PNCP_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/licita_cycle4 pnpm --dir artifacts/api-server run test
SEARCH_INDEX_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/postgres pnpm --filter @workspace/db run verify:search-index
```

Resultados: typecheck e build passaram; suíte completa 144/144 passou, inclusive integrações PostgreSQL em schemas isolados e teste pelo `dist`; verificador do índice passou. `licita_scale` foi apagado e os containers não foram parados/reiniciados.

## Commits de código

- `217cd1a` — harness descartável
- `6b3a2d9` — índices trigrama e pool
- `7b87e9e` — proteção HTTP, timeouts, readiness e shutdown
- `300a398` — isolamento dos testes de readiness/rate limit

## Não verificado / limites conhecidos

- Não foi feito deploy/CDN real; a configuração recomendada está documentada.
- Readiness indisponível foi testada com falha `ECONNREFUSED` injetada, pois o handoff proíbe parar o container PostgreSQL.
- O limite de conexões por IP depende do balanceador/CDN.
- Termos muito comuns, contagem exata, sugestões e paginação profunda continuam candidatos da próxima fase; não houve mudança contratual de ranking, `totalIsEstimate` ou paginação.
