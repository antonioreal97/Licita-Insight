# CLAUDE_HANDOFF

**ID:** CLAUDE_HANDOFF-005

**Feature:** Ciclo 2 — ajustes pós-integração da Account API

**Status:** READY_FOR_CLAUDE

## Resultado

Os quatro itens foram aceitos e implementados, incluindo o restore opcional.

| Item | Status | Comportamento entregue |
|---|---|---|
| Google sem credenciais | READY | `GET /api/v1/auth/google/start` responde 302 para `/login?error=oauth_unavailable`, limpa estado OAuth anterior e registra warning estruturado |
| CSRF no dev-login | READY | `POST /api/v1/auth/dev-login` exige `Origin === PUBLIC_APP_ORIGIN` e `X-Requested-With: licita-insight` |
| Busca duplicada | READY | POST/PATCH com query canônica ativa duplicada respondem 409 `CONFLICT` com `existingId` |
| Restore de busca | READY | soft delete + `POST /api/v1/me/saved-searches/{id}/restore` durante 30 segundos, preservando o ID |

## Contrato Aditivo

### OAuth indisponível

```http
GET /api/v1/auth/google/start
HTTP/1.1 302 Found
Location: /login?error=oauth_unavailable
```

O caso não retorna mais JSON/500. Falhas inesperadas durante a inicialização recebem o mesmo redirect e são logadas com `operation=google_oauth_start`.

### Duplicidade

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "A saved search with this query already exists",
    "details": [
      {
        "field": "query",
        "issue": "duplicate",
        "existingId": "saved-search-id"
      }
    ],
    "requestId": "..."
  }
}
```

A garantia é concorrente: advisory lock por usuário na aplicação e índice único parcial
`(user_id, query) WHERE deleted_at IS NULL` no PostgreSQL.

### Restore

```http
POST /api/v1/me/saved-searches/{id}/restore
Origin: http://localhost:24252
X-Requested-With: licita-insight
```

Resposta 200: `SavedSearch`, com o mesmo `id` e `newMatchesCount = 0`.

- 409 `restore_expired`: exclusão ocorreu há mais de 30 segundos.
- 409 `duplicate`: outra busca ativa passou a usar a mesma query; inclui `existingId`.
- 403: o ID pertence a outro usuário.
- 404: o ID não existe.
- Chamada sobre busca já ativa é idempotente e responde 200.

## Migration

**Required:** YES — `lib/db/migrations/0002_account_followups.sql`.

A migration adiciona `saved_searches.deleted_at`, ajusta o índice de alertas e cria unicidade parcial por usuário/query. Duplicatas preexistentes são reconciliadas de forma determinística: a mais recentemente atualizada permanece ativa; as demais recebem soft delete e continuam preservadas no banco.

## Tipos Gerados

OpenAPI, Zod e React Query foram regenerados. `ErrorDetail` ganhou `existingId?: string` e o cliente expõe `restoreSavedSearch` / `useRestoreSavedSearch`.

## Frontend Considerations

- Adicionar os headers CSRF também ao helper de `dev-login` usado em QA.
- Tratar `oauth_unavailable` com a mensagem já planejada.
- Em 409 `duplicate`, `details[0].existingId` permite navegar para a busca existente.
- O toast “Desfazer” pode chamar a nova rota durante 30 segundos; após isso, ocultar a ação ou tratar 409.

## Validação

- Migration `0002_account_followups` aplicada no PostgreSQL local.
- `43/43` testes com PostgreSQL real: PASS.
- Casos novos: redirect OAuth sem credenciais, CSRF inválido no dev-login, duplicidade canônica, restore preservando ID/zerando contador e restore expirado.
- Typecheck de libs e api-server: PASS.

**Breaking changes:** NO — somente duplicatas, antes aceitas, passam a retornar o 409 já previsto pelo frontend.

**N8N changes:** NO

**Blocking:** NO
