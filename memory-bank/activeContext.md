# Active Context — Licita Insight

## Foco agora

Ciclo 8 (branch `antonioreal97/cycle8`, commits locais, sem push nem PR): Fase 1b de escala, custo e isolamento (HANDOFF-018), entregue e validada. Ciclo 7 (Fase 1a, PR #9) está no `main`. Plano completo em `docs/architecture-scale.md`.

Entregue no 018: `APP_ROLE=all|api|worker` (worker com porta de saúde opcional; o serviço `worker` do Compose só sobe com `--profile scale`); ciclos dos jobs protegidos por `pg_try_advisory_lock` + auditoria em `job_run_audit`; view `ai_usage_ledger` e `report:ai-cost` (bate com as tabelas de origem); faixas interativo/lote no cliente Jev (`jev-scheduler.ts`); filtro lexical do fit em modo sombra (`AI_FIT_LEXICAL_GATE=shadow`, `report:fit-gate`). Validado ao vivo com o Jev real: pergunta e fit passam pelo scheduler, espera p95 do interativo 0 ms e do lote 640 ms, desligamento em < 1 s sem travas presas.

Filtro lexical: fica em `shadow`. Na calibração antiga um filtro rígido perdia 3 de 19 alta/média; na amostra nova de 24 editais sem relação cortaria 67% das chamadas com recall 100% (só 3 altos). Ligar (`on`) exige ≥ 500 medições e recall ≥ 97%: decisão do owner.

Fronteira: o trabalho disparado por request (download e extração de PDF, fila do fit, geração da ficha) ainda roda no processo da API; a fila durável que o move para o worker é o HANDOFF-019, que depende de 5 decisões do owner (hospedagem e orçamento, metas de usuários, preço do plano, comportamento no limite de IA, retenção). Segurança: rotas de ingestão ainda sem autenticação (só limite de 3/min) e sem teto global de indexação; o owner respondeu "ainda não" ao handoff de segurança P0; relatório do agente Hermes em `docs/reviews/security-audit-2026-09-26.md` (não commitado).

Ambiente: Docker Desktop reinicia sozinho e derruba o stack `licita-insight`; só o container do Postgres é religado à mão. `licita_cycle4` está com o esquema atual (migrations até 0012) e dados de teste do usuário qa-018.

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
