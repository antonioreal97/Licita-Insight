# Contrato — Account API v1 (login, salvos, monitoramento, notificações)

Status: **PROPOSTO** pelo Claude Orchestrator · aguardando `CODEX_BACKEND_AGENT` (`docs/handoffs/CODEX_HANDOFF-004-account.md`)

Decisões do owner (23 set 2026): login **Google OAuth**; alertas **só dentro do app** (sem e-mail neste ciclo);
monitoramento de **editais específicos** e de **buscas salvas**.

O Codex é autoridade sobre schema, sessão, segurança e geração de alertas. Este documento fixa a
forma pública consumida pelo frontend. Mesmas convenções de `search-v1.md` (JSON camelCase, enums
`snake_case`, datas ISO 8601, envelope de erro `{ error: { code, message, details?, requestId } }`).

## Topologia e cookies

- O frontend chama a API pela **mesma origem**: o Vite (dev) faz proxy de `/api` → `http://localhost:3001`.
  `VITE_API_BASE_URL=/api`. Em produção, mesmo esquema (reverse proxy). Assim o cookie é first-party.
- Sessão em cookie `licita_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` fora de dev,
  validade 30 dias com renovação deslizante. Sessões guardadas no PostgreSQL (revogáveis).
- **CSRF:** toda requisição que muda estado (`POST|PUT|PATCH|DELETE` sob `/api/v1/me` e `/auth/logout`)
  exige o header `X-Requested-With: licita-insight` **e** `Origin` igual à origem pública configurada.
  Sem isso → 403 `FORBIDDEN`.
- Rotas de busca/detalhe (`search-v1`) continuam **públicas**. Tudo sob `/api/v1/me/*` exige sessão.

## Novos códigos de erro

| HTTP | code | Quando |
|---|---|---|
| 401 | `UNAUTHENTICATED` | sem sessão / sessão expirada |
| 403 | `FORBIDDEN` | CSRF inválido, recurso de outro usuário |
| 404 | `NOT_FOUND` | recurso ou edital inexistente |
| 409 | `CONFLICT` | limite atingido (`details: [{ field: 'limit', issue: 'max_saved_tenders' }]`) |
| 400 | `INVALID_PARAMETER` | corpo inválido (inclui `query` de busca salva inválida) |

---

## 1. Autenticação (Google OAuth — authorization code + PKCE, no servidor)

### `GET /api/v1/auth/google/start?returnTo=/caminho`
302 para o Google. `returnTo` aceita apenas caminhos relativos do app (começa com `/`, sem `//`);
qualquer outro valor vira `/dashboard`. `state` + PKCE guardados em cookie temporário assinado.

### `GET /api/v1/auth/google/callback`
Troca o code, valida `state`/PKCE/`id_token`, cria ou atualiza o usuário (chave: `sub` do Google;
e-mail precisa estar verificado), cria sessão, seta `licita_session` e **302 para `returnTo`**.
Erro → 302 para `/login?error=<code>` com `code ∈ { access_denied, invalid_state, email_not_verified, oauth_failed }`.

### `GET /api/v1/auth/session`
200 → `{ user: User }` · 401 `UNAUTHENTICATED` quando não há sessão.

```ts
type User = { id: string; email: string; name: string | null; avatarUrl: string | null; createdAt: string };
```

### `POST /api/v1/auth/logout`
204. Revoga a sessão no banco e limpa o cookie. Idempotente.

### (Somente desenvolvimento) `POST /api/v1/auth/dev-login` `{ email: string, name?: string }`
Existe **apenas** quando `NODE_ENV !== 'production'` **e** `AUTH_DEV_LOGIN=true`; caso contrário a
rota não é registrada (404). Serve para QA/testes automatizados sem conta Google. Retorna 204 + cookie.

---

## 2. Editais salvos e monitorados

Monitorar implica salvar: `monitored` é um atributo do edital salvo.

```ts
type SavedTender = { tender: TenderSummary; savedAt: string; monitored: boolean; monitoredAt: string | null };
```

| Método | Caminho | Corpo / params | Resposta |
|---|---|---|---|
| GET | `/api/v1/me/saved-tenders` | `page`, `pageSize` (1–100, def. 20), `monitored?: boolean` | `{ data: SavedTender[]; pagination }` ordenado por `savedAt desc` |
| GET | `/api/v1/me/saved-tenders/ids` | — | `{ saved: string[]; monitored: string[] }` (para marcar botões na lista) |
| PUT | `/api/v1/me/saved-tenders/{tenderId}` | `{ monitored?: boolean }` | 200 `SavedTender` — idempotente (salva ou atualiza) |
| DELETE | `/api/v1/me/saved-tenders/{tenderId}` | — | 204 (idempotente) |
| POST | `/api/v1/me/saved-tenders/import` | `{ ids: string[] }` (≤ 500) | `{ imported: number; alreadySaved: number; notFound: string[] }` |

