```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-021

Feature: prontidão de deploy no Fly.io `gru` — caminho de migração seguro para produção, imagem de
  produção, frontend estático servido pela API (mesma origem), fly.toml com api + worker, runbook.
  NÃO inclui provisionar nada no Fly: não há conta/CLI nesta máquina; isso é do owner, pelo runbook.

Priority: P0 (bloqueia o primeiro deploy). Branch: antonioreal97/cycle10 (sobre main 32b4245).
Decisões já tomadas pelo owner: docs/architecture-scale.md, seção 7 (Fly.io gru, api + worker da mesma
imagem, Managed Postgres Starter, frontend na mesma origem da API, teto US$ 150/mês na Fase 1).

Leia antes: docs/architecture-scale.md (seções 7 e 8), docker-compose.yml, Dockerfile,
artifacts/api-server/src/app.ts e index.ts (papéis, TRUST_PROXY, desligamento), lib/db/package.json,
lib/db/src/migrate.ts, lib/db/scripts/*.ts, docs/contracts/account-v1.md (cookie e Origin).

Sondagem do orquestrador (27 set 2026, dois bancos vazios temporários, já apagados):
  - `prepare-extensions` + `push-force` num banco vazio: OK. É assim que todo banco foi montado até hoje
    (Compose `db-setup`).
  - `migrate` (drizzle-orm migrator, lib/db/src/migrate.ts) num banco vazio: FALHA na 0001 com
    `relation "public.tenders" does not exist`. Motivos:
      1. não existe migration baseline: as tabelas anteriores à 0001 (tenders, ingest_runs, ingest_days,
         cultural_opportunities, …) só existem via push;
      2. `migrations/meta/_journal.json` registra só 0001–0009; os arquivos 0010–0016 existem mas o
         migrador nunca os aplicaria;
      3. a view `ai_usage_ledger` é criada por `scripts/apply-ai-ledger.ts` depois do push, fora de
         qualquer migration aplicável; `pg_trgm` vem de `scripts/prepare-extensions.ts`.
  Consequência: hoje o único caminho de schema é `drizzle-kit push --force`, que em produção aprova
  sozinho comandos com perda de dados (drop/alter de coluna). Isso não pode rodar contra o banco de
  produção.

1. Migrations versionadas como o único caminho de produção (P0)
   - Faça `migrate` num banco VAZIO produzir exatamente o mesmo schema que `prepare-extensions` +
     `push-force` + `apply-ai-ledger` (tabelas, colunas, tipos, defaults, índices — inclusive trigrama e
     tsvector —, constraints, views, extensões). Como chegar lá é decisão sua (baseline `0000`
     regenerada a partir do schema atual + journal completo até 0016 é o caminho óbvio); preserve o
     histórico dos arquivos 0001–0016 se possível, sem editar migrations já aplicadas em algum lugar sem
     registrar o porquê.
   - Novo `pnpm --dir lib/db run verify:migrations`: cria dois bancos temporários, aplica migrate num e
     prepare-extensions + push-force + apply-ai-ledger no outro, compara `pg_dump --schema-only`
     normalizado (ou consulta equivalente ao catálogo) e FALHA em qualquer diferença, imprimindo o diff.
     Também roda `migrate` duas vezes (idempotência) e apaga os bancos no fim, inclusive em falha. Este
     script passa a ser a guarda permanente da classe de bug "schema x migration divergentes" que já
     apareceu 4 vezes (search_vector, ai_jobs, purged_at, qualification_checklist).
   - O runner de migração precisa rodar dentro da imagem de produção sem devDependencies nem tsx
     (compile, ou use o runner do drizzle-orm a partir de um .mjs), com a pasta de migrations incluída.
   - Produção nunca roda push/push-force. O dev (Compose `db-setup`) pode continuar com push-force; o
     verify:migrations garante que os dois caminhos não se afastam. Documente a regra "toda mudança de
     schema entra com migration registrada no journal" em docs/ops/deploy-fly.md.
   - Não é preciso migrar os bancos locais existentes (`licita`, `licita_cycle4`) para o journal; o banco
     de produção nasce vazio.

2. Imagem de produção (novo `Dockerfile.prod`; o `Dockerfile` de dev e o docker-compose.yml ficam como estão)
   - Multi-stage, `linux/amd64`, node 24 bookworm-slim como o dev. Estágio de build: install com lockfile
     congelado, gera libs, `build` da API (build.mjs) e build do frontend com `BASE_PATH=/`,
     `VITE_API_BASE_URL=/api` e um `PORT` qualquer (o vite.config.ts exige PORT até no build; NÃO altere
     o frontend). Estágio final: só dependências de produção, `dist/` da API, `dist/` do frontend,
     migrations e o runner; usuário não-root; `NODE_ENV=production`.
   - Regressões já conhecidas que o build de produção NÃO pode reintroduzir: worker do pdfjs ausente no
     `dist/` (HANDOFF-012), `document-extractor.mjs`, workers do pino (`pino-worker.mjs`,
     `pino-file.mjs`), `qualification-checklist-policy.mjs` e os demais testes pelo dist/ já existentes.
     Prove que a extração de PDF funciona DENTRO da imagem final (um PDF de teste já versionado ou gerado
     no teste; sem chamar o Jev).
   - Overrides de binários nativos do pnpm-workspace.yaml são linux-x64: a imagem amd64 deve funcionar;
     não mexa nos overrides para o macOS.

3. Frontend estático servido pela API (mesma origem — cookie `licita_session` e checagem de Origin)
   - Ligado só quando `STATIC_DIR` estiver definido e só nos papéis `api`/`all` (nunca no `worker`).
     Sem `STATIC_DIR`, nada muda no dev.
   - `GET` fora de `/api` serve o arquivo se existir; senão `index.html` (fallback de SPA, para deep links
     como `/tenders/:id`). `/api/*` inexistente continua 404 em JSON, nunca index.html.
   - Cache: assets com hash `public, max-age=31536000, immutable`; `index.html` `no-cache`. Não mexa no
     cache/ETag das rotas da API (HANDOFF-017).
   - Testes: deep link, asset, `/api/x` inexistente, método não-GET fora de /api, path traversal
     (`/../`, encoded) não sai de STATIC_DIR.

4. fly.toml (app name placeholder `licitai`, owner confirma; `primary_region = "gru"`)
   - `[processes]`: `api` (APP_ROLE=api, STATIC_DIR) e `worker` (APP_ROLE=worker, WORKER_HEALTH_PORT).
     `[http_service]` só no `api`, `force_https = true`, sem parar a última máquina do api
     (`min_machines_running = 1`). Checks: `/api/readyz` no api; `/api/healthz` na porta de saúde do worker.
   - `release_command`: o runner de migração do item 1 (nunca push).
   - `TRUST_PROXY`: valor correto para o proxy do Fly. Teste que um `X-Forwarded-For` forjado pelo cliente
     NÃO muda a chave do limite de taxa por IP (a mesma classe do cookie forjado corrigida no ciclo 7).
   - `METRICS_PORT` nunca exposto publicamente.
   - Tamanho das máquinas: proponha api e worker com base em RSS medido localmente (worker extraindo o PDF
     real de 29 páginas usado no HANDOFF-012, se ainda disponível), dentro do teto de US$ 150/mês com o
     Managed Postgres Starter (US$ 72). Registre a conta no CLAUDE_HANDOFF.
   - Coleta PNCP/cultural só no worker (confirme que o papel `api` não agenda nada) e o que acontece a
     cada deploy (o worker reinicia e coleta ao subir; o calendário `ingest_days` deve pular dias selados).

5. Runbook `docs/ops/deploy-fly.md` (para o owner executar; em português)
   - Passo a passo: instalar flyctl, `fly auth login`, criar o app, criar o Managed Postgres (gru,
     Starter), conectar `DATABASE_URL`, confirmar `create extension pg_trgm` no cluster (a seção 7 pede
     isso antes de migrar), importar segredos com `fly secrets import` a partir de um arquivo local
     nunca versionado, primeiro deploy, smoke test, rollback (`fly releases` / imagem anterior) e backup.
   - Lista completa de variáveis de produção, separando segredo x config, com o valor esperado de cada
     config (NODE_ENV=production, PUBLIC_APP_ORIGIN=https://<origem>, TRUST_PROXY, STATIC_DIR, papéis…).
     `AUTH_DEV_LOGIN` e `BILLING_DEV_ENTITLED` ausentes (já são ignorados em produção; diga isso).
   - Passos externos que só o owner faz, cada um com o valor exato: redirect URI do Google OAuth para a
     origem de produção; URL do webhook no painel do Asaas + `ASAAS_WEBHOOK_TOKEN`; domínio verificado no
     Resend (com `onboarding@resend.dev` o Resend só entrega para o e-mail da própria conta — não serve
     para usuários reais); chave do Asaas sandbox x produção (decisão do owner; hoje o `.env` local usa
     sandbox). Valor do Asaas começa com `$`: via `fly secrets` não há interpolação, mas avise.
   - Atualize `.env.example` só com variáveis novas/faltantes (NODE_ENV, CULTURE_DAILY_COLLECT,
     STATIC_DIR, …), sem valores reais.

ADENDO (27 set 2026, decisão do owner, substitui o Managed Postgres nos itens 4 e 5):
  Começar enxuto até ~20 assinantes; o Managed Postgres (US$ 72/mês) só entra no gatilho.
  Preços conferidos em docs.fly.io/about/pricing: shared CPU US$ 0,00000075/s, RAM extra
  US$ 0,00000193/GB·s, gru = 1,615× a base, volume US$ 0,15/GB·mês, snapshot US$ 0,08/GB·mês com os
  primeiros 10 GB grátis. Topologia inicial (~US$ 20/mês):
  - App `licitai`: UM processo `app` com APP_ROLE=all (API + agendadores + fila) numa shared-cpu-1x de
    1 GB, STATIC_DIR ligado, `min_machines_running = 1`, sem auto-stop (os agendadores precisam rodar).
    Mantenha no fly.toml, comentado ou documentado, como separar em `api` + `worker` depois.
  - App separado de banco (ex. `licitai-db`): `postgres:16` oficial numa shared-cpu-1x de 1 GB com
    volume de 10 GB, só na rede privada do Fly (`.flycast`/`.internal`, nunca IP público), com
    `pg_trgm` criado. Entregue a config (fly.toml próprio em `deploy/fly-db/` ou equivalente) e o passo a
    passo no runbook.
  - Backup: snapshots diários do volume (confirme na doc do Fly a retenção padrão e como aumentar) MAIS um
    `pg_dump` noturno para fora da máquina do banco. Proponha o destino mais barato e simples (ex. Tigris
    no próprio Fly) e implemente como job agendado ou máquina agendada; o restore precisa estar descrito e
    testado localmente a partir de um dump real do banco temporário.
  - Gatilho documentado para migrar ao Managed Postgres (~20 assinantes ou quedas do banco custando
    clientes) com o procedimento pg_dump/restore e a janela de manutenção esperada.
  - A conta de custo no runbook e no CLAUDE_HANDOFF é a desta topologia, com a do Managed Postgres ao lado
    para comparação.

ADENDO 2 (27 set 2026, decisão do owner — muda o LANÇAMENTO; o Fly enxuto vira o passo seguinte):
  O lançamento é um beta fechado, SEM cobrança, rodando no Mac do owner (Apple Silicon, Docker Desktop,
  imagem linux/amd64 sob emulação como o dev já roda) exposto por Cloudflare Tunnel com domínio próprio.
  3–5 convidados; o Fly enxuto sobe quando houver ~3 usuários ativos. Prioridade agora: itens 1, 2, 3 e
  este item 6. Itens 4 e 5 (Fly) continuam, sem polimento extra.

6. Beta local atrás do Cloudflare Tunnel
   - Novo `deploy/beta-local/` (compose próprio, nome de projeto próprio, ex. `licitai-beta`): Postgres 16
     com volume PRÓPRIO (dados de clientes nunca no banco de dev `licita` nem nos de teste), a imagem do
     Dockerfile.prod com APP_ROLE=all + STATIC_DIR, release (migrate) antes do app, e o container oficial
     `cloudflare/cloudflared` rodando um túnel nomeado por token (o token é segredo do owner, vem de um
     arquivo env local nunca versionado; não crie túnel, não chame a Cloudflare). `restart:
     unless-stopped` em tudo. NENHUMA porta publicada no host que colida com o stack de dev (5432, 3001,
     24252); de preferência nenhuma, ou só em 127.0.0.1 para administração. Os dois stacks precisam rodar
     ao mesmo tempo sem se tocar.
   - TRUST_PROXY correto para Cloudflare → cloudflared → app, com o mesmo teste de XFF forjado do item 4
     (o cliente não pode escolher a chave do limite de taxa). PUBLIC_APP_ORIGIN = https://<domínio do owner>.
   - Acesso do beta sem cobrança: o teste grátis é fixo em 7 dias (`TRIAL_DAYS`). Crie um comando de
     operador (ex. `pnpm --filter @workspace/api-server run grant:beta-access -- --email <e> --until
     <data>`) que libera as funções pagas até a data, distinguível de uma assinatura Asaas (o webhook e o
     cancelamento do Asaas não podem apagar nem estender isso por engano), com revogação e listagem.
     Testes: acesso liberado até a data, 402 depois, não interfere num usuário com assinatura Asaas.
   - Backup: `pg_dump` noturno do banco do beta para uma pasta do Mac configurável (o owner aponta para
     uma pasta sincronizada fora da máquina), com retenção, e restore descrito e testado localmente.
   - Carga inicial: o banco do beta nasce vazio. Documente o que a coleta faz na primeira subida (quantos
     dias, UFs, tempo e espaço medidos localmente num banco temporário), e como fazer uma carga inicial
     menor se a nacional for pesada demais para o Mac.
   - Runbook: a PRIMEIRA seção de docs/ops/deploy-fly.md (ou docs/ops/beta-local.md, apontado pelo
     primeiro) é o beta: domínio na Cloudflare, criar o túnel nomeado no painel e pegar o token, redirect
     URI do Google para https://<domínio>/api/v1/auth/google/callback (app do Google em modo "Testing" com
     os convidados como test users), Resend com o domínio verificado, manter o Mac acordado
     (caffeinate/ajustes de energia; o Docker Desktop já reiniciou sozinho neste projeto — "start on
     login" e `restart: unless-stopped`), como liberar acesso a um convidado, como fazer e restaurar
     backup, e como migrar os dados do beta para o Fly depois (pg_dump/restore).
   - Validação: suba o stack do beta com um banco temporário e SEM o cloudflared (ou com ele desligado,
     já que não há token), prove que convive com o stack de dev rodando, smoke test igual ao do item 2
     batendo no app pela rede do compose, backup + restore, e grant/revoke do acesso beta.

Validação local obrigatória (sem Fly):
  - `docker build -f Dockerfile.prod` (amd64) e `docker run` da imagem contra um banco TEMPORÁRIO no
    Postgres local (crie e apague você mesmo; nome distinto de licita/licita_cycle4), rodando primeiro o
    release_command e depois os dois papéis. Smoke: `/` e `/tenders/<id>` devolvem index.html, asset com
    header de cache, `/api/healthz`, `/api/readyz`, `/api/v1/billing/plan` em JSON, `/api/x` 404 JSON,
    worker saudável na porta de saúde, extração de PDF dentro da imagem.
  - typecheck, build, verify:migrations, os verify:* existentes e a suíte completa com
    PNCP_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/licita_cycle4 (schema isolado, com
    DATABASE_URL NÃO exportado).

Acceptance criteria:
  - verify:migrations passa (migrate == push num banco vazio; migrate idempotente).
  - Imagem de produção sobe os dois papéis a partir do release_command, sem devDependencies nem tsx.
  - Testes do servidor estático (item 3) e do XFF forjado (item 4).
  - Runbook completo, com a conta de custo mensal.
  - CLAUDE_HANDOFF com números reais (tamanho da imagem, RSS, tempo de migrate, diff vazio).

Ambiente: Postgres do Compose em localhost:5432 (licita/licita). NÃO escreva em "licita" nem em
"licita_cycle4" fora das suítes com schema isolado. NÃO pare/reinicie/suba os containers do stack
`licita-insight` (api, web, postgres); containers seus, temporários e com nome próprio, podem subir e
devem ser removidos no fim. Não instale flyctl nem faça chamadas ao Fly. Não leia nem imprima valores de
segredos: o .env do worktree, o .env em /Users/antonio/CODE/MY/LicitAI/Licita-Insight, o .gitignore
(alteração local do owner) e docs/reviews/security-audit-2026-09-26.md (outro agente) não são seus.

Ownership: Dockerfile.prod (novo), fly.toml (novo), .dockerignore, artifacts/api-server/**, lib/db/**,
docs/ops/deploy-fly.md (novo), .env.example (só variáveis novas),
docs/handoffs/CLAUDE_HANDOFF-021-deploy-readiness.md. NÃO edite artifacts/licitainsight/**, Dockerfile,
docker-compose.yml, pnpm-workspace.yaml.
Processo: commite só seus paths (`git commit -- <paths>`), um commit por item, sem push.
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-021-deploy-readiness.md.
```
