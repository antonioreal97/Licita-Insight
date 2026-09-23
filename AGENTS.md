## Learned User Preferences

- Responder em português (Brasil).
- Preservar o `memory-bank/` local (e docs locais associados como `.cursorrules`) em pulls; não descartar ao alinhar com o remoto.
- Preferir o comando exato de `dev` do frontend (com `PORT`/`BASE_PATH`) em vez de assumir scripts genéricos na raiz.
- Preferir a stack completa via `docker compose up --build` em vez de vários terminais no host.

## Learned Workspace Facts

- UI do produto fica em `artifacts/licitainsight` (package `@workspace/licitainsight`). Editais vêm só do PostgreSQL, via API — sem fixtures/mocks na busca.
- Subir o frontend no host: `PORT=24252 BASE_PATH=/ pnpm --filter @workspace/licitainsight run dev` — `PORT` e `BASE_PATH` são obrigatórios no Vite.
- Usar só pnpm (o `preinstall` recusa npm/yarn). A UI precisa da API e de `DATABASE_URL`.
- Stack Docker: `docker compose up --build` sobe Postgres (volume `licita_pg`), `db-setup` (`push-force`), API (`:3001`) e Vite (`:24252`). Coleta PNCP: `docker compose --profile collect run --rm collect`. Serviços da app usam `linux/amd64`. Não subir Postgres/API do host nas mesmas portas ao mesmo tempo.
- Licitações: Postgres em `DATABASE_URL`. A API (`PORT=3001`) coleta o PNCP ao subir e todo dia às 06:00 (`America/Sao_Paulo`). `PNCP_DAILY_COLLECT=false` desliga. Sem `PNCP_FROM`/`PNCP_TO`, a coleta usa o calendário `ingest_days` e pula dias selados (`docs/ingest-pncp-calendar.md`). Comando manual: `pnpm --filter @workspace/api-server run collect:pncp`.
- Login: só Google OAuth, sessão em cookie `licita_session` emitido pela API. Redirect URI de dev: `http://localhost:24252/api/v1/auth/google/callback`. Contrato em `docs/contracts/account-v1.md`. Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_APP_ORIGIN`, `SESSION_SECRET`; `AUTH_DEV_LOGIN=true` habilita login de dev fora de produção. Abrir o app em `http://localhost:24252` (não `127.0.0.1`), por causa de CSRF/Origin e da redirect URI.
- O frontend chama a API pela mesma origem (proxy do Vite `/api` → `:3001`, `VITE_API_BASE_URL=/api`; no Docker, `API_PROXY_TARGET=http://api:3001`).
- Busca semântica (`mode=semantic`) cai para palavra-chave com aviso na UI quando embeddings não estão disponíveis.
- Em macOS, overrides do `pnpm-workspace.yaml` que removem binários nativos não-linux podem quebrar esbuild/rollup/lightningcss/oxide; se faltar `@*-darwin-arm64`, revisar esses overrides.
