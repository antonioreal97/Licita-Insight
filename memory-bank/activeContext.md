# Active Context — Licita Insight

Deriva de [productContext](productContext.md), [systemPatterns](systemPatterns.md) e [techContext](techContext.md). Alimenta [progress](progress.md).

## Foco agora

Landing com o pardal em movimento (09 out 2026, branch `feat/pardal-motion`, sem deploy):
pardal 3D ligado à rolagem e dois clipes pré-renderizados com o CLI do HyperFrames (`hyperframes@0.8.140`, via
`pnpm dlx`, nunca instalado como dependência para não puxar Puppeteer/Chrome no Docker e na Vercel). Re-render só
no macOS (HEVC com alfa via VideoToolbox). Detalhes em [progress](progress.md) e
[`design-system/motion.md`](../design-system/motion.md).

Ciclo 14 (02 out 2026, branch `antonioreal97/cycle14` a partir do `main` com o PR #16 mergeado; sem deploy).
Decisão do owner: o Jev continua escolhendo os trechos e decidindo se há evidência; o `gpt-4o-mini` só **redige**
a partir deles. A chave da OpenAI é do owner e ainda não existe; sem ela tudo funciona como antes. Run do Orca
`run_bf86b565bdb1` (Codex, que voltou a subir no Orca; parou uma vez no limite de uso e retomou):
- J `2567865`: resumo no Perguntar ao edital (até 3 frases, citações [n] validadas, cache com a versão do prompt)
  e na ficha (2 a 4 frases, gerado no worker). Falha, timeout, sem chave ou disjuntor aberto → `summary: null`.
  Ledger com `ask_summary`/`sheet_summary`; padrão US$ 0,15/0,60 por MTok (conferido em 02/10/2026).
  Migration `0020_openai_summaries`.
- J2 `b00f34b` (correção pedida na revisão): a J tinha subido `SHEET_PROMPT_VERSION` e posto o modelo do resumo
  na chave da ficha, o que faria o Jev recalcular todas as fichas no deploy e de novo ao ligar a chave. Agora a
  ficha fica na versão 3 com a chave histórica; o resumo tem versão própria e job `sheet_summary` que só chama a
  OpenAI. O custo dele fica fora de `ai_sheet_daily_usage` (teto do Jev) e conta no disjuntor via
  `summary_generated_at`.
- Verificação (minha, além do worker): API 225/225 com banco migrado, frontend 29/29, typecheck OK. Sem QA de
  navegador neste ciclo.
Para ligar: `OPENAI_API_KEY` no `.env` real e no `beta.env` e limite de gasto no projeto da OpenAI. A 0020 ainda
não foi aplicada no banco `licita` local.

Ciclo 13 (30 set 2026, branch `antonioreal97/cycle13` a partir do `main` com o PR #15 mergeado; sem deploy).
Decisões do owner: "Seus prazos" com **uma linha por edital**; link de perfil abrindo em **todos os status**;
na segurança, **só rate limiting agora** (a auditoria detalhada vem depois). Run do Orca `run_6e6f2c351510`:
- F `1ff8761` (Cursor): um item por edital (começa pelo prazo mais próximo e cita o outro na mesma linha;
  limite de 10 conta editais; o assunto continua contando prazos). `profile_new_matches` abre
  `/search?status=all` no e-mail e no app.
- G `54bbc3c` (Claude; o worker não commitou, eu fiz o commit após revisar): toda rota `/api` tem janela.
  Perfis independentes: IA (ask, ask-status, sheet, fit) 60/min por usuário (subiu de 30 porque o polling do
  detalhe faz ~16/min), gravações 60/min, checkout/cancelamento Asaas 5/min, exportação/exclusão 5/hora,
  gravações sem sessão (descadastro) 10/min por IP, e o resto no bucket público. Store em memória com varredura
  e teto `RATE_LIMIT_MAX_ENTRIES`; `RateLimit-Reset` em segundos até o fim da janela, mais `RateLimit-Policy`.
  O store compartilhado entre réplicas continua fora de escopo (uma máquina só). Contrato: `scale-protection-v1.md`.
- I: QA em `docs/reviews/cycle13-qa.md`. API 218/218 em 17 rodadas, frontend 27/27, 47/47 verificações de 429
  e zero 429 na navegação normal. A falha intermitente (1 em 218, vista uma vez por mim) não se reproduziu.
  Candidatos: testes de concorrência com `sleep` em `request-protection.test.ts:174-275`, anteriores ao ciclo.
Pendências baixas: na stack Docker local, anônimos dividem o bucket (sem `TRUST_PROXY`; o beta e o Fly usam
`TRUST_PROXY=1`); o bucket preauth conta também sessões válidas; ai e write anunciam a mesma `RateLimit-Policy`.
Falta confirmar o IP real atrás do túnel (pendência do ciclo 10). O Codex segue sem subir no Orca (SUN_LEN).

Ciclo 12 (29–30 set 2026, branch `antonioreal97/cycle12` a partir do `origin/main` com os PRs #13 e #14 do
ciclo 11 já mergeados; sem deploy). Decisões do owner em 29 set: (1) a auditoria de segurança de 26 set **fica
para depois de novo** ("ainda não"; SEC-01, ingestão sem autenticação, e os demais seguem abertos no código);
(2) a busca passa a abrir em **Abertos** por padrão. Entregue e validado (Run do Orca `run_59d691d015fb`):
- A `b0a5670`: seção "Seus prazos" no resumo diário por e-mail. Entram as etapas Analisando e Preparando
  documentos, com prazo pessoal ou de proposta até o fim do 3º dia em Brasília. Até 10 itens + "e mais N".
  O resumo pode sair só com prazos. Mesmo gate de preferência e acesso (incluindo beta), idempotência diária.
  Se os dois prazos caem na janela, saem duas linhas (escolha a revisar com o owner).
- B `99e3461`: busca abre em `status=open`; "Todos os status" = `status=all`, só na URL (nunca vai para a API
  nem para a busca salva); "Limpar filtros" volta a Abertos. Seletor Palavra-chave/Semântica escondido atrás
  de `SEARCH_MODE_ENABLED=false` (o backend não tem embeddings). Buscas salvas sem status abrem com `status=all`.
- C `3e3c905`: aviso único de trechos automáticos em "Antes de decidir"; próxima ação e prazo antes do
  histórico; Configurações cita os prazos no resumo.
- E `11bb25e`: links de e-mail de busca salva sem status ganham `status=all`.
- D: QA em `docs/reviews/cycle12-qa.md`. API 199/199 + 9/9, frontend 25/25, typecheck, build e
  verify:migrations passaram; Playwright 104/104 em 1440 e 390 px.
Os dois achados baixos do QA foram corrigidos no mesmo PR (#15), a pedido do owner: glob do `pnpm test` da
API entre aspas (os 4 testes da raiz de `src` voltaram a rodar; 208/208 com banco) e aviso de trechos só com a
ficha pronta (não no esqueleto/erro). PR #15 aberto em 30 set 2026; merge é do owner.
Workers: o Codex não sobe pelo Orca (`path must be shorter than SUN_LEN` no socket da conta; o modo auto negou
relançar), então A foi feita por Claude com autorização do owner. O Cursor pediu aprovação para cada comando
de shell (o owner aprovou no terminal dele) e pôs `Co-authored-by: Cursor` no commit, removido com amend.
Stack: API e web desta branch saudáveis em :3001/:24252 (subidas com `--no-deps`). Ao subir, a API tentou a
coleta PNCP diária, que falhou com `fetch failed` e 0 upserts.

28 set 2026 — MVP de participação implementado e ativado na stack Docker local: migration 0019, etapas,
checklist Tenho/Não tenho/Não sei, protocolo declarado, próxima ação/prazo e histórico. P0.6 e P1 conectados
à API; testes de API (184), frontend (16), migrations, typechecks/build e navegador desktop/mobile passaram.
Detalhes em `docs/reviews/participation-implementation-2026-09-28.md` e contrato `participation-v1.md`.
Backend e revisão final pelo coordenador Codex; Cursor gravou a integração, mas parou por erro de conexão.
Stack local agora aponta para este workspace em `http://localhost:24252`; API/web saudáveis, Postgres/volume
preservados. Histórico reconciliado por paridade de schema até 0018; 0019 aplicada e integridade das 26 tabelas
conferida antes/depois. Checksum histórico divergente da 0004 preservado/documentado, sem reescrever o registro.
Backup: `.local/backups/0019-aTSS4o/before-0019.dump`. Reinício usa `.local/compose-activation-0019.yml` e o `.env`
real de `/Users/antonio/CODE/MY/LicitAI/Licita-Insight`, **não** o `.env` de dev deste workspace.
Usar `up -d --no-deps api web` com projeto `licita-insight` e os dois arquivos compose para não executar
`db-setup`/`push-force`. Procedimento completo em `docs/reviews/participation-activation-2026-09-28.md`.
Verificação anônima desktop/mobile passou; timeout externo no coletor Mapas Culturais CE permanece.
Sem deploy Fly, cofre de documentos ou envio oficial.

Ciclo 11 (branch `antonioreal97/cycle11`, sem deploy por decisão do owner): simplificação de UI/UX segundo os
princípios de design da Apple — tipografia maior e sem monoespaçada/caixa-alta nos rótulos, menu e topo sem
jargão, ficha do edital agrupada por pergunta e sem duplicatas, painel e landing enxutos. Relatório em
`docs/reviews/ux-simplification-2026-09-28.md`. Backend reavaliado: as 9 correções de escala de
`docs/architecture-scale.md` estão no código; TypeScript continua a escolha certa (gargalos são I/O de
Postgres, PNCP e Jev, não CPU). Abertos: carga HTTP com 1,5 M de linhas nunca medida, termo comum na busca,
limite de taxa em memória por processo (precisa ser compartilhado quando houver mais de uma réplica da API),
rotas de ingestão sem autenticação.

Ciclo 10 (branch `antonioreal97/cycle10`, commits locais, sem push nem PR): prontidão de deploy
(HANDOFF-021). Decisões do owner em 27–28 set 2026: (1) custo fixo alto sem usuários → Fly enxuto (~US$ 20/mês:
1 máquina `APP_ROLE=all` + Postgres próprio com volume; Managed Postgres só com ~20 assinantes; revisão na
decisão 1 de [`docs/architecture-scale.md`](../docs/architecture-scale.md)); (2) o **lançamento é um beta fechado gratuito no Mac do owner
atrás de Cloudflare Tunnel** ([`docs/ops/beta-local.md`](../docs/ops/beta-local.md)), convidados liberados por `beta_access_grants`
(migration 0018) — o Fly sobe com ~3 usuários ativos. Schema de produção agora só por migrations versionadas
(`0000`–`0018`, `release_command`), com `verify:migrations` como guarda permanente contra divergência
schema × migration. Validação completa em [`docs/reviews/deploy-readiness-2026-09-28.md`](../docs/reviews/deploy-readiness-2026-09-28.md) (180/180 testes).
Pendências: **nome/marca** — o espaço "Licita + IA" está saturado (10+ nomes parecidos; `licitai.com.br` e
`licitaia.com.br` de terceiros; `lioedital.com.br` e `lieditais.com.br` livres em 28 set) e o domínio do beta
depende disso; confirmar o IP real atrás do túnel; autenticação das rotas `/api/v1/ingest/*` (WAF da
Cloudflare mitiga só no beta). Sugestão ao owner ainda sem resposta: próxima feature = documentos da empresa
com validade (o checklist passaria a dizer o que **falta**) e "preço de fundador" R$ 49,90.

Ciclo 9 (PR #11, mergeado): antes do deploy, o owner pediu
verificar se a plataforma é competitiva e entrega o que promete ([`docs/reviews/competitive-analysis-2026-09-27.md`](../docs/reviews/competitive-analysis-2026-09-27.md)).
Achado principal: IA com trecho citado não é mais diferencial exclusivo (Acumi, Licitei já entregam); o
que reforça a competitividade é preço (R$49,90 sem teto de análises) + chamadas culturais. Isso motivou o
checklist automático de habilitação (HANDOFF-020), entregue pelo Codex e validado por mim (backend +
integração do frontend); ver [`docs/reviews/qualification-checklist-2026-09-27.md`](../docs/reviews/qualification-checklist-2026-09-27.md) e a seção correspondente
em [`progress.md`](progress.md). Também neste ciclo: `BILLING_MONTHLY_BRL=49.90` e `ASAAS_API_KEY` configurados e
verificados no `.env` real (ver "Cuidados ativos" abaixo — gotcha de `$` no Docker Compose).

Ciclo 8 (Fases 1b e 2 de escala e custo por usuário, HANDOFFs 018 e 019) e ciclo 7 (Fase 1a, PR #9) com as
decisões do owner de 26 set 2026 ([`docs/architecture-scale.md`](../docs/architecture-scale.md), seção 7) estão no `main`.

018: `APP_ROLE=all|api|worker`, jobs com `pg_try_advisory_lock` + `job_run_audit`, view `ai_usage_ledger` + `report:ai-cost`, faixas interativo/lote no Jev, filtro lexical do fit em modo `shadow`.
019: fila durável `ai_jobs` (a API só enfileira; o worker extrai PDF, calcula fit e ficha; SKIP LOCKED, visibilidade, retentativa), disjuntor `AI_DAILY_BUDGET_USD=10` que pausa só o lote, RPM do Jev por papel, retenção de 90 dias após o prazo (exceto editais salvos; tombstone; valor `expired`), métricas Prometheus em `METRICS_PORT` (não públicas) e [`docs/ops/alerts.md`](../docs/ops/alerts.md). Relatório com a validação independente em [`docs/reviews/queue-budget-metrics.md`](../docs/reviews/queue-budget-metrics.md).
020: checklist automático de habilitação — ver acima.

Pendente/limites: carga HTTP em 1,5 M de linhas não medida (só EXPLAIN; VM do Postgres a 826% de CPU); termo comum na busca sem mitigação; edital sem `proposal_deadline` nunca expira; filtro lexical só liga com ≥ 500 medições e recall ≥ 97% (decisão do owner). Deploy no Fly.io `gru` segue pausado a pedido do owner (não reautorizado desde a pausa de 27 set 2026). Segurança: rotas de ingestão sem autenticação (só limite de 3/min) e relatório do Hermes em `docs/reviews/security-audit-2026-09-26.md` (não commitado, não é meu; owner respondeu "ainda não" ao handoff P0).

Ambiente: o Docker Desktop reinicia sozinho e derruba o stack `licita-insight`; só o container do Postgres é religado à mão. `licita_cycle4` está no esquema atual (migrations até 0015). A conta Codex do owner bateu o limite de uso uma vez e foi trocada; um dispatch antigo do Orca ficou como `release_unknown` (o processo já saiu).

## O que está na mesa

- Postgres local: `docker compose up -d` (container `licita-postgres`, `DATABASE_URL` em `.env` na raiz, gitignored).
- Tabelas `tenders`, `ingest_runs`, `ingest_days`, `cultural_opportunities` e `subscriptions` em `lib/db`. Push: `pnpm --filter @workspace/db run push-force` (subscriptions aplicada no Postgres local em 23 set 2026).
- Billing: `GET/POST /api/v1/me/billing*`, webhook `POST /api/v1/billing/asaas/webhook` (header `asaas-access-token`). Env: `ASAAS_API_KEY`, `ASAAS_API_BASE_URL`, `ASAAS_WEBHOOK_TOKEN`, `BILLING_MONTHLY_BRL`. Contrato em [`docs/contracts/account-v1.md`](../docs/contracts/account-v1.md). Desde 27 set 2026, todas as quatro configuradas e verificadas no `.env` real (`GET /billing/plan` → `{"monthlyBrl":49.9,...}`). O valor do Asaas começa com `$`; no `.env` que o Docker Compose lê via `env_file`, isso só sobrevive entre aspas simples (`ASAAS_API_KEY='$aact_...'`), nunca solto nem escapado com `$$` — Compose interpola `${VAR}` do `.env` do projeto por conta própria, e valores com `$$` chegam com zero `$` no container.
- Coletor PNCP: `pnpm --filter @workspace/api-server run collect:pncp`. n8n pode chamar `POST /api/v1/ingest/pncp` (202) e ler `GET /api/v1/ingest/pncp`.
- Coletor cultural: `pnpm --filter @workspace/api-server run collect:opportunities`. `POST`/`GET /api/v1/ingest/opportunities`. Agenda com a API, desligável com `CULTURE_DAILY_COLLECT=false`. Contrato em [`docs/contracts/opportunities-v1.md`](../docs/contracts/opportunities-v1.md).
- A lista cultural só guarda audiovisual. A busca usa `@keyword` (audiovisual, cinema, filme, documentario); `term:linguagem=EQ(Audiovisual)` quebra as instalações (500 ou HTML). Instalações conhecidas: AP, CE, ES, GO, MA, MT, PA, PB, PE, PI, SE, TO, mais o federal `mapa.cultura.gov.br`. As outras 15 UFs aparecem como lacuna. Coleta de 23 set 2026 gravou 9 chamadas (CE e PE). Federal continua 403 (Cloudflare). AP, MA, MT e TO falham no certificado HTTPS. FSA/BRDE e páginas HTML ficam para o próximo ciclo.
- API lê somente o PostgreSQL. Sem `DATABASE_URL`, a busca responde 503 `SEARCH_UNAVAILABLE`. Não há fixtures em memória.
- Frontend sempre chama a API. A coleta diária sobe com o processo da API e repete às 06:00 em `America/Sao_Paulo` (`PNCP_DAILY_HOUR`, `PNCP_DAILY_COLLECT=false` para desligar).
- Calendário de cobertura aplicado ao Postgres local: coleta incremental pula dias/modalidades/UFs selados, retoma lacunas e revisita hoje. Datas explícitas forçam backfill. A consulta deve começar depois da meia-noite de Brasília para selar o dia anterior.
- `GET /api/v1/ingest/pncp` inclui `coverage`, com dias selados, próximo dia aberto e partições. Detalhes operacionais: [`docs/ingest-pncp-calendar.md`](../docs/ingest-pncp-calendar.md).
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
