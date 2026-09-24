# CLAUDE_HANDOFF

**ID:** CLAUDE_HANDOFF-007

**Feature:** Onda 1 — teste de 7 dias, plano único e oportunidades culturais atrás do gate

**Status:** READY_FOR_CLAUDE

**Contrato:** aceito com a alteração final do owner para **7 dias**. API, migration, contratos e testes estão alinhados nessa duração. A notificação `trial_ending` continua sendo criada na janela de D-3.

## Contrato implementado

- O trial começa na criação do usuário e termina após 7 dias.
- Usuários preexistentes recebem 7 dias contados da execução da migration `0003_trial_access`.
- Prioridade do entitlement: `subscription > trial > dev > null`.
- `BILLING_DEV_ENTITLED=true` continua válido somente fora de produção.
- Checkout é permitido durante o trial; a integração atual do Asaas cobra imediatamente e a assinatura passa a prevalecer.
- Um tombstone mínimo preserva HMAC-SHA256 do Google `sub`, `trialEndsAt` e `createdAt`; não armazena nome nem e-mail e impede reinício do trial após exclusão/recriação.
- O scheduler roda no boot e a cada 6 horas, criando no máximo uma notificação `trial_ending` por conta na janela de 3 dias antes do fim. Contas com assinatura elegível não recebem esse aviso.
- As rotas de leitura de oportunidades culturais agora exigem sessão e entitlement. A coleta permanece inalterada.

## Status por rota

| Método | Rota | Status | Auth | Observações |
|---|---|---|---|---|
| `GET` | `/api/v1/billing/plan` | pronto | pública | Retorna `{ monthlyBrl, trialDays: 7, currency: "BRL" }`; preço `null` sem configuração. |
| `GET` | `/api/v1/me/billing` | pronto | sessão | Retorna `trialEndsAt` e `source: subscription | trial | dev | null`. |
| `POST` | `/api/v1/me/billing/checkout` | pronto | sessão + CSRF | Permitido durante trial; `409` somente com assinatura elegível. |
| `GET` | `/api/v1/opportunities` | pronto | sessão + entitlement | `401 UNAUTHENTICATED` sem sessão; `402 SUBSCRIPTION_REQUIRED` sem acesso. |
| `GET` | `/api/v1/opportunities/:id` | pronto | sessão + entitlement | Mesmo gate; `404 NOT_FOUND` para id inexistente após autenticação/autorização. |
| `GET` | `/api/v1/me/notifications` | pronto | sessão + entitlement | Pode retornar `type: "trial_ending"`. |
| `GET` | `/api/v1/me/export` | pronto | sessão, fora do gate | Exporta `trialEndsAt`; direitos LGPD continuam acessíveis sem assinatura. |
| `DELETE` | `/api/v1/me` | pronto | sessão + CSRF, fora do gate | Exclui dados pessoais e preserva somente o tombstone antiabuso. |

## Schemas

**Migration required:** YES — `lib/db/migrations/0003_trial_access.sql`

- `users.trial_ends_at`: `timestamptz NOT NULL DEFAULT now() + interval '7 days'`.
- `google_trial_tombstones`: `subject_hash` PK, `trial_ends_at`, `created_at`.
- OpenAPI atualizado para `1.2.0`; clientes React e Zod regenerados.
- Contratos atualizados em `docs/contracts/account-v1.md` e `docs/contracts/opportunities-v1.md`.

## Como subir

Stack completa, incluindo migration:

```bash
docker compose up --build
```

Somente API no host, com PostgreSQL disponível:

```bash
DATABASE_URL=postgres://licita:licita@localhost:5432/licita pnpm --filter @workspace/db run migrate
DATABASE_URL=postgres://licita:licita@localhost:5432/licita pnpm --filter @workspace/api-server run dev
```

## Validação

- `pnpm -w run typecheck:libs` — passou.
- `pnpm --dir artifacts/api-server run typecheck` — passou.
- `pnpm --dir artifacts/api-server run build` — passou.
- `PNCP_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/licita pnpm --dir artifacts/api-server run test` — **81/81 testes passaram**.
- Cobertura integrada inclui trial vigente/expirado, precedência da assinatura, gate cultural, plano público, bypass de desenvolvimento, tombstone após exclusão e idempotência do `trial_ending`.

## Integração frontend

- Usar `GET /api/v1/billing/plan` na landing/login; não fixar preço nem duração no cliente.
- Usar `source` e `trialEndsAt` de `/me/billing` para selo, contagem regressiva e paywall.
- Tratar `401` como necessidade de login e `402` como necessidade de assinatura nas oportunidades.
- `trial_ending` não traz edital; a mudança possui `{ field: "trialEndsAt", from: null, to: ISO_DATE }`.

**Breaking changes:** YES — somente nas rotas culturais de leitura, que deixam de ser públicas e passam a responder `401`/`402`.

**N8N changes:** NO
