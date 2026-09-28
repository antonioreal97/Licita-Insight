# Active Context — Licita Insight

## Foco agora

Ciclo 10 (branch `antonioreal97/cycle10`, commits locais, sem push nem PR): prontidão de deploy
(HANDOFF-021). Decisões do owner em 27–28 set 2026: (1) custo fixo alto sem usuários → Fly enxuto (~US$ 20/mês:
1 máquina `APP_ROLE=all` + Postgres próprio com volume; Managed Postgres só com ~20 assinantes; revisão na
decisão 1 de `docs/architecture-scale.md`); (2) o **lançamento é um beta fechado gratuito no Mac do owner
atrás de Cloudflare Tunnel** (`docs/ops/beta-local.md`), convidados liberados por `beta_access_grants`
(migration 0018) — o Fly sobe com ~3 usuários ativos. Schema de produção agora só por migrations versionadas
(`0000`–`0018`, `release_command`), com `verify:migrations` como guarda permanente contra divergência
schema × migration. Validação completa em `docs/reviews/deploy-readiness-2026-09-28.md` (180/180 testes).
Pendências: **nome/marca** — o espaço "Licita + IA" está saturado (10+ nomes parecidos; `licitai.com.br` e
`licitaia.com.br` de terceiros; `lioedital.com.br` e `lieditais.com.br` livres em 28 set) e o domínio do beta
depende disso; confirmar o IP real atrás do túnel; autenticação das rotas `/api/v1/ingest/*` (WAF da
Cloudflare mitiga só no beta). Sugestão ao owner ainda sem resposta: próxima feature = documentos da empresa
com validade (o checklist passaria a dizer o que **falta**) e "preço de fundador" R$ 49,90.

