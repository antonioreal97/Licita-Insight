# CLAUDE_HANDOFF

**ID:** CLAUDE_HANDOFF-021

**Feature:** prontidão de deploy no Fly.io `gru`

**Status:** READY_FOR_CLAUDE

## Resultado

O caminho de produção agora é inteiramente versionado: uma baseline `0000` cria o
schema histórico, o journal registra `0000`–`0017`, a migration `0017` traz a tabela
de assinatura que antes existia apenas via push e o runner JavaScript funciona sem
`tsx` ou devDependencies. `verify:migrations` cria dois bancos descartáveis, roda o
migrador duas vezes em um deles, monta o outro com
`prepare-extensions + push-force + apply-ai-ledger`, compara extensões, relações,
colunas/tipos/defaults/geração, constraints, índices e views e sempre apaga ambos.

A imagem `Dockerfile.prod` é multi-stage Node 24 bookworm-slim/amd64. Ela builda API
e frontend, instala apenas dependências de produção e roda como `node`. O bundle
inclui os workers do pino/thread-stream, `document-extractor.mjs`, políticas de ficha
e checklist, `pdfjs-dist`, migrations, runner e SPA. Não há `tsx` no runtime.

Com `STATIC_DIR`, a API serve a SPA somente nos papéis `api`/`all`: arquivo existente,
fallback de deep link, cache imutável de asset com hash e `index.html` sem cache.
Método não GET, `/api/*` e traversal não entram no fallback. Sem `STATIC_DIR`, o
comportamento de desenvolvimento permanece inalterado.

Pelo adendo do owner, `fly.toml` agora inicia um único processo `app` com
`APP_ROLE=all`, 1 GiB, sem auto-stop, release migration, `TRUST_PROXY=1` e nenhuma
exposição de métricas. O smoke confirmou `role=all`, `schedulers=true`, API e SPA na
mesma máquina. A separação `api`/`worker` continua testada e está documentada como
passo futuro no gatilho de escala.

O PostgreSQL inicial não é Managed: `deploy/fly-db/fly.toml` usa `postgres:16` em app
privado, 1 GiB e volume de 10 GB, sem portas públicas. O job de backup em
`deploy/fly-db/backup/` produz `pg_dump -Fc` e envia a Tigris por Scheduled Machine.
O runbook cobre banco/`pg_trgm`, snapshot + dump externo, restore, segredos/config,
integrações, primeiro deploy, smoke, rollback e o gatilho de migração ao Managed
Postgres. Nenhum comando Fly foi executado e `flyctl` não foi instalado.

## Medições reais

| Medida | Resultado |
|---|---:|
| Imagem final (`docker image inspect .Size`) | 154.547.714 bytes (147,39 MiB), `amd64`, usuário `node` |
| API após smoke | 153,6 MiB RSS |
| Worker após startup/jobs leves | 157,6 MiB RSS |
| Processo `all` após smoke e jobs leves | 158,3 MiB RSS |
| Extrator após PDF gerado de 29 páginas | 89,73 MiB RSS |
| Migration vazia no host (`verify:migrations`) | 326 ms |
| Release runner dentro da imagem, incluindo startup do container | 1,12 s wall |
| Paridade migrate x push | diff vazio |
| Segunda execução do migrate | idempotente |
| Dump custom usado no ensaio de restore | 74.978 bytes |

O PDF real de 29 páginas citado no HANDOFF-012 não está versionado no worktree. Para
manter a prova reproduzível e sem rede, `verify-dist-pdf.mjs` passou a gerar um PDF
válido de 29 páginas e valida a primeira, a última e os 29 chunks dentro da imagem.

## Capacidade e custo

O RSS medido sustenta a escolha inicial de 1 GiB para o processo `all` e 1 GiB para
o PostgreSQL. Pelas taxas do adendo, cada máquina custa US$ 9,33/mês em `gru`; as
duas somam US$ 18,65, e o volume de 10 GB custa US$ 1,50. Os primeiros 10 GB de
snapshots são incluídos. Total fixo inicial: **US$ 20,15/mês**, mais Tigris além da
franquia e centavos da Scheduled Machine. O equivalente com Managed Postgres e app
monolítico seria **US$ 81,33/mês** mais armazenamento gerenciado. O gatilho é cerca
de 20 assinantes ou antes, se indisponibilidade do banco estiver custando clientes.

## Validação

