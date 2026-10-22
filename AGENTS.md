## Learned User Preferences

- Responder em português (Brasil).
- Preservar o `memory-bank/` local (e docs locais associados como `.cursorrules`) em pulls; não descartar ao alinhar com o remoto.
- Preferir o comando exato de `dev` do frontend (com `PORT`/`BASE_PATH`) em vez de assumir scripts genéricos na raiz.
- Preferir a stack completa via `docker compose up --build` em vez de vários terminais no host.
- Nome do produto na UI: Pardal Digital. O logo oficial (SVG de cor fixa) fica em `artifacts/licitainsight/public/brand/` (`pardal-logo-petroleo.svg` no tema Creme, `pardal-logo-lima.svg` no tema Petróleo, `pardal-simbolo-*.svg` para espaços pequenos) e entra pelo componente `BrandLogo`; o favicon `artifacts/licitainsight/public/favicon.svg` é gerado de `pardal-simbolo-petroleo.svg`. Design system em `docs/design-system.md`. Os identificadores técnicos legados permanecem para preservar compatibilidade.
- Sessão: manter o cookie HttpOnly `licita_session`; não guardar o token no `localStorage` — só o relógio de inatividade e preferências opcionais.
- Assinatura mensal atrativa em R$ 49,90 (`BILLING_MONTHLY_BRL=49.90`); reajustar só se o custo real por assinante apertar.

## Learned Workspace Facts

- UI do produto fica em `artifacts/licitainsight` (package `@workspace/licitainsight`). Editais vêm só do PostgreSQL, via API — sem fixtures/mocks na busca.
- Subir o frontend no host: `PORT=24252 BASE_PATH=/ pnpm --filter @workspace/licitainsight run dev` — `PORT` e `BASE_PATH` são obrigatórios no Vite.
- Usar só pnpm (o `preinstall` recusa npm/yarn). A UI precisa da API e de `DATABASE_URL`.
- Stack Docker: `docker compose up --build` sobe Postgres (volume `licita_pg`), `db-setup` (`push-force`), API (`:3001`) e Vite (`:24252`). Coleta PNCP: `docker compose --profile collect run --rm collect`. Serviços da app usam `linux/amd64`. O compose monta `./artifacts` e `./lib` por cima da imagem, então os `node_modules` por pacote vêm do host: após dependência nova (pull/merge), rodar `pnpm install` no host antes do `up`, senão o esbuild falha com `Could not resolve "<pacote>"`. Não subir Postgres/API do host nas mesmas portas ao mesmo tempo.
- Licitações: Postgres em `DATABASE_URL`. A API (`PORT=3001`) coleta o PNCP ao subir e todo dia às 06:00 (`America/Sao_Paulo`). `PNCP_DAILY_COLLECT=false` desliga. Sem `PNCP_FROM`/`PNCP_TO`, a coleta usa o calendário `ingest_days` e pula dias selados (`docs/ingest-pncp-calendar.md`). Comando manual: `pnpm --filter @workspace/api-server run collect:pncp`.
- Login: só Google OAuth, sessão em cookie `licita_session` emitido pela API, com janela deslizante de 10 minutos de inatividade (toque no máximo 1×/min). O `localStorage` guarda só `licita-last-activity` (relógio) e preferências opcionais. Aviso de cookies (Concordar/Recusar) controla tema, sidebar, buscas recentes e o relógio; o cookie de sessão permanece. Redirect URI de dev: `http://localhost:24252/api/v1/auth/google/callback`. Contrato em `docs/contracts/account-v1.md`. Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_APP_ORIGIN`, `SESSION_SECRET`; `AUTH_DEV_LOGIN=true` habilita login de dev fora de produção. Abrir o app em `http://localhost:24252` (não `127.0.0.1`), por causa de CSRF/Origin e da redirect URI.
- O frontend chama a API pela mesma origem (proxy do Vite `/api` → `:3001`, `VITE_API_BASE_URL=/api`; no Docker, `API_PROXY_TARGET=http://api:3001`). Em produção o frontend sobe na Vercel (`vercel.json`, `middleware.js`, `API_UPSTREAM_ORIGIN`).
- Busca semântica (`mode=semantic`) cai para palavra-chave com aviso na UI quando embeddings não estão disponíveis.
- Chamadas de fomento audiovisual ficam fora de `tenders`: tabela `cultural_opportunities`, UI em `/oportunidades`, coleta Mapas Culturais (`pnpm --filter @workspace/api-server run collect:opportunities`), agenda desligável com `CULTURE_DAILY_COLLECT=false`. Filtro por `@keyword` (não `term:linguagem`). Contrato: `docs/contracts/opportunities-v1.md`.
- Assinatura mensal via Asaas: busca, detalhe e oportunidades continuam públicos; salvar, monitorar, buscas salvas e notificações exigem assinatura ativa (`402` / `SUBSCRIPTION_REQUIRED`). Produção: `BILLING_MONTHLY_BRL=49.90`. Env: `ASAAS_API_KEY`, `ASAAS_API_BASE_URL`, `ASAAS_WEBHOOK_TOKEN`, `BILLING_MONTHLY_BRL`. Webhook: `POST /api/v1/billing/asaas/webhook`.
- Aderência (company fit): perfil em `/api/v1/me/company-profile` (só sessão, fora do paywall); score em `GET /api/v1/me/fit` (exige assinatura). Comparação por texto com Jev — sem CATMAT/CNAE. Contrato: `docs/contracts/company-fit-v1.md`.
- Em macOS, overrides do `pnpm-workspace.yaml` que removem binários nativos não-linux podem quebrar esbuild/rollup/lightningcss/oxide; se faltar `@*-darwin-arm64`, revisar esses overrides.
