## Learned User Preferences

- Responder em português (Brasil).
- Preservar o `memory-bank/` local (e docs locais associados como `.cursorrules`) em pulls; não descartar ao alinhar com o remoto.
- Preferir o comando exato de `dev` do frontend (com `PORT`/`BASE_PATH`) em vez de assumir scripts genéricos na raiz.

## Learned Workspace Facts

- UI do produto fica em `artifacts/licitainsight` (package `@workspace/licitainsight`). Editais vêm só do PostgreSQL, via API.
- Subir o frontend: `PORT=24252 BASE_PATH=/ pnpm --filter @workspace/licitainsight run dev` — `PORT` e `BASE_PATH` são obrigatórios no Vite.
- Usar só pnpm (o `preinstall` recusa npm/yarn). A UI precisa da API e de `DATABASE_URL`.
- Licitações: Postgres em `DATABASE_URL`. A API (`PORT=3001`) coleta o PNCP ao subir e todo dia às 06:00 (`America/Sao_Paulo`). `PNCP_DAILY_COLLECT=false` desliga. Comando manual: `pnpm --filter @workspace/api-server run collect:pncp`.
- Login é só UI: qualquer e-mail/senha válidos no formulário levam ao dashboard; não há senha de teste real. Persona de demo no shell: Marina Almeida (`marina@atlasengenharia.com.br`, Atlas Engenharia).
- Em macOS, overrides do `pnpm-workspace.yaml` que removem binários nativos não-linux podem quebrar esbuild/rollup/lightningcss/oxide; se faltar `@*-darwin-arm64`, revisar esses overrides.