- `pnpm run typecheck`: PASS.
- `PORT=24252 BASE_PATH=/ pnpm run build`: PASS.
- Todos os 8 scripts `verify:*`: PASS.
- `verify:migrations`: PASS, diff vazio, idempotência comprovada.
- Suíte completa com `DATABASE_URL` não exportada e
  `PNCP_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/licita_cycle4`:
  **171 PASS, 0 FAIL**; `dist tender sheet policy: PASS`.
- Teste focado do estático: **1 PASS, 0 FAIL** (root, deep link, asset/cache, API 404,
  método e traversals literal/codificado).
- Teste de proteção HTTP: **13 PASS, 0 FAIL**, incluindo prefixo XFF forjado com um
  único salto de proxy confiável.
- `test:dist-pdf`: PASS, 29 páginas.
- Build `docker build --platform linux/amd64 -f Dockerfile.prod`: PASS.
- Runtime sem `tsx`/devDependencies: PASS.
- Release command na imagem em banco temporário vazio e segunda execução: PASS.
- Smoke da imagem: `/`, `/tenders/PNCP-TEST`, asset/cache, `/api/healthz`,
  `/api/readyz`, `/api/v1/billing/plan`, `/api/x` JSON 404 e saúde do worker: PASS.
- Smoke adicional do papel de produção `all`: SPA/deep link, readiness, billing e
  JSON 404: PASS; 158,3 MiB RSS e `schedulers=true` confirmado no log.
- Imagem amd64 do backup: `pg_dump`, AWS CLI e entrypoint presentes; build PASS.
- Restore local: dump custom de banco temporário migrado, restore em segundo banco,
  sentinel preservado e 26 tabelas públicas verificadas: PASS.
- Containers `licitai-h21-*` e banco `licitai_h21_smoke_ctx2d4340c3`: removidos.
- Bancos de ensaio de backup e volume Docker temporário: removidos.
- Containers do stack `licita-insight-*`: não foram iniciados, parados ou reiniciados.
- Bancos `licita` e `licita_cycle4`: nenhuma escrita fora das suítes isoladas.

O build do frontend mantém os avisos preexistentes de sourcemap e chunk acima de
500 kB; ambos são warnings e o build termina com sucesso.

## Commits

1. `93378a0` — migrations versionadas e guarda de paridade.
2. `c815066` — imagem de produção.
3. `8303bb3` — serving estático da SPA.
4. `11205e2` — processos/checks Fly e teste de XFF forjado.
5. `51d64c9` — adendo do owner: topologia enxuta, banco privado e backup.
6. commit final — runbook, variáveis, prova PDF e este relatório.

## Ações do owner

Antes do primeiro deploy, confirmar os nomes dos três apps, origem/domínio, ambiente
Asaas e preços atuais. Depois executar o runbook, incluindo volume/banco privado,
redirect Google, webhook Asaas, domínio Resend, `pg_trgm`, snapshots, Tigris,
Scheduled Machine de dump e smoke externo.

**Migration required:** YES — somente pelo `release_command` versionado; nunca push.

**Breaking changes:** NO.

**READY_FOR_CLAUDE:** YES.

## Item 6 — Beta local fechado

Implementado `deploy/beta-local/` com Compose independente, volume PostgreSQL próprio,
imagem de produção em `APP_ROLE=all`/`STATIC_DIR`, migração antes do app, restart
`unless-stopped` e túnel oficial Cloudflare opcional por profile, usando token apenas
em `~/.licitai-secrets/cloudflared-beta.env`. O runbook [beta-local](../ops/beta-local.md)
é a primeira etapa de [`deploy-fly.md`](../ops/deploy-fly.md) e documenta OAuth Testing, Resend, grants,
backup/restauração, coleta inicial reduzida e migração posterior para Fly.

`beta_access_grants` possui migration 0018 e permanece independente de Asaas; o comando
`grant:beta-access` oferece grant/revoke/list e o middleware aplica expiração e 402 sem
que webhook/cancelamento alterem o grant. A validação operacional deve registrar no
Mac o tempo/espaço da coleta inicial e executar o dump/restauração antes de convidar
usuários.

> **Nota do coordenador (28 set 2026):** a entrega do item 6 acima não foi aceita como veio (só typecheck;
> sem testes, sem smoke, sem commits). O comando `grant:beta-access` citado foi removido (caía no banco de
> dev); o único caminho é o runner `lib/db/scripts/beta-access.mjs` dentro da imagem. Correções, testes e a
> validação completa estão em [`docs/reviews/deploy-readiness-2026-09-28.md`](../reviews/deploy-readiness-2026-09-28.md).
