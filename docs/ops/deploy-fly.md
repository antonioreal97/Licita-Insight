# Beta local (primeiro lançamento)

O lançamento inicial é o beta fechado no Mac do owner via Cloudflare Tunnel. Siga o [runbook do beta local](beta-local.md) antes desta etapa Fly; ele cobre OAuth, convidados e backup/restauração.

# Deploy de produção no Fly.io

Este runbook prepara o lançamento enxuto do Pardal Digital em `gru`: um app monolítico
`APP_ROLE=all` e um PostgreSQL 16 próprio, privado, em outro app. O nome `licitai`
em `fly.toml` e `licitai-db` em `deploy/fly-db/fly.toml` são placeholders; o owner
deve confirmar os nomes e a origem pública antes de executar os comandos.

## Topologia inicial e regra de schema

- `licitai`: uma `shared-cpu-1x` de 1 GiB, sem auto-stop, servindo API + SPA e
  executando agendadores/fila no papel `all`;
- `licitai-db`: PostgreSQL oficial `postgres:16`, `shared-cpu-1x` de 1 GiB, volume
  `pg_data` de 10 GB e somente rede privada da organização Fly;
- backup: snapshot diário do volume e `pg_dump -Fc` diário para Tigris por uma
  Scheduled Machine separada.

O release executa `node /app/lib/db/scripts/migrate.mjs`. Produção nunca executa
`drizzle-kit push` ou `push-force`. Toda mudança de schema deve ter um arquivo em
`lib/db/migrations/` e uma entrada em `lib/db/migrations/meta/_journal.json`. Antes
de mergear, rode `pnpm --dir lib/db run verify:migrations`, que compara o caminho
versionado ao schema Drizzle em bancos descartáveis e prova idempotência.

## 1. Ferramentas e apps

```sh
brew install flyctl
fly auth login
fly apps create licitai --org <organizacao>
fly apps create licitai-db --org <organizacao>
fly apps create licitai-db-backup --org <organizacao>
```

Os três apps precisam estar na mesma organização para compartilhar a rede privada.
Atualize os campos `app` dos dois TOMLs se os nomes mudarem. Use sempre
`https://<app>.fly.dev` ou o domínio customizado definitivo como
`PUBLIC_APP_ORIGIN`, sem barra final.

## 2. PostgreSQL privado com volume

Crie o volume antes do primeiro deploy do banco:

```sh
fly volumes create pg_data --app licitai-db --region gru --size 10
```

Gere usuário e senha exclusivos. Grave `POSTGRES_USER`, `POSTGRES_PASSWORD` e
`POSTGRES_DB=licitai` como segredos do app do banco; nunca passe a senha em um
argumento que fique no histórico:

```sh
fly secrets import --app licitai-db < ~/.licitai-secrets/postgres.env
fly deploy --app licitai-db --config deploy/fly-db/fly.toml --ha=false
fly status --app licitai-db
fly checks list --app licitai-db
```

O arquivo local (`~/.licitai-secrets/postgres.env`, fora do repositório) deve ter modo `0600`, não usar `export` e nunca ser versionado. O
TOML não declara `services.ports`, portanto não há listener público; o app Pardal Digital
conecta diretamente a `licitai-db.internal:5432` pela rede 6PN. Não crie IPv4/IPv6
público para o banco.