`import` migra, uma vez, os ids que o navegador guardou em `localStorage` antes do login.
Limite: 500 editais salvos por usuário (409 `CONFLICT`).

## 3. Buscas salvas

`query` é a query string **canônica** gerada pelo frontend (`searchParamsToUrl`, sem `page`, `pageSize`
e `view`), ex. `q=limpeza&state=DF&status=open`. O backend valida com o mesmo parser da rota de busca
e devolve a forma canônica que guardou.

```ts
type SavedSearch = {
  id: string;
  name: string;               // 1–80 chars
  query: string;              // canônica
  alertsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string | null; // última avaliação pela coleta
  newMatchesCount: number;      // editais novos desde a última visita (zerado por /seen)
};
```

| Método | Caminho | Corpo | Resposta |
|---|---|---|---|
| GET | `/api/v1/me/saved-searches` | — | `{ data: SavedSearch[] }` (`updatedAt desc`) |
| POST | `/api/v1/me/saved-searches` | `{ name, query, alertsEnabled }` | 201 `SavedSearch` |
| PATCH | `/api/v1/me/saved-searches/{id}` | `{ name?, query?, alertsEnabled? }` | 200 `SavedSearch` |
| DELETE | `/api/v1/me/saved-searches/{id}` | — | 204 |
| POST | `/api/v1/me/saved-searches/{id}/seen` | — | 200 `SavedSearch` com `newMatchesCount = 0` |

Limite: 50 buscas salvas por usuário (409 `CONFLICT`).

## 4. Notificações (dentro do app)

Geradas pela coleta/revisão do PNCP (processo da API), nunca pelo frontend.

```ts
type NotificationType =
  | 'tender_deadline_changed'   // proposalDeadline mudou
  | 'tender_status_changed'     // status mudou
  | 'tender_document_added'     // novo documento
  | 'tender_value_changed'      // estimatedValue ou estimatedValueStatus mudou
  | 'saved_search_new_matches'; // editais novos que batem com uma busca salva com alertas

type Notification = {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  tender: { id: string; title: string; tenderNumberShort: string | null } | null; // tipos tender_*
  change: { field: string; from: string | number | null; to: string | number | null } | null;
  savedSearch: { id: string; name: string; query: string } | null;                // saved_search_*
  matchCount: number | null;
  tenderIds: string[];          // até 20 ids dos novos editais (saved_search_new_matches)
};
```

| Método | Caminho | Params / corpo | Resposta |
|---|---|---|---|
| GET | `/api/v1/me/notifications` | `unreadOnly?`, `page`, `pageSize` (1–50, def. 20) | `{ data: Notification[]; pagination; unreadCount: number }` (`createdAt desc`) |
| GET | `/api/v1/me/notifications/unread-count` | — | `{ unreadCount: number }` — barato; frontend consulta a cada 60 s com a aba visível |
| POST | `/api/v1/me/notifications/read` | `{ ids?: string[]; all?: boolean }` | `{ unreadCount: number }` |

Regras de geração:
- **Editais monitorados:** ao fazer upsert/revisão de um edital, comparar com o estado anterior
  persistido; para cada campo alterado e cada usuário que monitora o edital, uma notificação.
  Não notificar na primeira ingestão do edital.
- **Buscas salvas com `alertsEnabled`:** após cada execução de coleta, avaliar a busca contra os
  editais **vistos pela primeira vez** desde `lastCheckedAt`; se houver ≥ 1, criar uma notificação
  `saved_search_new_matches` com `matchCount` e até 20 `tenderIds`, somar em `newMatchesCount` e
  atualizar `lastCheckedAt`.
- Deduplicar: a mesma mudança não gera duas notificações para o mesmo usuário.
- Retenção sugerida: 90 dias.

## Performance esperada

`/auth/session`, `/me/saved-tenders/ids`, `/me/notifications/unread-count`: p95 < 100 ms.
Demais rotas `/me/*`: p95 < 300 ms.

## Fora de escopo v1

E-mail/push, compartilhamento de buscas, times/organizações, papéis, exclusão de conta (LGPD — Ciclo 3).