Ciclo 9 (PR #11, mergeado): antes do deploy, o owner pediu
verificar se a plataforma é competitiva e entrega o que promete (`docs/reviews/competitive-analysis-2026-09-27.md`).
Achado principal: IA com trecho citado não é mais diferencial exclusivo (Acumi, Licitei já entregam); o
que reforça a competitividade é preço (R$49,90 sem teto de análises) + chamadas culturais. Isso motivou o
checklist automático de habilitação (HANDOFF-020), entregue pelo Codex e validado por mim (backend +
integração do frontend); ver `docs/reviews/qualification-checklist-2026-09-27.md` e a seção correspondente
em `progress.md`. Também neste ciclo: `BILLING_MONTHLY_BRL=49.90` e `ASAAS_API_KEY` configurados e
verificados no `.env` real (ver "Cuidados ativos" abaixo — gotcha de `$` no Docker Compose).

Ciclo 8 (Fases 1b e 2 de escala e custo por usuário, HANDOFFs 018 e 019) e ciclo 7 (Fase 1a, PR #9) com as
decisões do owner de 26 set 2026 (`docs/architecture-scale.md`, seção 7) estão no `main`.

018: `APP_ROLE=all|api|worker`, jobs com `pg_try_advisory_lock` + `job_run_audit`, view `ai_usage_ledger` + `report:ai-cost`, faixas interativo/lote no Jev, filtro lexical do fit em modo `shadow`.
019: fila durável `ai_jobs` (a API só enfileira; o worker extrai PDF, calcula fit e ficha; SKIP LOCKED, visibilidade, retentativa), disjuntor `AI_DAILY_BUDGET_USD=10` que pausa só o lote, RPM do Jev por papel, retenção de 90 dias após o prazo (exceto editais salvos; tombstone; valor `expired`), métricas Prometheus em `METRICS_PORT` (não públicas) e `docs/ops/alerts.md`. Relatório com a validação independente em `docs/reviews/queue-budget-metrics.md`.
020: checklist automático de habilitação — ver acima.

Pendente/limites: carga HTTP em 1,5 M de linhas não medida (só EXPLAIN; VM do Postgres a 826% de CPU); termo comum na busca sem mitigação; edital sem `proposal_deadline` nunca expira; filtro lexical só liga com ≥ 500 medições e recall ≥ 97% (decisão do owner). Deploy no Fly.io `gru` segue pausado a pedido do owner (não reautorizado desde a pausa de 27 set 2026). Segurança: rotas de ingestão sem autenticação (só limite de 3/min) e relatório do Hermes em `docs/reviews/security-audit-2026-09-26.md` (não commitado, não é meu; owner respondeu "ainda não" ao handoff P0).

Ambiente: o Docker Desktop reinicia sozinho e derruba o stack `licita-insight`; só o container do Postgres é religado à mão. `licita_cycle4` está no esquema atual (migrations até 0015). A conta Codex do owner bateu o limite de uso uma vez e foi trocada; um dispatch antigo do Orca ficou como `release_unknown` (o processo já saiu).

## O que está na mesa

- Postgres local: `docker compose up -d` (container `licita-postgres`, `DATABASE_URL` em `.env` na raiz, gitignored).
- Tabelas `tenders`, `ingest_runs`, `ingest_days`, `cultural_opportunities` e `subscriptions` em `lib/db`. Push: `pnpm --filter @workspace/db run push-force` (subscriptions aplicada no Postgres local em 23 set 2026).
- Billing: `GET/POST /api/v1/me/billing*`, webhook `POST /api/v1/billing/asaas/webhook` (header `asaas-access-token`). Env: `ASAAS_API_KEY`, `ASAAS_API_BASE_URL`, `ASAAS_WEBHOOK_TOKEN`, `BILLING_MONTHLY_BRL`. Contrato em `docs/contracts/account-v1.md`. Desde 27 set 2026, todas as quatro configuradas e verificadas no `.env` real (`GET /billing/plan` → `{"monthlyBrl":49.9,...}`). O valor do Asaas começa com `$`; no `.env` que o Docker Compose lê via `env_file`, isso só sobrevive entre aspas simples (`ASAAS_API_KEY='$aact_...'`), nunca solto nem escapado com `$$` — Compose interpola `${VAR}` do `.env` do projeto por conta própria, e valores com `$$` chegam com zero `$` no container.
- Coletor PNCP: `pnpm --filter @workspace/api-server run collect:pncp`. n8n pode chamar `POST /api/v1/ingest/pncp` (202) e ler `GET /api/v1/ingest/pncp`.
- Coletor cultural: `pnpm --filter @workspace/api-server run collect:opportunities`. `POST`/`GET /api/v1/ingest/opportunities`. Agenda com a API, desligável com `CULTURE_DAILY_COLLECT=false`. Contrato em `docs/contracts/opportunities-v1.md`.
- A lista cultural só guarda audiovisual. A busca usa `@keyword` (audiovisual, cinema, filme, documentario); `term:linguagem=EQ(Audiovisual)` quebra as instalações (500 ou HTML). Instalações conhecidas: AP, CE, ES, GO, MA, MT, PA, PB, PE, PI, SE, TO, mais o federal `mapa.cultura.gov.br`. As outras 15 UFs aparecem como lacuna. Coleta de 23 set 2026 gravou 9 chamadas (CE e PE). Federal continua 403 (Cloudflare). AP, MA, MT e TO falham no certificado HTTPS. FSA/BRDE e páginas HTML ficam para o próximo ciclo.
- API lê somente o PostgreSQL. Sem `DATABASE_URL`, a busca responde 503 `SEARCH_UNAVAILABLE`. Não há fixtures em memória.
- Frontend sempre chama a API. A coleta diária sobe com o processo da API e repete às 06:00 em `America/Sao_Paulo` (`PNCP_DAILY_HOUR`, `PNCP_DAILY_COLLECT=false` para desligar).
- Calendário de cobertura aplicado ao Postgres local: coleta incremental pula dias/modalidades/UFs selados, retoma lacunas e revisita hoje. Datas explícitas forçam backfill. A consulta deve começar depois da meia-noite de Brasília para selar o dia anterior.
- `GET /api/v1/ingest/pncp` inclui `coverage`, com dias selados, próximo dia aberto e partições. Detalhes operacionais: `docs/ingest-pncp-calendar.md`.
- Última tentativa real do calendário (DF/modalidade 6, 21 set 2026) terminou por timeout do PNCP; 19 editais preservados e cobertura pendente. Os 27 testes, incluindo duas execuções em Postgres isolado com respostas controladas, passaram; typecheck e build também.

## Próximos passos

1. Decidir sobre um checkout de teste real no Asaas Sandbox para validar o fluxo de cobrança ponta a ponta
   (oferecido ao owner em 27 set 2026, sem resposta ainda — ação com efeito externo, precisa de aprovação
   explícita mesmo em modo sandbox).
2. Configurar o webhook no painel Asaas apontando para a origem pública + `ASAAS_WEBHOOK_TOKEN`.
3. Rodar a carga nacional de 30 dias do PNCP quando couber. Páginas HTML do FSA (ANCINE, BRDE) ficam para depois.
4. Deploy no Fly.io `gru` (pausado desde 26 set 2026 até a verificação competitiva; a verificação concluiu
   em 27 set 2026 — falta o owner reautorizar o deploy em si).

## Cuidados ativos

- `docker compose restart <serviço>` **não relê o `.env`** — reinicia o processo com o ambiente que o
  container já tinha ao ser criado. Uma variável nova/alterada só entra com `docker compose up -d <serviço>`
  (recria o container; sem `--build` se o código não mudou). Descoberto em 27 set 2026 configurando o
  Asaas: `BILLING_MONTHLY_BRL` só apareceu na API depois do `up -d`, apesar de `docker compose config`
  já mostrar o valor certo.
- Dados do PNCP são publicações oficiais. A interface não serve editais fictícios.
- Valor `0` sem descrição de sigilo vira `not_published`. Sigilo explícito vira `confidential` e o valor não é guardado.
- A API de consulta do PNCP estoura tempo em janelas largas. O coletor pede um dia por vez e, se receber timeout, reparte por UF.