Abra um console privado a partir de uma máquina na organização (ou proxy WireGuard
do Fly) e confirme a extensão antes da primeira migration:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';
```

O resultado deve ter exatamente uma linha. Monte `DATABASE_URL` com usuário/senha
URL-encoded e host `licitai-db.internal`, importe-a como segredo **somente** nos apps
`licitai` e `licitai-db-backup` e nunca imprima seu valor.

## 3. Configuração e segredos da aplicação

Crie `~/.licitai-secrets/production.env` (fora do repositório, para nunca entrar num commit), modo `0600`, uma linha por
segredo, sem `export`. Importe por stdin:

```sh
mkdir -p ~/.licitai-secrets && chmod 700 ~/.licitai-secrets
chmod 600 ~/.licitai-secrets/production.env
fly secrets import --app licitai < ~/.licitai-secrets/production.env
```

Um valor do Asaas que começa com `$` entra literalmente nesse arquivo: o
redirecionamento não expande seu conteúdo. Não use
`fly secrets set ASAAS_API_KEY=$valor`.

### Segredos obrigatórios

| Variável | Valor esperado |
|---|---|
| `DATABASE_URL` | URL privada de `licitai-db.internal:5432/licitai` |
| `GOOGLE_CLIENT_SECRET` | segredo OAuth Web de produção |
| `SESSION_SECRET` | aleatório, pelo menos 32 caracteres |
| `ASAAS_API_KEY` | chave sandbox ou produção, decisão explícita do owner |
| `ASAAS_WEBHOOK_TOKEN` | token aleatório igual ao painel Asaas |
| `JEV_API_KEY` | chave de produção do Jev |
| `RESEND_API_KEY` | chave do domínio de produção no Resend |
| `EMAIL_UNSUBSCRIBE_SECRET` | aleatório estável, pelo menos 32 caracteres |

### Configuração obrigatória

| Variável | Valor esperado |
|---|---|
| `NODE_ENV` | `production` (já em `fly.toml`) |
| `PUBLIC_APP_ORIGIN` | `https://<origem-final>`, sem barra final |
| `GOOGLE_CLIENT_ID` | client ID OAuth Web de produção |
| `TRUST_PROXY` | `1`; somente o salto mais próximo do `fly-proxy` |
| `PORT` | `3001` |
| `APP_ROLE` | `all`, no comando do processo `app` |
| `STATIC_DIR` | `/app/artifacts/licitainsight/dist/public`, no processo `app` |
| `ASAAS_API_BASE_URL` | sandbox `https://api-sandbox.asaas.com/v3` ou produção `https://api.asaas.com/v3` |
| `BILLING_MONTHLY_BRL` | `49.90` |
| `MAIL_FROM` | remetente no domínio verificado, ex. `Pardal Digital <alertas@dominio>` |
| `MAIL_REPLY_TO` | endereço de suporte |
| `PNCP_DAILY_COLLECT` | `true` |
| `CULTURE_DAILY_COLLECT` | `true` |
| `EMAIL_JOBS_ENABLED` | `true` |
| `AI_FIT_LEXICAL_GATE` | `shadow` |
| `AI_DAILY_BUDGET_USD` | `10` |
| `DB_APPLICATION_NAME` | `licitai` |

```sh
fly secrets set --app licitai \
  PUBLIC_APP_ORIGIN=https://<origem-final> \
  GOOGLE_CLIENT_ID=<client-id> \
  ASAAS_API_BASE_URL=https://api.asaas.com/v3 \
  BILLING_MONTHLY_BRL=49.90 \
  MAIL_FROM='Pardal Digital <alertas@dominio>' \
  MAIL_REPLY_TO=suporte@dominio \
  PNCP_DAILY_COLLECT=true \
  CULTURE_DAILY_COLLECT=true \
  EMAIL_JOBS_ENABLED=true \
  AI_FIT_LEXICAL_GATE=shadow \
  AI_DAILY_BUDGET_USD=10 \
  DB_APPLICATION_NAME=licitai
```

Revise, mas normalmente mantenha os defaults de `.env.example`: `DB_POOL_*`,
`DB_*TIMEOUT*`, `RATE_LIMIT_*`, `MAX_INFLIGHT_*`, `REQUEST_*`, `HTTP_*`,
`SHUTDOWN_TIMEOUT_MS`, `GOOGLE_HTTP_TIMEOUT_MS`, `ASAAS_HTTP_TIMEOUT_MS`,
`RESEND_HTTP_TIMEOUT_MS`, `PNCP_DAILY_HOUR=6`, lookbacks/delays das coletas,
`JEV_*`, limites `AI_*`, concorrências `WORKER_*`, `EMAIL_DIGEST_HOUR=7`,
`EMAIL_IMMEDIATE_WINDOW_MINUTES=10`, `SAVED_SEARCH_JOB_INTERVAL_MINUTES=15` e
`LOG_LEVEL=info`.

