# Active Context — Licita Insight

## Foco agora

Ciclo 7 (branch `antonioreal97/cycle7`, commits locais, sem push nem PR): arquitetura de escala e custo por usuário. Diagnóstico e plano em `docs/architecture-scale.md`. Fase 1a (HANDOFF-017) entregue e validada: harness de carga (`scale-*`), índice `pg_trgm` na busca (busca rara em 300k linhas: p95 8.349 → 90 ms, buffers −99%), pool/timeouts/`/readyz`/desligamento limpo, limite de taxa e de concorrência, cache HTTP público com ETag/304, helmet, compressão (`docs/contracts/scale-protection-v1.md`, relatório `docs/reviews/scale-baseline.md`). Limites conhecidos: termo comum (50% da tabela), contagem exata, sugestões e paginação profunda seguem lentos; carga só até 300k linhas; sem CDN real.

Decisões de escala tomadas em 26 set 2026 (`docs/architecture-scale.md`, seção 7): Fly.io `gru` com Managed Postgres Starter, teto de infra US$ 150/mês (Fase 1) e US$ 400/mês (Fase 2); metas de 100 pagantes em 6 meses e 500 em 12; plano a R$ 49,90/mês para ficar bem abaixo da concorrência (margem 59% no pior caso, antes de imposto; reajuste se o custo por assinante passar de R$ 25); no limite de IA pausa só o lote (fit e alerta de perfil), disjuntor de US$ 10/dia no Jev; retenção de trechos/documentos 90 dias após `proposal_deadline`, exceto editais salvos, e `tenders` não expira.

Pendente: Fase 1b (HANDOFF-018: papéis api/worker, ledger de custo de IA por usuário, semáforo do Jev com faixas, filtro lexical no fit), sem bloqueio. Fase 2 (HANDOFF-019: fila durável, disjuntor, métricas) depois da 018, porque o ledger calibra o teto. O harness de carga precisa subir para 1,5 milhão de editais (base projetada em 12 meses). Segurança: o agente Hermes gerou `docs/reviews/security-audit-2026-09-26.md` (não commitado, não decidido pelo owner); confirmei que as rotas de ingestão não têm autenticação (hoje só limite de 3/min) e que a indexação de documentos não tem teto global. O owner respondeu "ainda não" ao handoff de segurança P0.

Ambiente: Docker Desktop e o Postgres do stack `licita-insight` (com `licita_cycle4`) ligados; API e web desse stack desligados.

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
