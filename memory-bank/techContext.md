# Tech Context — Licita Insight

## Stack

- pnpm workspaces, Node 24, TypeScript 5.9
- Frontend: Vite 7, React 19.1, wouter 3, TanStack Query 5, Tailwind CSS 4, lucide-react
- UI kit (template, pouco usado pelas páginas): Radix, shadcn-style em `src/components/ui`
- API: Express 5, Pino, CORS, esbuild (bundle CJS/ESM em `artifacts/api-server/build.mjs`)
- DB (preparado, vazio): PostgreSQL + Drizzle. Env `DATABASE_URL`
- Contrato: OpenAPI 3.1 + Orval → `@workspace/api-client-react` e `@workspace/api-zod`
- Validação no template de DB: Zod v4 (`zod/v4`) + `drizzle-zod`. O catalog do workspace ainda lista `zod` 3.25 para o frontend.

## Como rodar

Na raiz:

- `PORT=24252 BASE_PATH=/ pnpm --filter @workspace/licitainsight run dev` — frontend (Vite, host `0.0.0.0`)
- `pnpm --filter @workspace/api-server run dev` — API na porta 5000 (build + start)
- `pnpm run typecheck` — typecheck de libs e artifacts
- `pnpm run build` — typecheck + build dos pacotes
- `pnpm --filter @workspace/api-spec run codegen` — regenera hooks e schemas
- `pnpm --filter @workspace/db run push` — push do schema Drizzle (só dev)

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

- Spec de produto: `README.md`
- Notas de operação do template: `replit.md` (ainda genérico)
- Tema: `artifacts/licitainsight/src/index.css`
- Mocks: `artifacts/licitainsight/src/lib/mock-data.ts`
- Rotas: `artifacts/licitainsight/src/App.tsx`
- OpenAPI: `lib/api-spec/openapi.yaml`
- Schema: `lib/db/src/schema/index.ts`