`METRICS_PORT` fica ausente até existir scraping privado e nunca entra em
`http_service` ou `services.ports`. `PNCP_FROM`, `PNCP_TO`, `PNCP_MODALITIES` e
`PNCP_UF` ficam ausentes na rotina. Variáveis `*_TEST_DATABASE_URL` e
`TEST_OUTBOUND_TIMEOUT_MS` são apenas de teste. `AUTH_DEV_LOGIN` e
`BILLING_DEV_ENTITLED` devem ficar ausentes; o código também as ignora em produção.

## 4. Configuração externa

1. Google Cloud OAuth Web: adicionar exatamente
   `https://<origem-final>/api/v1/auth/google/callback`.
2. Asaas: escolher sandbox ou produção e usar chave/base coerentes; cadastrar
   exatamente `https://<origem-final>/api/v1/billing/asaas/webhook` com o mesmo
   `ASAAS_WEBHOOK_TOKEN` importado.
3. Resend: verificar o domínio, publicar DNS e usá-lo em `MAIL_FROM`.
   `onboarding@resend.dev` só entrega para o e-mail da conta e não serve usuários.
   Manter tracking de abertura/clique desligado.
4. Domínio customizado: terminar a verificação antes de trocar origem, redirect e
   webhook.

## 5. Backup em duas camadas

### Snapshot do volume

Confirme no dashboard/CLI do Fly que snapshots diários estão ativos para `pg_data`.
Antes do lançamento, consulte a documentação da versão atual do Fly para confirmar a
retenção padrão e aumentá-la se ela não cobrir a janela operacional desejada. Os
primeiros 10 GB de snapshots estão incluídos; snapshot não substitui dump lógico.

### `pg_dump` noturno fora da máquina do banco

Crie/associe um bucket Tigris ao app `licitai-db-backup` pelo dashboard ou
`fly storage create`. O attach deve fornecer `BUCKET_NAME`,
`AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY`. Importe também
a mesma `DATABASE_URL` privada. A imagem em `deploy/fly-db/backup/` usa
`pg_dump -Fc` e envia diretamente ao endpoint S3, sem arquivo local persistente.

Crie uma Scheduled Machine diária (o horário exato dentro da janela é escolhido pelo
Fly) e sem restart:

```sh
fly machine run . \
  --app licitai-db-backup \
  --name nightly-pg-dump \
  --region gru \
  --dockerfile deploy/fly-db/backup/Dockerfile \
  --schedule daily \
  --restart no \
  --vm-cpu-kind shared \
  --vm-cpus 1 \
  --vm-memory 256
```

Confirme no primeiro dia que existe um objeto
`postgres/licitai-YYYYMMDDTHHMMSSZ.dump`, tamanho não zero, e configure uma regra de
lifecycle no Tigris (30 dumps diários é o ponto inicial). Alerta operacional: ausência
de objeto por mais de 26 horas é falha de backup.

Teste de restore trimestral, sempre em banco descartável:

```sh
createdb licitai_restore_test
pg_restore --dbname=licitai_restore_test --clean --if-exists --no-owner backup.dump
psql --dbname=licitai_restore_test -c 'select count(*) from tenders;'
dropdb licitai_restore_test
```

Baixe o objeto sem expor credenciais, valide o checksum/tamanho e teste login, busca
e contagens. Nunca restaure sobre produção para ensaiar. Neste handoff o mesmo fluxo
foi testado localmente com `postgres:16`, dump custom de um banco temporário migrado,
restore em outro banco e verificação de dados.

## 6. Primeiro deploy e smoke

```sh
fly config validate --app licitai
fly deploy --app licitai
fly status --app licitai
fly checks list --app licitai
```

