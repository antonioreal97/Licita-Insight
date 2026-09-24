# CLAUDE_HANDOFF

**ID:** CLAUDE_HANDOFF-009

**Feature:** Onda 2 — alertas por e-mail com Resend

**Status:** READY_FOR_CLAUDE

**Contrato:** aceito como mudança aditiva. As três rotas propostas foram implementadas. A única
precisão é que o `PUT` parcial precisa conter `email` e pelo menos uma preferência; um no-op vazio
responde `400 INVALID_PARAMETER`. O endpoint público também aceita `token` e `scope` na query para o
POST automático definido pelo RFC 8058, sem alterar o contrato JSON usado pela página do app.

## Contrato implementado

- Preferências padrão para contas novas e existentes: `digest: "daily"` e
  `immediateCritical: true`.
- Preferências e descadastro ficam fora do gate de assinatura; o `PUT` exige sessão + CSRF.
- Token de descadastro opaco `v1.<uuid>.<hmac>`, sem PII legível e sem expiração curta, assinado com
  `SESSION_SECRET`.
- Digest diário às 07:00 em `America/Sao_Paulo`, incluindo notificações lidas ou não e nunca vazio.
- Alertas imediatos fecham a janela de agrupamento após 10 minutos para prazo alterado e status
  `suspended`/`cancelled` de edital ainda monitorado. `trial_ending` também é elegível uma vez.
- Entitlement vigente é obrigatório para entregas, exceto `trial_ending`.
- Cada notificação pertence a no máximo uma entrega de e-mail, evitando repetição entre imediato e
  digest. O envio usa idempotência local e `Idempotency-Key` no Resend.
- Falhas transitórias usam backoff de 1, 5 e 30 minutos, com no máximo três tentativas. Sem
  `RESEND_API_KEY` ou `MAIL_FROM`, a entrega fica `skipped` e a API continua disponível.
- HTML e texto puro são gerados em PT-BR a partir dos snapshots persistidos, com órgão, prazo,
  objeto/título truncado, links diretos, preferências e descadastro.
- A aplicação não adiciona pixels, imagens ou links de tracking. Click/open tracking deve permanecer
  desligado também na configuração do domínio do Resend.
- A avaliação de buscas salvas saiu do coletor PNCP e roda em job próprio, no boot e a cada 15
  minutos por padrão.

## Status por rota

| Método | Rota | Status | Auth | Observações |
|---|---|---|---|---|
| `GET` | `/api/v1/me/notification-preferences` | pronto | sessão, fora do gate | Retorna `{ email, emailAddress, updatedAt }`. |
| `PUT` | `/api/v1/me/notification-preferences` | pronto | sessão + CSRF, fora do gate | Atualização parcial; preserva campos omitidos. |
| `POST` | `/api/v1/email/unsubscribe` | pronto | pública | Escopos `all`, `digest`, `immediate`; token inválido retorna `400 INVALID_PARAMETER`. |
| `GET` | `/api/v1/me/export` | atualizado | sessão, fora do gate | Inclui preferências, snapshots e metadados de entrega, sem tokens/corpos/headers. |
| `DELETE` | `/api/v1/me` | atualizado | sessão + CSRF, fora do gate | Remove entregas e vínculos junto com os demais dados pessoais. |

## Persistência

**Migration required:** YES — `lib/db/migrations/0004_email_alerts.sql`

- `users`: preferências, timestamp de alteração e UUID opaco de descadastro.
- `notifications`: snapshots de órgão e prazo usados no conteúdo do e-mail.
- `email_deliveries`: payload exato, status `queued | sent | failed | skipped`, tentativas, retry,
  erro, id do provedor e timestamps.
- `email_delivery_notifications`: vínculo N:N com unicidade por notificação para idempotência.
- Constraints de enums/canal/tentativas e índices de deduplicação, retry e histórico por usuário.
- Retenção operacional de entregas: 90 dias; exclusão ocorre após o digest.

## Configuração e jobs

```text
RESEND_API_KEY=re_...
MAIL_FROM=LicitAI <alertas@example.com>
MAIL_REPLY_TO=suporte@example.com              # opcional
EMAIL_JOBS_ENABLED=true                        # false desliga e-mail + avaliação de buscas
EMAIL_DIGEST_HOUR=7                            # hora local BRT
EMAIL_IMMEDIATE_WINDOW_MINUTES=10
SAVED_SEARCH_JOB_INTERVAL_MINUTES=15
```

Os jobs têm proteção contra sobreposição dentro da instância e logs estruturados com operação,
contagens e duração. Retry e imediato rodam a cada minuto; o digest rearma o próximo horário local.

## Como subir

Stack completa, incluindo aplicação do schema:

```bash
docker compose up --build
```

Somente API no host, com PostgreSQL disponível:

```bash
DATABASE_URL=postgres://licita:licita@localhost:5432/licita pnpm --filter @workspace/db run migrate
PORT=3001 DATABASE_URL=postgres://licita:licita@localhost:5432/licita PNCP_DAILY_COLLECT=false CULTURE_DAILY_COLLECT=false pnpm --filter @workspace/api-server run dev
```

## Contratos gerados

- OpenAPI atualizado para `1.3.0` em `lib/api-spec/openapi.yaml`.
- Clientes React e schemas Zod regenerados.
- Hooks gerados: `useGetNotificationPreferences`, `useUpdateNotificationPreferences` e
  `useUnsubscribeEmail`.
- Contrato consolidado na seção **E-mail** de `docs/contracts/account-v1.md`.

## Validação

- `pnpm -w run typecheck:libs` — passou.
- `pnpm --dir artifacts/api-server run typecheck` — passou.
- `pnpm --dir artifacts/api-server run build` — passou.
- `pnpm --dir artifacts/api-server run test` sem PostgreSQL — **68 passaram, 2 ignorados**.
- `PNCP_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/licita pnpm --dir artifacts/api-server run test` — **93/93 passaram**.
- Migration `0004_email_alerts.sql` executada isoladamente em banco temporário com as cinco
  constraints esperadas.
- Cobertura inclui defaults/PUT parcial/CSRF/fora do gate, token válido e inválido, três escopos,
  RFC 8058, digest com lidas/agrupamento/vazio/idempotência, horário BRT, críticos monitorados,
  janela de 10 minutos, entitlement, exceção de `trial_ending`, Resend ausente, retry e job próprio
  de buscas salvas.

## Integração frontend

- A UI pode substituir os adapters pela API real mantendo a proposta já implementada em paralelo.
- Enviar `X-Requested-With: licita-insight` no `PUT` e manter a sessão apenas no cookie HttpOnly.
- A página `/descadastro` chama o POST JSON e pode repetir a operação com segurança.
- `emailAddress` é somente leitura; a edição do e-mail da conta não faz parte deste contrato.
- Status `skipped` é operacional e não aparece na API de preferências.

**Breaking changes:** NO

**Frontend changes required:** integração já preparada pelo Claude; validar com o cliente regenerado.

**N8N changes:** NO
