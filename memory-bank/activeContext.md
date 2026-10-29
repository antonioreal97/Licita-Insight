# Active Context — Licita Insight

Deriva de [productContext](productContext.md), [systemPatterns](systemPatterns.md) e [techContext](techContext.md). Alimenta [progress](progress.md).

## Foco agora (29 out 2026)

Produção: servidor MacBook/Ubuntu (`ssh licita-worker`) atrás da borda Oracle, frontend na Vercel, domínio
`pardaldigital.com`. Em 29/10 01:17 o servidor roda `d79274f` (`ops/macbook-worker`), com a app idêntica ao `main`
`13ba2a6`. Deploy: push no `ops/macbook-worker` → `licita-monitor-deploy.timer` (10 min) → Albert-CLAUDE, que segue
`ops/macbook/monitor/ALBERT.md` e relata na issue #29. Cada merge no `main` vai ao servidor por um PR de sync
`ops/sync-<n>-...` (base `ops/macbook-worker`).

28–29 out 2026:
- Documentos do PNCP: a API do PNCP passou a listar os arquivos com portas internas (`https://pncp.gov.br:560xx/...`),
  que dão timeout de fora; ficha e Perguntar ao edital caíam em "Não conseguimos ler os documentos agora". O #193
  tira a porta (`pncpReachableUrl` em `ingest/pncp-map.ts`) na coleta, no download do índice e nos links da API. O
  #195 usa o link sem porta na impressão digital do índice, para reler os editais que falharam antes do deploy.
  Os dois estão no ar desde 29/10 01:17. Falta o owner confirmar no edital `01665769000191-1-000019-2026`.
