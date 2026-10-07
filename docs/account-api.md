# Account API v1 — operação local

Implementação de autenticação Google, sessões revogáveis, editais salvos/monitorados, buscas salvas e notificações no app e por e-mail. O contrato público está em [`docs/contracts/account-v1.md`](contracts/account-v1.md) e o OpenAPI em `lib/api-spec/openapi.yaml`.

## Configuração

Variáveis obrigatórias para Google OAuth:

```text
DATABASE_URL=postgres://licita:licita@localhost:5432/licita
PORT=3001
PUBLIC_APP_ORIGIN=http://localhost:24252
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=... # mínimo 32 caracteres, valor aleatório
RESEND_API_KEY=...
MAIL_FROM=Abriu lá <alertas@example.com>
# MAIL_REPLY_TO=suporte@example.com
```

No Google Cloud, registrar exatamente esta redirect URI em desenvolvimento:

```text
http://localhost:24252/api/v1/auth/google/callback
```

`AUTH_DEV_LOGIN=true` registra a rota de QA `POST /api/v1/auth/dev-login` somente quando `NODE_ENV !== production`. Em produção, a rota não é registrada mesmo que a variável seja definida.

`BILLING_DEV_ENTITLED=true` libera as rotas pagas para qualquer sessão somente fora de produção. O
boot registra um warning e `GET /api/v1/me/billing` devolve `source: "dev"`. Em produção a flag é
ignorada. Ela não cria nem simula uma assinatura no banco.

## Subir localmente

```bash
docker compose up -d postgres
DATABASE_URL=postgres://licita:licita@localhost:5432/licita pnpm --filter @workspace/db run push-force
PORT=3001 PNCP_DAILY_COLLECT=false pnpm --filter @workspace/api-server run dev
```

`push-force` é o caminho suportado para criar um banco local vazio porque provisiona primeiro todo o
schema canônico (`tenders`, tabelas de ingestão e contas). `pnpm --filter @workspace/db run migrate`
serve para atualizar bancos que já possuem esse baseline; as migrations de conta começam em
`0001_account` e, isoladamente, não criam as tabelas canônicas anteriores. A migration
`0003_trial_access` concede 7 dias de teste aos usuários existentes; `0004_email_alerts` adiciona
preferências, snapshots e a fila auditável de entregas de e-mail.

## Segurança

- O cookie `licita_session` é `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` fora de desenvolvimento.
- O token de sessão nunca é persistido em claro; o banco guarda seu hash SHA-256.
- Mutações pessoais, logout e dev-login exigem `X-Requested-With: licita-insight` e `Origin` exatamente igual a `PUBLIC_APP_ORIGIN`.
- O fluxo Google usa authorization code, PKCE S256, `state` assinado, `nonce`, validação RS256 via JWKS, issuer, audience, expiração e `email_verified`.
- `returnTo` aceita somente caminhos relativos seguros; redirecionamentos externos caem em `/dashboard`.
- CORS aberto foi removido. O frontend usa proxy/reverse proxy de mesma origem.
- Sem credenciais Google, `/auth/google/start` redireciona para `/login?error=oauth_unavailable` e registra um aviso estruturado.
- `GET /api/v1/me/export`, `DELETE /api/v1/me` e as preferências de e-mail exigem autenticação, mas
  nunca assinatura ativa.
- O descadastro público usa token opaco com HMAC-SHA256 e não expõe e-mail ou id de usuário.

## LGPD

- `GET /api/v1/me/export` baixa os dados pessoais retidos, incluindo buscas em soft delete,
  preferências e metadados de entrega de e-mail, sem tokens, corpos/headers de e-mail, hashes de
  sessão, `googleSub`, ids internos do Asaas ou chaves de deduplicação.
- `DELETE /api/v1/me` exige CSRF e `{ "confirm": "EXCLUIR" }`, cancela primeiro a assinatura remota
  quando houver e só então exclui localmente o usuário em uma transação com cascata.
- Se o Asaas falhar, nenhum dado local é apagado. Se o banco falhar depois do cancelamento remoto,
  os dados pessoais permanecem intactos e a assinatura local é compensada para `canceled`.

## Buscas salvas