O deploy só segue após o `release_command` terminar com zero. O log deve mostrar
`role=all`, `schedulers=true` e API na porta 3001. Como a única máquina reinicia a
cada deploy, PNCP/cultural tentam coletar no startup; `ingest_days` pula partições
seladas e advisory locks impedem duplicação. A máquina nunca pode auto-parar, pois
os agendadores residem nela.

```sh
curl -fsS https://<origem-final>/api/healthz
curl -fsS https://<origem-final>/api/readyz
curl -fsS https://<origem-final>/api/v1/billing/plan
curl -fsS https://<origem-final>/ | grep '<title>Pardal Digital</title>'
curl -fsS https://<origem-final>/tenders/teste | grep '<title>Pardal Digital</title>'
curl -sS -o /dev/null -w '%{http_code}\n' https://<origem-final>/api/x
```

O último status deve ser `404` JSON. No navegador, teste login Google, cookie
HttpOnly `licita_session`, busca, detalhe e oportunidade. Faça cobrança apenas no
ambiente Asaas escolhido.

## 7. Rollback

```sh
fly releases --app licitai
fly image show --app licitai
fly deploy --app licitai --image registry.fly.io/licitai@sha256:<digest-anterior>
fly checks list --app licitai
```

Rollback de imagem não desfaz schema. Migrations devem manter compatibilidade com a
versão anterior durante rollout. Se o release falhar, corrija a migration e publique
outra; nunca use `push-force`, apague `drizzle.__drizzle_migrations` ou marque linhas
manualmente. Mudança destrutiva usa expand/contract.

Para falha do banco: pare escritas, preserve o volume, tente restaurar snapshot em
volume/app novo e, se necessário, restaure o último dump Tigris com `pg_restore`.
Valide integridade antes de trocar `DATABASE_URL`; preserve a origem até terminar.

## 8. Gatilho para separar processos e migrar o banco

Reavalie ao chegar a aproximadamente 20 assinantes, antes se extração/coleta afetar
p95 HTTP, se houver OOM, ou se indisponibilidade do banco custar clientes.

Primeiro separe processos da mesma imagem:

- `api`: `APP_ROLE=api`, `STATIC_DIR`, porta 3001, 512 MiB;
- `worker`: `APP_ROLE=worker`, `WORKER_HEALTH_PORT=3002`, 1 GiB e check privado;
- mantenha uma API mínima ligada e nunca exponha métricas/worker publicamente.

Para Managed Postgres, anuncie 30–60 minutos de manutenção, pause escritas e jobs,
faça dump final `pg_dump -Fc`, crie/associe o cluster em `gru`, confirme `pg_trgm`,
restaure com `pg_restore --no-owner`, rode o migrador idempotente, valide contagens e
smokes e então troque `DATABASE_URL`. Preserve o banco próprio em modo somente leitura
até validar. Volte à URL anterior se a validação falhar antes de retomar escritas.

## Capacidade e custo

Medições locais: API 153,6 MiB RSS, worker 157,6 MiB e extração de PDF gerado de 29
páginas 89,73 MiB isolada. O monólito recebe 1 GiB para cobrir a soma/picos; o banco
também recebe 1 GiB.

Com 730 h/mês, 1 `shared-cpu-1x` inclui 256 MiB. Por máquina em `gru`:

- CPU: `0,00000075 × 2.628.000 = US$ 1,971`;
- RAM extra (0,75 GiB): `0,00000193 × 0,75 × 2.628.000 = US$ 3,804`;
- multiplicador `gru` 1,615: `(1,971 + 3,804) × 1,615 = US$ 9,33`.

App + banco = US$ 18,65; volume 10 GB = US$ 1,50; primeiros 10 GB de snapshot =
US$ 0. Total fixo inicial: **US$ 20,15/mês**, mais Tigris além da franquia e a
execução curta do backup (centavos). Com Managed Postgres e o app monolítico:
**US$ 81,33/mês** + armazenamento gerenciado (US$ 72 + US$ 9,33). A separação futura
api/worker adiciona máquina e deve ser recalculada com os preços vigentes.