- Busca com termo comum (`q=pregao`, ~28% dos editais) responde 500: varredura completa com ordenação de linhas
  inteiras (com `raw_payload`) passa do `statement_timeout` de 15 s. Não é regressão; termos raros usam o índice
  trigram. Proposta do Albert (#29, 29/10 01:05): busca em duas fases (ids, depois linhas), sem `raw_payload` no
  resumo, ranking sobre candidatos ou `tsvector`, contagem estimada. Sem PR ainda.
- Fila de deploy travada: o handoff `20261013-150422.md.steve` nunca recebeu "## Resultado do Codex", então
  `codex_running()` fica verdadeiro e os `.queued` (9 em 29/10) não andam. Com o Albert sem cota, o deploy fica
  parado; em 28/10 foi preciso mandar o pedido ao terminal dele com autorização do owner.

De 15 a 26 out 2026 (PRs #149–#192): recomendações e triagem respeitando o perfil, prontidão para licitar, quadro e
calendário dos editais salvos, glossário interativo, design system "Pardal Digital" (#185), landing editorial e
login em duas partes, remover notificações, T-01/T-02 de segurança (#169), avisos do BID, backup diário verificado
com cópia na Oracle. Detalhes em [progress](progress.md).

Na mesa: issue #170 (MCP para assinantes, Fase 1, leitura com token pessoal); branch `feat/workspaces-phase-1`
(Espaços; Fase 1 só com nova autorização do owner); #41 (migração para `pardaldigital.com`); PR #187 (dependabot).

## Histórico de ciclos

Servidor 24h + frontend na Vercel (05–06 out 2026, branch `ops/macbook-worker`; issue #28 acompanha o passo a passo).
Contexto compactado dos terminais Codex encerrados em 06/10 (sessões "Confira sessões abertas do Codex",
"Verificar busca de contratos", "Report task outcome" no servidor):
- PRs #26 (transparência PNCP: contratos + resultados por item, `/transparencia`, vínculo no edital) e #27
  (coleta de transparência ligada por padrão no Compose) mergeados em 05/10.
- Servidor = MacBook Intel com Ubuntu 24.04, `ssh licita-worker` (chave `~/.ssh/licita_worker_ed25519`, senha
  ainda ativa como contingência; owner deve trocá-la). Clone em `/home/kruid/Documentos/LICITA/Licita-Insight`.
  Roda `compose.macbook.yml` (projeto `licita-macbook`): build de produção, `restart: unless-stopped`, app só em
  `127.0.0.1:24252`, Postgres sem porta (o Postgres nativo do Ubuntu ocupa 5432). Base restaurada do dump
  (145.917 editais / 52.564 contratos / 3 usuários); stack de dev `licita-insight` parada e preservada para rollback.
  `.env` 0600 com OpenAI, Google OAuth, Asaas **sandbox** (R$ 49,90) e as 3 coletas `true`; e-mail desligado.
  Backups em `~/backups/licita/` (dump pré-troca, `.env` de dev, `.env` pré-Vercel, patch do `docker-compose.yml`).
- Túnel: `ngrok-licita.service` (systemd de usuário, `Restart=always`, linger) → `localhost:24252`. Plano free:
  URL aleatória que muda a cada reconexão (caiu 3× em 06/10 por Wi-Fi/DNS); domínio fixo ainda não reservado.
- Frontend público: projeto Vercel `abriu-la` (time `antonios-projects-a309777c`) → https://abriu-la.vercel.app.
  Pacote fora do repo em `~/abriu-la-vercel` (Mac local): `public/` (build Vite com `VITE_API_BASE_URL=/api`),
  `middleware.js` (reescreve `/api/*` para `API_UPSTREAM_ORIGIN` com `ngrok-skip-browser-warning`, sem o qual o
  ngrok free devolve a página de aviso até para JSON) e `vercel.json` (fallback SPA). Env vars na Vercel: só
  `API_UPSTREAM_ORIGIN` e `VITE_API_BASE_URL`; nenhum segredo sai do servidor. Servidor com
  `PUBLIC_APP_ORIGIN=https://abriu-la.vercel.app` e `TRUST_PROXY=2` — login pela URL direta do ngrok não funciona.
- Pendências: owner cadastrar `https://abriu-la.vercel.app/api/v1/auth/google/callback` no OAuth do Google (sem
  isso, `redirect_uri_mismatch`); fixar domínio ngrok ou sincronizar a URL na Vercel; desativar suspensão pela
  tampa; `pg_dump` diário; SEC-01 (`/api/v1/ingest/*` sem auth) agora exposto na internet; header
  `ngrok-agent-ips` expõe o IP público do servidor.
- Lições: um Codex no servidor trocou `PUBLIC_APP_ORIGIN` para `localhost` tentando "corrigir" o login (a causa
  real era o callback não cadastrado no Google) — não mexer nessa variável sem combinar. Dispatch Orca remoto
  (`--on kruid-dev`) perdeu o vínculo com o processo e recusou `ask`/`worker_done`; preferir SSH ou o terminal
  fixo do servidor. Regra do owner: manter poucos terminais fixos (Orchestrator local + "Albert Cloud" no
  servidor) e não abrir novos workers à toa.
- Monitor: `~/licita-monitor` no servidor (código em `ops/macbook/monitor/`). Timer de 5 min sem LLM detecta
  anomalias e aciona o Albert-CLAUDE (Claude Code fixo no Orca do kruid-dev, handle em `config.env`), que
  investiga só em leitura e comenta na issue #29; digest diário 08:00 sem LLM na mesma issue. Primeiro alerta
  (06/10 17:52): coletas `pncp`/`pncp-transparency` órfãs em `running` após recriar o app bloqueiam o próximo
  início (`ingest_runs_one_running`); correção de código sugerida: no boot, marcar `running` anteriores como `failed`.
- Acesso remoto (06/10 noite): Tailscale no servidor (`kruid-dev`, `100.76.192.116`) e no Mac (`100.80.111.80`), mesma
  conta. Alias `licita-worker` → IP Tailscale com `HostKeyAlias 192.168.1.13`. O servidor anuncia a rota
  `192.168.1.13/32` (aprovada no console), então o ambiente Orca `kruid-dev` (`ws://192.168.1.13:6768`) funciona de
  qualquer rede sem repareamento. Orca SSH Host `licita-worker` também aponta para o IP Tailscale. Recomendado:
  reserva de DHCP para `192.168.1.13` no roteador. Sem suspensão: GNOME `sleep-inactive-*=nothing`, logind
  `HandleLidSwitch*=ignore` (`/etc/systemd/logind.conf.d/50-abriu-la-no-suspend.conf`) e sleep/suspend/hibernate
  mascarados (owner rodou o script em 06/10 21:53); falta o teste prático com a tampa fechada.
- **Código não commitado em produção (06/10 20:11):** a pedido do owner, o Albert-CLAUDE implementou no clone do
  servidor a cota de IA de 5 processos/dia por usuário (`ai/tender-quota.ts`, tabela `ai_daily_tenders`, migração
  `0026_ai_daily_tenders.sql`, `JEV_API_KEY` no `.env`, cliente gerado do OpenAPI, painéis de ficha/pergunta) e uma
  correção de documentos; rebuild às 20:07, app no ar às 20:11. A tabela foi criada fora do histórico Drizzle
  (`__drizzle_migrations` segue com 24). Virou o PR #31, mergeado no `main` com o #30 em 06/10 e trazido para
  `ops/macbook-worker`; o servidor ainda roda a imagem de 20:07 (com #31, sem #30) até o próximo deploy.
- Frontend publicado pela Vercel via GitHub (PR #32, 06/10): merge em `main` → produção; `vercel.json` e
  `middleware.js` na raiz (sem mudar configurações do projeto); `ops/vercel/deploy.sh` é plano B; a Vercel usa pnpm 10
  pelo lockfile (não fixar `packageManager` na raiz: o pnpm local/Docker é 11.5.0).
- Painel de admin: Grafana em `ops/macbook/dashboard/` (compose `licita-dashboard`, 256 MB), só em
  `127.0.0.1:8787` e `100.76.192.116:8787`; login `admin`, senhas em `~/licita-monitor/dashboard.env` (0600);
  datasource com papel `licita_readonly` (sem escrita, 5 conexões). Se o Tailscale subir depois do Docker no boot,
  o container não publica a porta — subir de novo o compose.
- Repasse ao Codex: sem cota do Claude, o Albert-CLAUDE grava handoff em `~/licita-monitor/handoff/` e chama
  `licita_monitor.py delegate --handoff`; o monitor roda `codex exec` numa unit `licita-codex-*` só no "O que
  falta" e, quando a cota volta, manda `[validação]` ao Albert-CLAUDE.
- Mac local: Docker da stack antiga parado (6 containers); túnel SSH `127.0.0.1:24252 → licita-worker` ativo
  (processo desanexado) para testar o app do servidor por `localhost`.

Landing com o pardal em movimento (09 out 2026, branch `feat/pardal-motion`, sem deploy):
pardal 3D ligado à rolagem e dois clipes pré-renderizados com o CLI do HyperFrames (`hyperframes@0.8.140`, via

Landing com o pardal em movimento (09 out 2026; PR #69 mergeado, sem deploy). Em seguida, branch
`feat/pardal-aproximacao`: o pássaro se aproxima da câmera a cada fronteira e troca a cor da tela para a da próxima
seção (todas as larguras).
Base do PR #69: pardal 3D ligado à rolagem e dois clipes pré-renderizados com o CLI do HyperFrames (`hyperframes@0.8.140`, via
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

1. Busca com termo comum: PR com a busca em duas fases (proposta do Albert na #29) e medir com `q=pregao` depois das
   05:30, sem a classificação noturna.
2. Destravar a fila de deploy: arquivar os handoffs antigos sem executá-los e corrigir no monitor o handoff do Steve
   que nunca termina (e o envio ao Albert quando a cota volta).
3. Regra de deploy: evitar `app_build` entre 00:00 e 05:30 (classificação noturna); ajustar a janela no `ALBERT.md`.
4. MCP para assinantes (#170), agora que T-01/T-02 entraram.

Anteriores a 15 out 2026, a revisar:

1. Decidir sobre um checkout de teste real no Asaas Sandbox para validar o fluxo de cobrança ponta a ponta
   (oferecido ao owner em 27 set 2026, sem resposta ainda — ação com efeito externo, precisa de aprovação
   explícita mesmo em modo sandbox).
2. Configurar o webhook no painel Asaas apontando para a origem pública + `ASAAS_WEBHOOK_TOKEN`.
3. Rodar a carga nacional de 30 dias do PNCP quando couber. Páginas HTML do FSA (ANCINE, BRDE) ficam para depois.
4. Deploy no Fly.io `gru` (pausado desde 26 set 2026 até a verificação competitiva; a verificação concluiu
   em 27 set 2026 — falta o owner reautorizar o deploy em si).

## Cuidados ativos

- Links de documentos do PNCP podem vir com porta interna (`pncp.gov.br:560xx`), inacessível de fora. Passar
  sempre por `pncpReachableUrl`. O allowlist de hosts confere só o hostname, então a porta passa na validação.
- O índice de documentos só é refeito quando muda o `sourceFingerprint`; "Tentar de novo" na UI é só um novo GET.
  Corrigir a causa de um `failed` gravado não basta: é preciso mudar a impressão digital ou reindexar.
- `statement_timeout` padrão de 15 s (`DB_STATEMENT_TIMEOUT_MS`): consultas da busca com termo comum estouram.
- Reconstruir o app entre 00:00 e 05:30 faz as coletas da subida competirem com a classificação noturna (Ollama);
  em 29/10 a coleta de transparência caiu por timeout.
- Ler logs e o banco de produção é bloqueado para o Orchestrator; pedir ao Albert (somente leitura) ou ao owner.
- `docker compose restart <serviço>` **não relê o `.env`** — reinicia o processo com o ambiente que o
  container já tinha ao ser criado. Uma variável nova/alterada só entra com `docker compose up -d <serviço>`
  (recria o container; sem `--build` se o código não mudou). Descoberto em 27 set 2026 configurando o
  Asaas: `BILLING_MONTHLY_BRL` só apareceu na API depois do `up -d`, apesar de `docker compose config`
  já mostrar o valor certo.
- Dados do PNCP são publicações oficiais. A interface não serve editais fictícios.
- Valor `0` sem descrição de sigilo vira `not_published`. Sigilo explícito vira `confidential` e o valor não é guardado.
- A API de consulta do PNCP estoura tempo em janelas largas. O coletor pede um dia por vez e, se receber timeout, reparte por UF.
