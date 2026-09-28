# Tech Context — Licita Insight

## Stack

- pnpm workspaces, Node 24, TypeScript 5.9
- Frontend: Vite 7, React 19.1, wouter 3, TanStack Query 5, Tailwind CSS 4, lucide-react
- UI kit (template, pouco usado pelas páginas): Radix, shadcn-style em `src/components/ui`
- API: Express 5, Pino, CORS, esbuild (bundle CJS/ESM em `artifacts/api-server/build.mjs`)
- DB: PostgreSQL + Drizzle. Env `DATABASE_URL`. Local: Postgres no Compose (`licita_pg`).
- Contrato de busca: `docs/contracts/search-v1.md`. OpenAPI em `lib/api-spec`.
- Contrato: OpenAPI 3.1 + Orval → `@workspace/api-client-react` e `@workspace/api-zod`
- Validação no template de DB: Zod v4 (`zod/v4`) + `drizzle-zod`. O catalog do workspace ainda lista `zod` 3.25 para o frontend.

## Como rodar

Na raiz, com `.env` copiado de `.env.example` (`SESSION_SECRET` com 32+ caracteres):

- `docker compose up --build` — Postgres, `push-force`, API (`:3001`) e Vite (`:24252`). Abrir `http://localhost:24252`. Coleta PNCP: `docker compose --profile collect run --rm collect`. Os serviços da app usam `linux/amd64` por causa dos overrides de binário. O serviço `web` força `VITE_API_BASE_URL=/api` e monta `tsconfig.json` / `tsconfig.base.json` da raiz.
- `PORT=24252 BASE_PATH=/ pnpm --filter @workspace/licitainsight run dev` — frontend no host (Vite, host `0.0.0.0`). O proxy usa `API_PROXY_TARGET` ou `http://localhost:3001`.
- `pnpm --filter @workspace/api-server run dev` — API no host. Com `PORT=3001` e `DATABASE_URL` (lido de `.env` na raiz, se existir).
- `pnpm --filter @workspace/api-server run collect:pncp` — carga do PNCP. Janela padrão: 30 dias, todas as modalidades. `PNCP_FROM`, `PNCP_TO`, `PNCP_UF`, `PNCP_MODALITIES` e `PNCP_REFRESH_LIMIT` restringem a execução.
- `pnpm --filter @workspace/api-server run collect:opportunities` — chamadas de audiovisual do Mapa da Cultura e das instâncias estaduais do Mapas Culturais. Janela padrão: 30 dias (`CULTURE_LOOKBACK_DAYS`). Agenda própria, mesmo horário do PNCP, desligável com `CULTURE_DAILY_COLLECT=false`. UFs sem instalação oficial ficam como lacuna.
- Sem `PNCP_FROM`/`PNCP_TO`, a coleta usa `ingest_days` e pula dias já selados; datas explícitas forçam backfill. A cobertura usa `America/Sao_Paulo`. Configuração e testes em `docs/ingest-pncp-calendar.md`.
- `pnpm --filter @workspace/db run push-force` — aplica o schema Drizzle no Postgres local.
- `pnpm run typecheck` — typecheck de libs e artifacts
- `pnpm run build` — typecheck + build dos pacotes
- `pnpm --filter @workspace/api-spec run codegen` — regenera hooks e schemas

O frontend de licitações funciona sem `DATABASE_URL` e sem a API. `PORT` e `BASE_PATH` são obrigatórios no Vite.

## Workspace

`pnpm-workspace.yaml`: `artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts`.

`minimumReleaseAge: 1440` — não desligar. Pacotes npm precisam ter pelo menos 1 dia de publicação. Exceções só em `minimumReleaseAgeExclude`.

Overrides removem binários nativos que não são linux-x64 (herança Replit). Em macOS isso pode quebrar esbuild, lightningcss, rollup ou oxide se o binário da plataforma foi excluído. Se o dev local falhar em “cannot find module @esbuild/darwin-arm64” (ou equivalente), o override é o primeiro suspeito.

## Restrições

- Sem scraping no frontend.
- Sem prender o produto a Supabase, Netlify Identity, Lovable ou outro backend até existir decisão explícita.
- Segredos só em env. Não commitar `.env`.
- `preinstall` recusa npm/yarn: usar pnpm. Em pnpm 11, `verifyDepsBeforeRun: false` no `pnpm-workspace.yaml` evita o install aninhado que quebrava o gate.
- Frontend precisa de `PORT` e `BASE_PATH` (ex.: `PORT=24252 BASE_PATH=/`). Ver `artifacts/licitainsight/.replit-artifact/artifact.toml`.
- `allowBuilds.esbuild: true` é obrigatório no workspace (pnpm 11 ignora o build do esbuild se não estiver aprovado).

## Arquivos de referência

- README do projeto (setup, comandos, problemas comuns): `README.md`
- Brief original do produto: `docs/product-brief.md`
- Notas de operação do template: `replit.md` (ainda genérico)
- Tema: `artifacts/licitainsight/src/index.css`
- Schema: `lib/db/src/schema/tenders.ts`
- Rotas: `artifacts/licitainsight/src/App.tsx`
- OpenAPI: `lib/api-spec/openapi.yaml`
- Schema: `lib/db/src/schema/index.ts`
