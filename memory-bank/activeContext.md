# Active Context — Licita Insight

## Foco agora

Ciclo 8 (branch `antonioreal97/cycle8`, commits locais, sem push nem PR): Fases 1b e 2 de escala e custo por usuário (HANDOFFs 018 e 019), entregues e validadas ao vivo com o Jev real. Ciclo 7 (Fase 1a, PR #9) e as decisões do owner de 26 set 2026 (`docs/architecture-scale.md`, seção 7) estão no `main`.

018: `APP_ROLE=all|api|worker`, jobs com `pg_try_advisory_lock` + `job_run_audit`, view `ai_usage_ledger` + `report:ai-cost`, faixas interativo/lote no Jev, filtro lexical do fit em modo `shadow`.
019: fila durável `ai_jobs` (a API só enfileira; o worker extrai PDF, calcula fit e ficha; SKIP LOCKED, visibilidade, retentativa), disjuntor `AI_DAILY_BUDGET_USD=10` que pausa só o lote, RPM do Jev por papel, retenção de 90 dias após o prazo (exceto editais salvos; tombstone; valor `expired`), métricas Prometheus em `METRICS_PORT` (não públicas) e `docs/ops/alerts.md`. Relatório com a validação independente em `docs/reviews/queue-budget-metrics.md`.

Pendente/limites: carga HTTP em 1,5 M de linhas não medida (só EXPLAIN; VM do Postgres a 826% de CPU); termo comum na busca sem mitigação; edital sem `proposal_deadline` nunca expira; filtro lexical só liga com ≥ 500 medições e recall ≥ 97% (decisão do owner). Próximo: HANDOFF-020 (deploy no Fly.io `gru`: api + worker, Managed Postgres, `pg_trgm`, `TRUST_PROXY`, `BILLING_MONTHLY_BRL=49.90`). Segurança: rotas de ingestão sem autenticação (só limite de 3/min) e relatório do Hermes em `docs/reviews/security-audit-2026-09-26.md` (não commitado); o owner respondeu "ainda não" ao handoff P0.

Ambiente: o Docker Desktop reinicia sozinho e derruba o stack `licita-insight`; só o container do Postgres é religado à mão. `licita_cycle4` está no esquema atual (migrations até 0015). A conta Codex do owner bateu o limite de uso uma vez e foi trocada; um dispatch antigo do Orca ficou como `release_unknown` (o processo já saiu).

## O que está na mesa

- Postgres local: `docker compose up -d` (container `licita-postgres`, `DATABASE_URL` em `.env` na raiz, gitignored).
- Tabelas `tenders`, `ingest_runs`, `ingest_days`, `cultural_opportunities` e `subscriptions` em `lib/db`. Push: `pnpm --filter @workspace/db run push-force` (subscriptions aplicada no Postgres local em 23 set 2026).
- Billing: `GET/POST /api/v1/me/billing*`, webhook `POST /api/v1/billing/asaas/webhook` (header `asaas-access-token`). Env: `ASAAS_API_KEY`, `ASAAS_API_BASE_URL`, `ASAAS_WEBHOOK_TOKEN`, `BILLING_MONTHLY_BRL`. Contrato em `docs/contracts/account-v1.md`. Sem as chaves, o checkout responde `503 BILLING_UNAVAILABLE`.
- Coletor PNCP: `pnpm --filter @workspace/api-server run collect:pncp`. n8n pode chamar `POST /api/v1/ingest/pncp` (202) e ler `GET /api/v1/ingest/pncp`.
- Coletor cultural: `pnpm --filter @workspace/api-server run collect:opportunities`. `POST`/`GET /api/v1/ingest/opportunities`. Agenda com a API, desligável com `CULTURE_DAILY_COLLECT=false`. Contrato em `docs/contracts/opportunities-v1.md`.
- A lista cultural só guarda audiovisual. A busca usa `@keyword` (audiovisual, cinema, filme, documentario); `term:linguagem=EQ(Audiovisual)` quebra as instalações (500 ou HTML). Instalações conhecidas: AP, CE, ES, GO, MA, MT, PA, PB, PE, PI, SE, TO, mais o federal `mapa.cultura.gov.br`. As outras 15 UFs aparecem como lacuna. Coleta de 23 set 2026 gravou 9 chamadas (CE e PE). Federal continua 403 (Cloudflare). AP, MA, MT e TO falham no certificado HTTPS. FSA/BRDE e páginas HTML ficam para o próximo ciclo.
- API lê somente o PostgreSQL. Sem `DATABASE_URL`, a busca responde 503 `SEARCH_UNAVAILABLE`. Não há fixtures em memória.
- Frontend sempre chama a API. A coleta diária sobe com o processo da API e repete às 06:00 em `America/Sao_Paulo` (`PNCP_DAILY_HOUR`, `PNCP_DAILY_COLLECT=false` para desligar).
- Calendário de cobertura aplicado ao Postgres local: coleta incremental pula dias/modalidades/UFs selados, retoma lacunas e revisita hoje. Datas explícitas forçam backfill. A consulta deve começar depois da meia-noite de Brasília para selar o dia anterior.
- `GET /api/v1/ingest/pncp` inclui `coverage`, com dias selados, próximo dia aberto e partições. Detalhes operacionais: `docs/ingest-pncp-calendar.md`.
- Última tentativa real do calendário (DF/modalidade 6, 21 set 2026) terminou por timeout do PNCP; 19 editais preservados e cobertura pendente. Os 27 testes, incluindo duas execuções em Postgres isolado com respostas controladas, passaram; typecheck e build também.

## Próximos passos

1. Preencher Asaas no `.env` (sandbox) e reiniciar a API (`docker compose restart api`) — o `dev` do Compose builda uma vez e não recarrega rotas novas.
2. Configurar o webhook no painel Asaas apontando para a origem pública + `ASAAS_WEBHOOK_TOKEN`.
3. Rodar a carga nacional de 30 dias do PNCP quando couber. Páginas HTML do FSA (ANCINE, BRDE) ficam para depois.

## Cuidados ativos

- Dados do PNCP são publicações oficiais. A interface não serve editais fictícios.
- Valor `0` sem descrição de sigilo vira `not_published`. Sigilo explícito vira `confidential` e o valor não é guardado.
- A API de consulta do PNCP estoura tempo em janelas largas. O coletor pede um dia por vez e, se receber timeout, reparte por UF.
