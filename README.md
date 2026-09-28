# LicitAI

Plataforma para pesquisar, avaliar e acompanhar licitações públicas brasileiras. Fluxo central: **pesquisar → filtrar → avaliar → salvar → monitorar**.

Os editais vêm do [PNCP](https://pncp.gov.br) (coleta diária) e ficam no PostgreSQL. A interface só mostra publicações coletadas: nenhum número, órgão ou prazo é inventado.

> **Status (set/2026):** preparado para um beta fechado e gratuito, rodando no Mac do owner atrás de um Cloudflare Tunnel ([runbook](docs/ops/beta-local.md)). O deploy no Fly.io ([runbook](docs/ops/deploy-fly.md)) fica para quando o beta tiver cerca de 3 usuários ativos.

## O que o produto faz

- **Busca de editais**: texto livre, filtros (UF, município, órgão, modalidade, situação, datas, valor), facets, ordenação, lista ou tabela, estado da busca na URL. O modo semântico cai para palavra-chave, com aviso, quando não há embeddings.
- **Detalhe do edital**: resumo, objeto, itens, cronologia e documentos buscados no PNCP na primeira abertura, com link para a publicação original.
- **IA sobre o edital** (Jev): perguntas respondidas com trecho citado e página do PDF, ficha com 13 campos e checklist de habilitação. Quando a informação não aparece no edital, a resposta é "Não encontrado", nunca "não exige".
- **Conta**: login com Google OAuth, sessão em cookie HttpOnly `licita_session` com expiração após 10 minutos de inatividade.
- **Recursos pagos** (assinatura mensal via Asaas ou convite de beta): editais salvos e monitorados, buscas salvas, notificações no app e alertas por e-mail (Resend). Busca, detalhe e oportunidades culturais são públicos.
- **Oportunidades culturais** (`/oportunidades`): chamadas de fomento audiovisual coletadas das instalações do Mapas Culturais, separadas dos editais.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Monorepo | pnpm workspaces, Node 24, TypeScript 5.9 |
| Frontend | Vite 7, React 19, wouter, TanStack Query, Tailwind CSS 4 |
| API | Express 5, Pino, bundle com esbuild |
| Banco | PostgreSQL 16 + Drizzle ORM |
| Contrato | OpenAPI 3.1 + Orval (client React e schemas Zod gerados) |

## Estrutura do repositório

```text
artifacts/
  licitainsight/     # app React (o produto) — mapa em ARCHITECTURE.md
  api-server/        # API Express, coletores (PNCP, Mapas Culturais), jobs e worker de IA
  mockup-sandbox/    # sandbox de mockups herdado do template, fora do produto
lib/
  db/                # schema Drizzle, migrations versionadas e scripts de verificação
  api-spec/          # OpenAPI da API (fonte do codegen)
  api-client-react/  # hooks gerados pelo Orval
  api-zod/           # schemas Zod gerados pelo Orval
design-system/       # documentação de tokens, componentes e motion
docs/
  contracts/         # contratos da API (busca, conta, IA, oportunidades…)
  ops/               # runbooks: beta local, Fly.io, alertas
  handoffs/          # handoffs entre agentes/ciclos
  reviews/           # revisões, QA e análises
  product-brief.md   # brief original do produto (intenção, não o estado atual)
deploy/
  beta-local/        # Compose do beta no Mac + backup/restore
  fly-db/            # Postgres próprio no Fly
memory-bank/         # contexto vivo do projeto (estado, decisões, próximos passos)
```

## Rodando localmente

Pré-requisitos: Docker Desktop e pnpm (o `preinstall` recusa npm e yarn).

### 1. Configurar o `.env`

```sh
cp .env.example .env
```

Preencha pelo menos:

- `SESSION_SECRET`: 32 caracteres ou mais (`openssl rand -hex 32`).
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`, com a redirect URI `http://localhost:24252/api/v1/auth/google/callback` cadastrada no Google Cloud. Sem eles, use o login de desenvolvimento (abaixo).

As demais variáveis são opcionais e estão comentadas no `.env.example`.

### 2. Subir a stack (recomendado)

```sh
pnpm install              # no host: o Compose monta ./artifacts e ./lib com os node_modules do host
docker compose up --build
```

Isso sobe o Postgres (volume `licita_pg`), aplica o schema (`db-setup`), a API em `:3001` e o Vite em `:24252`.

Abra **http://localhost:24252**. Use `localhost`, não `127.0.0.1`: a checagem de CSRF compara o `Origin` com `PUBLIC_APP_ORIGIN`, e a redirect URI do Google também usa `localhost`.

No Compose, a coleta diária do PNCP vem desligada (`PNCP_DAILY_COLLECT=false`). Para carregar editais:

```sh
docker compose --profile collect run --rm collect
```

A janela padrão é de 30 dias, com todas as modalidades. `PNCP_FROM`, `PNCP_TO`, `PNCP_UF`, `PNCP_MODALITIES` e `PNCP_REFRESH_LIMIT` restringem a coleta. Sem datas explícitas, o coletor segue o calendário `ingest_days` e pula dias já selados ([detalhes](docs/ingest-pncp-calendar.md)).

### 3. Alternativa: rodar no host

Com um Postgres acessível em `DATABASE_URL`:

```sh
pnpm install
pnpm --filter @workspace/db run push-force                     # schema no banco local
pnpm --filter @workspace/api-server run dev                    # API em :3001
PORT=24252 BASE_PATH=/ pnpm --filter @workspace/licitainsight run dev   # frontend
```

`PORT` e `BASE_PATH` são obrigatórios no Vite. O proxy do Vite envia `/api` para `http://localhost:3001`, ou para `API_PROXY_TARGET` se definido. Não suba Postgres ou API no host nas mesmas portas enquanto a stack Docker estiver rodando.

### Login de desenvolvimento (sem Google)

Com `AUTH_DEV_LOGIN=true` no `.env` e `NODE_ENV` diferente de `production`, a API registra `POST /api/v1/auth/dev-login`. Para criar a sessão, rode no console do navegador, em `http://localhost:24252`:

```js
fetch('/api/v1/auth/dev-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'licita-insight' },
  body: JSON.stringify({ email: 'dev@teste.dev', name: 'Dev' }),
});
```

Para liberar os recursos pagos sem assinatura, use `BILLING_DEV_ENTITLED=true`, que também só vale fora de produção.

## Comandos úteis

| Comando | O que faz |
| --- | --- |
| `pnpm run typecheck` | Typecheck de libs e artifacts |
| `pnpm run build` | Typecheck + build de todos os pacotes |
| `pnpm --filter @workspace/api-server test` | Testes da API |
| `pnpm --filter @workspace/api-server run collect:pncp` | Coleta do PNCP |
| `pnpm --filter @workspace/api-server run collect:opportunities` | Coleta de chamadas audiovisuais (Mapas Culturais) |
| `pnpm --filter @workspace/api-server run report:ai-cost` | Custo de IA por dia e operação |
| `pnpm --filter @workspace/api-spec run codegen` | Regenera client e schemas a partir do OpenAPI |
| `pnpm --filter @workspace/db run push-force` | Aplica o schema Drizzle no banco local |
| `pnpm --filter @workspace/db run verify:migrations` | Confere se as migrations batem com o schema Drizzle |

## Banco e migrations

- **Desenvolvimento:** `push-force` sincroniza o banco local com o schema Drizzle (`lib/db/src/schema`). O `db-setup` do Compose roda esse comando a cada `up`.
- **Produção:** schema só por migrations versionadas em `lib/db/migrations/`, aplicadas por `lib/db/scripts/migrate.mjs` no `release_command`. Produção nunca roda `push`.
- Toda mudança de schema precisa de uma migration e da entrada correspondente em `meta/_journal.json`. Rode `verify:migrations` antes de mergear.

## Agendamentos da API

A API (`APP_ROLE=all`, padrão) também roda os jobs:

| Job | Quando | Desligar |
| --- | --- | --- |
| Coleta PNCP | ao subir e às 06:00 (`America/Sao_Paulo`) | `PNCP_DAILY_COLLECT=false` |
| Coleta Mapas Culturais | ao subir e às 06:00 | `CULTURE_DAILY_COLLECT=false` |
| Resumo diário por e-mail | 07:00 (`EMAIL_DIGEST_HOUR`) | `EMAIL_JOBS_ENABLED=false` |
| Alertas de buscas salvas | a cada 15 min (`SAVED_SEARCH_JOB_INTERVAL_MINUTES`) | `EMAIL_JOBS_ENABLED=false` |

Para separar API e worker (fila de IA com extração de PDF, ficha e aderência), use `APP_ROLE=api` e `APP_ROLE=worker`. No Compose, `docker compose --profile scale up --build` adiciona o serviço `worker`; defina `APP_ROLE=api` no `.env` para a API não processar a fila também. Contexto em [`docs/architecture-scale.md`](docs/architecture-scale.md).

## Problemas comuns

- **`Could not resolve "<pacote>"` no esbuild da stack Docker**: faltou `pnpm install` no host depois de um pull ou merge com dependência nova.
- **`../../.env not found. Continuing without it.` nos logs do Docker**: esperado. Dentro do container as variáveis chegam por `env_file`, não pelo arquivo.
- **Variável nova do `.env` não aparece na API**: `docker compose restart` não relê o `.env`. Use `docker compose up -d api`, que recria o container.
- **Chave do Asaas começando com `$`**: no `.env` lido pelo Compose, use aspas simples (`ASAAS_API_KEY='$aact_...'`). Sem aspas, ou escapado com `$$`, o valor chega errado no container.
- **Erros `MapasClientError` na subida da API**: falhas das instalações externas do Mapas Culturais (403 no federal, certificado HTTPS inválido em AP, MA, MT e TO, HTML no lugar de JSON em algumas UFs). A coleta registra o erro, segue com as outras instalações e termina com `Cultural opportunities ingest finished`. Não bloqueia a API.
- **`Cannot find module @esbuild/darwin-arm64` (ou lightningcss, rollup, oxide) no macOS**: os `overrides` do `pnpm-workspace.yaml` removem binários que não são linux-x64. Revise esses overrides.

## Documentação

- Contratos da API: [`docs/contracts/`](docs/contracts/) — busca em [`search-v1.md`](docs/contracts/search-v1.md), conta e assinatura em [`account-v1.md`](docs/contracts/account-v1.md), oportunidades em [`opportunities-v1.md`](docs/contracts/opportunities-v1.md).
- Arquitetura do frontend: [`artifacts/licitainsight/ARCHITECTURE.md`](artifacts/licitainsight/ARCHITECTURE.md).
- Design system: [`design-system/`](design-system/README.md) e a página viva em `/design-system`.
- Escala e custos: [`docs/architecture-scale.md`](docs/architecture-scale.md). Alertas operacionais: [`docs/ops/alerts.md`](docs/ops/alerts.md).
- Brief original do produto: [`docs/product-brief.md`](docs/product-brief.md).
- Convenções de código e de produto para agentes: [`.cursorrules`](.cursorrules) e [`AGENTS.md`](AGENTS.md).