- Cada usuário pode ter somente uma busca ativa por query canônica; duplicatas respondem 409 com o `existingId`.
- `DELETE` oculta a busca imediatamente e inicia uma janela de restore de 30 segundos.
- `POST /api/v1/me/saved-searches/{id}/restore` preserva o ID original, zera `newMatchesCount` e reinicia o checkpoint quando alertas estiverem ativos.
- Restore expirado ou bloqueado por uma nova busca equivalente responde 409.

## Alertas

- Upserts PNCP comparam prazo, status, valor e sigilo do valor com a versão persistida.
- A primeira ingestão não gera alerta; revisões posteriores geram uma notificação por campo alterado para cada usuário que monitora o edital.
- A revisão de documentos gera `tender_document_added` apenas quando aparecem ids novos após o primeiro enriquecimento.
- Buscas com alertas são avaliadas por job próprio contra `tenders.created_at` desde
  `lastCheckedAt`; a coleta PNCP não dispara mais essa avaliação.
- `notifications(user_id, dedupe_key)` impede duplicatas; registros com mais de 90 dias são removidos após a avaliação.
- O scheduler de trial roda no boot e a cada 6 horas, criando uma única notificação `trial_ending`
  quando faltam no máximo 3 dias.

## E-mail

- `GET /api/v1/me/notification-preferences` e `PUT /api/v1/me/notification-preferences` ficam fora
  do gate pago; o `PUT` exige CSRF. O padrão é digest diário e alertas críticos imediatos ligados.
- `POST /api/v1/email/unsubscribe` é público e aceita JSON. Para RFC 8058, também aceita `token` e
  `scope` na query com corpo `List-Unsubscribe=One-Click`.
- O digest roda às 07:00 em `America/Sao_Paulo`; `EMAIL_DIGEST_HOUR` altera a hora local.
- O job imediato roda a cada minuto e fecha grupos após 10 minutos; use
  `EMAIL_IMMEDIATE_WINDOW_MINUTES` para ajustar a janela.
- A avaliação de buscas salvas roda no boot e a cada 15 minutos; use
  `SAVED_SEARCH_JOB_INTERVAL_MINUTES` para alterar o intervalo.
- `EMAIL_JOBS_ENABLED=false` desliga só envio imediato, digest e retries de e-mail. A avaliação de
  buscas salvas e os alertas de perfil continuam ativos quando há `DATABASE_URL`, gerando
  notificações no app.
- Sem `RESEND_API_KEY` ou `MAIL_FROM`, as entregas são persistidas como `skipped` e a API segue no
  ar. `MAIL_REPLY_TO` é opcional.
- `EMAIL_UNSUBSCRIBE_SECRET` aceita um segredo dedicado de no mínimo 32 caracteres. Mantenha-o
  estável ao rotacionar `SESSION_SECRET`; sem ele, a API usa `SESSION_SECRET` por compatibilidade.
- O conteúdo é persistido antes do envio para retry determinístico. Falhas transitórias usam
  backoff de 1, 5 e 30 minutos, com no máximo três tentativas, além da idempotência local e do
  `Idempotency-Key` enviado ao Resend.
- A aplicação não injeta pixels, imagens nem links de tracking. Desative também click/open tracking
  no domínio configurado no Resend.
- Entregas com mais de 90 dias são removidas após o digest diário. Exclusão de conta remove
  preferências, entregas e vínculos na mesma transação.

## Trial e plano

- Todo usuário novo recebe 7 dias de acesso completo; assinatura vigente prevalece no campo `source`.
- `GET /api/v1/billing/plan` é público e expõe somente preço, moeda BRL e duração do trial.
- O checkout continua disponível durante o trial e a cobrança é imediata nesta integração do Asaas.
- O HMAC do Google `sub` e o fim original do trial ficam em `google_trial_tombstones` após exclusão,
  sem e-mail ou nome, exclusivamente para evitar repetição do benefício.
- As rotas de leitura de oportunidades culturais exigem sessão e acesso vigente.

## Validação

```bash
pnpm --dir artifacts/api-server test
PNCP_TEST_DATABASE_URL="$DATABASE_URL" pnpm --dir artifacts/api-server test
pnpm -w run typecheck:libs
pnpm --dir artifacts/api-server run typecheck
pnpm --dir artifacts/api-server build
```

Sem `PNCP_TEST_DATABASE_URL`, testes que exigem PostgreSQL são ignorados. Com a variável, cada suíte cria e remove um schema isolado.
