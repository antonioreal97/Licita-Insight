## Learned User Preferences

- Responder em português (Brasil).
- Preservar o `memory-bank/` local (e docs locais associados como `.cursorrules`) em pulls; não descartar ao alinhar com o remoto.
- Preferir o comando exato de `dev` do frontend (com `PORT`/`BASE_PATH`) em vez de assumir scripts genéricos na raiz.

## Learned Workspace Facts

- UI do produto fica em `artifacts/licitainsight` (package `@workspace/licitainsight`). Editais vêm só do PostgreSQL, via API.
- Subir o frontend: `PORT=24252 BASE_PATH=/ pnpm --filter @workspace/licitainsight run dev` — `PORT` e `BASE_PATH` são obrigatórios no Vite.
- Usar só pnpm (o `preinstall` recusa npm/yarn). A UI precisa da API e de `DATABASE_URL`.
- Licitações: Postgres em `DATABASE_URL`. A API (`PORT=3001`) coleta o PNCP ao subir e todo dia às 06:00 (`America/Sao_Paulo`). `PNCP_DAILY_COLLECT=false` desliga. Comando manual: `pnpm --filter @workspace/api-server run collect:pncp`.
- Login: só Google OAuth (Ciclo 2), sessão em cookie `licita_session` emitido pela API. Contrato em `docs/contracts/account-v1.md`; backend em implementação (`docs/handoffs/CODEX_HANDOFF-004-account.md`). Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_APP_ORIGIN`, `SESSION_SECRET`; `AUTH_DEV_LOGIN=true` habilita login de dev fora de produção. Abrir o app em `http://localhost:24252` (não `127.0.0.1`), por causa de CSRF/Origin e da redirect URI. Não há mais persona de demonstração.
- O frontend chama a API pela mesma origem (proxy do Vite `/api` → `:3001`, `VITE_API_BASE_URL=/api`).
- Em macOS, overrides do `pnpm-workspace.yaml` que removem binários nativos não-linux podem quebrar esbuild/rollup/lightningcss/oxide; se faltar `@*-darwin-arm64`, revisar esses overrides.
