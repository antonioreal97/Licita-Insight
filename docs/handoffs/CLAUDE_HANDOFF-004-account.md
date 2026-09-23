# CLAUDE_HANDOFF

**ID:** CLAUDE_HANDOFF-004

**Feature:** Ciclo 2 — Google OAuth, editais salvos/monitorados, buscas salvas e notificações no app

**Status:** READY_FOR_CLAUDE

## Contrato

**Decisão:** aceito sem contraproposta. Os oito itens de “Esclarecimentos propostos pelo frontend” foram confirmados e implementados:

1. `GET /auth/session` responde 401 no envelope padrão.
2. `PUT` com `{}` preserva `monitored` quando o edital já está salvo.
3. Importação parcial responde `skippedByLimit` e não mistura `notFound` com `alreadySaved`.
4. `PUT` de edital inexistente responde 404.
5. Query salva é canônica e não começa com `?`.
6. Logout exige CSRF, aceita ausência de sessão e responde 204.
7. Marcação de notificações sem `ids` nem `all=true` responde 400.
8. A origem local oficial é `http://localhost:24252`.

Contrato e tipos atualizados em `docs/contracts/account-v1.md`, `lib/api-spec/openapi.yaml`, `lib/api-zod/src/generated` e `lib/api-client-react/src/generated`.

## Rotas

| Método | Endpoint | Status |
|---|---|---|
| GET | `/api/v1/auth/google/start` | READY — redirect Google + state/nonce/PKCE |
| GET | `/api/v1/auth/google/callback` | READY — troca code, valida ID token e cria sessão |
| GET | `/api/v1/auth/session` | READY |
| POST | `/api/v1/auth/logout` | READY |
| POST | `/api/v1/auth/dev-login` | READY — somente dev + flag; 404 nos demais casos |
| GET | `/api/v1/me/saved-tenders` | READY |
| GET | `/api/v1/me/saved-tenders/ids` | READY |
| POST | `/api/v1/me/saved-tenders/import` | READY |
| PUT | `/api/v1/me/saved-tenders/{tenderId}` | READY |
| DELETE | `/api/v1/me/saved-tenders/{tenderId}` | READY |
| GET | `/api/v1/me/saved-searches` | READY |
| POST | `/api/v1/me/saved-searches` | READY |
| PATCH | `/api/v1/me/saved-searches/{id}` | READY |
| DELETE | `/api/v1/me/saved-searches/{id}` | READY |
| POST | `/api/v1/me/saved-searches/{id}/seen` | READY |
| GET | `/api/v1/me/notifications` | READY |
| GET | `/api/v1/me/notifications/unread-count` | READY |
| POST | `/api/v1/me/notifications/read` | READY |

## Subir a API

```bash
docker compose up -d postgres
pnpm --filter @workspace/db run migrate
PORT=3001 PNCP_DAILY_COLLECT=false pnpm --filter @workspace/api-server run dev
```

Configuração em `.env.example`. Redirect URI Google local: `http://localhost:24252/api/v1/auth/google/callback`.

## Request Schema

Conforme `docs/contracts/account-v1.md` e OpenAPI. Mutações sob `/api/v1/me` e `/api/v1/auth/logout` devem enviar:

```http
Origin: http://localhost:24252
X-Requested-With: licita-insight
```

O browser envia o cookie HttpOnly automaticamente na mesma origem. O cliente gerado permite passar os headers pelo campo `request` das hooks/funções.

## Response Schema

Conforme os schemas `User`, `SavedTender`, `SavedSearch`, `Notification` e paginações no OpenAPI. Erros mantêm `{ error: { code, message, details?, requestId } }`.

## Authentication

Google OAuth authorization code + PKCE no servidor. Sessão opaca em cookie, token hasheado no PostgreSQL, expiração de 30 dias, renovação deslizante e revogação no logout. OAuth real precisa apenas das credenciais que o owner criará; não foi possível executar o smoke test externo sem elas.

## Filtering / Sorting / Pagination

- Editais salvos: `monitored`, `page`, `pageSize`; ordem `savedAt desc`.
- Notificações: `unreadOnly`, `page`, `pageSize`; ordem `createdAt desc`.
- Buscas salvas: ordem `updatedAt desc`; query validada pelo mesmo parser do Search v1.1.

## Performance Notes

Índices adicionados para sessão, listas por usuário, monitoramento, buscas com alerta, unread e deduplicação. Contadores rápidos usam `count(*)` filtrado e as listas sempre paginam. Os limites de 500/50 são serializados por advisory lock por usuário.

## Frontend Considerations

- Manter `credentials` de mesma origem e enviar os dois headers CSRF em toda mutação protegida.
- Trocar o mock/localStorage pela importação única; `skippedByLimit > 0` deve ser comunicável ao usuário.
- Tratar 401 globalmente sem perder o destino relativo usado em `returnTo`.
- A leitura de notificações exige `{ ids: [...] }` ou `{ all: true }`.
- A integração dos binários macOS solicitada anteriormente permanece concluída em `pnpm-workspace.yaml`/`pnpm-lock.yaml`; `pnpm install` e o build nativo executaram neste Mac.

## Database / Migration

**Migration required:** YES — `lib/db/migrations/0001_account.sql`.

Novas tabelas: `users`, `sessions`, `saved_tenders`, `saved_searches`, `notifications`. Dados públicos continuam em `tenders`; notificações guardam apenas snapshots necessários para histórico e renderização.

## Alert Generation

READY. A coleta PNCP gera alertas idempotentes de prazo, status, valor/sigilo e documentos, sem alertar na primeira ingestão/enriquecimento. Ao concluir a coleta, avalia buscas com alerta contra editais vistos pela primeira vez desde o checkpoint. Retenção: 90 dias.

## Tests

- `42/42` testes passaram com PostgreSQL real em schemas isolados.
- Cobertura integrada: expiração/logout, CSRF, isolamento entre usuários, edital inexistente, import parcial, limites 409, diffs prazo/status/valor/documento, deduplicação, ausência de alerta inicial e novos resultados de busca salva.
- `pnpm run typecheck`: PASS (libs, API, scripts e frontends do workspace).
- `pnpm --dir artifacts/api-server build`: PASS.
- Migration aplicada com sucesso no PostgreSQL local.

**Breaking changes:** NO

**N8N changes:** NO

**Issues:** smoke test Google real aguarda `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` do owner; não bloqueia a integração frontend via `AUTH_DEV_LOGIN=true` em desenvolvimento.
