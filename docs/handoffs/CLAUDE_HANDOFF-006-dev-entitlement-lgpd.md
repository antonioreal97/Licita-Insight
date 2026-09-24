# CLAUDE_HANDOFF

**ID:** CLAUDE_HANDOFF-006

**Feature:** Ciclo 3 — assinatura de desenvolvimento e direitos LGPD da conta

**Status:** READY_FOR_CLAUDE

## Contrato

O contrato do `CODEX_HANDOFF-006` foi **aceito sem contraproposta**. A implementação é aditiva e o
contrato público atualizado está em `docs/contracts/account-v1.md` e `lib/api-spec/openapi.yaml`.

## Status por rota

| Método | Rota | Status | Gate de assinatura | Resultado |
|---|---|---|---|---|
| GET | `/api/v1/me/billing` | READY | não | adiciona `source: 'subscription' | 'dev' | null`; o status continua refletindo apenas a assinatura real |
| GET | `/api/v1/me/export` | READY | não | download JSON com dados pessoais retidos e sem segredos |
| DELETE | `/api/v1/me` | READY | não | cancela assinatura remota, exclui dados pessoais e limpa o cookie |
| Demais `/api/v1/me/*` pagas | READY | sim | `BILLING_DEV_ENTITLED=true` libera somente fora de produção |

## Assinatura de desenvolvimento

- `BILLING_DEV_ENTITLED=true` é considerada apenas quando `NODE_ENV !== 'production'`.
- O middleware não consulta `subscriptions` durante o bypass de desenvolvimento.
- `GET /api/v1/me/billing` sem assinatura real responde `status: 'none'`, `entitled: true` e
  `source: 'dev'`; não simula uma assinatura paga.
- Uma assinatura real elegível prevalece como `source: 'subscription'`.
- O boot registra warning estruturado com `entitlementSource=dev` quando o bypass está ativo.
- Em produção a flag é ignorada mesmo se configurada como `true`.

## Exportação LGPD

```http
GET /api/v1/me/export
Cookie: licita_session=...
```

Resposta `200 application/json`:

```http
Content-Disposition: attachment; filename="licitai-dados-YYYY-MM-DD.json"
Cache-Control: no-store
```

O JSON contém `exportedAt`, `user`, sessões ativas, `savedTenders`, `savedSearches` inclusive em
soft delete, `notifications` e o estado/período de `subscription`. Não contém token ou hash de
sessão, `googleSub`, identificadores internos do Asaas nem `dedupeKey`.

Erros: `401 UNAUTHENTICATED`. Não retorna `402`.

## Exclusão LGPD

```http
DELETE /api/v1/me
Origin: http://localhost:24252
X-Requested-With: licita-insight
Content-Type: application/json

{"confirm":"EXCLUIR"}
```

Resposta: `204 No Content`, com expiração de `licita_session`.

Erros:

- `400 INVALID_PARAMETER`: corpo ausente ou `confirm !== 'EXCLUIR'`.
- `401 UNAUTHENTICATED`: sessão ausente ou inválida.
- `403 FORBIDDEN`: headers CSRF inválidos.
- `503 BILLING_UNAVAILABLE`: cancelamento necessário recusado/indisponível no Asaas.

Ordem e compensação:

1. lê apenas o identificador/status da assinatura;
2. se houver assinatura remota ainda não cancelada, cancela primeiro no Asaas;
3. somente após sucesso remoto remove sessões, salvos, buscas, notificações, assinatura local e
   usuário em uma única transação;
4. falha do Asaas não altera nenhum dado local;
5. se o banco falhar depois do cancelamento remoto, a transação preserva todos os dados pessoais e
   uma compensação marca a assinatura local como `canceled`, permitindo retry sem nova chamada ao Asaas.

## Subir a API

```bash
docker compose up -d postgres
DATABASE_URL=postgres://licita:licita@localhost:5432/licita pnpm --filter @workspace/db run migrate
DATABASE_URL=postgres://licita:licita@localhost:5432/licita \
PUBLIC_APP_ORIGIN=http://localhost:24252 \
SESSION_SECRET=dev-only-secret-with-at-least-32-characters \
AUTH_DEV_LOGIN=true \
BILLING_DEV_ENTITLED=true \
PORT=3001 PNCP_DAILY_COLLECT=false \
pnpm --filter @workspace/api-server run dev
```

## Tipos Gerados

OpenAPI, schemas TypeScript, schemas Zod e cliente React Query foram regenerados. O frontend dispõe
de `exportAccountData`, `deleteAccount`, `getBilling` e dos tipos `AccountExport`,
`DeleteAccountRequest` e `BillingResponse`.

## Frontend Considerations

- Exibir o estado `source: 'dev'` como acesso de desenvolvimento, nunca como plano pago.
- Para o download nativo, abrir `/api/v1/me/export` por link/navegação; o navegador respeita o
  filename de `Content-Disposition`. O hook gerado retorna apenas o JSON, sem headers.
- A exclusão exige os dois headers CSRF já usados nas demais mutações e confirmação literal.
- Após `204`, limpar estado/cache de conta e navegar para a experiência anônima; o cookie já estará
  expirado pelo backend.

## Validação

- Testes unitários backend: `55` pass, `0` fail, `2` suites PostgreSQL ignoradas sem opt-in.
- Suíte integrada de conta em PostgreSQL isolado: `10/10` pass.
- Cobertura nova: bypass ligado/desligado/produção, origem do entitlement, export isolado e sem hash,
  rotas LGPD sem assinatura, confirmação e CSRF, cascata completa, cookie/sessão revogados, falha do
  Asaas sem deleção e compensação após falha local.
- Typecheck de libs e api-server: PASS.
- Build da API: PASS.

**Breaking changes:** NO

**Migration required:** NO

**Database changes:** NO

**N8N changes:** NO

**Blocking:** NO
