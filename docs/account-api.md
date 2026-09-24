# Account API v1 — operação local

Implementação de autenticação Google, sessões revogáveis, editais salvos/monitorados, buscas salvas e notificações no app. O contrato público está em `docs/contracts/account-v1.md` e o OpenAPI em `lib/api-spec/openapi.yaml`.

## Configuração

Variáveis obrigatórias para Google OAuth:

```text
DATABASE_URL=postgres://licita:licita@localhost:5432/licita
PORT=3001
PUBLIC_APP_ORIGIN=http://localhost:24252
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=... # mínimo 32 caracteres, valor aleatório
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
pnpm --filter @workspace/db run migrate
PORT=3001 PNCP_DAILY_COLLECT=false pnpm --filter @workspace/api-server run dev
```

As migrations `0001_account`, `0002_account_followups` e `0003_trial_access` pressupõem o schema
canônico de busca já instalado pelos ciclos anteriores. A terceira concede 7 dias de teste aos
usuários existentes e adiciona o tombstone mínimo antiabuso da identidade Google.

## Segurança

- O cookie `licita_session` é `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` fora de desenvolvimento.
- O token de sessão nunca é persistido em claro; o banco guarda seu hash SHA-256.
- Mutações pessoais, logout e dev-login exigem `X-Requested-With: licita-insight` e `Origin` exatamente igual a `PUBLIC_APP_ORIGIN`.
- O fluxo Google usa authorization code, PKCE S256, `state` assinado, `nonce`, validação RS256 via JWKS, issuer, audience, expiração e `email_verified`.
- `returnTo` aceita somente caminhos relativos seguros; redirecionamentos externos caem em `/dashboard`.
- CORS aberto foi removido. O frontend usa proxy/reverse proxy de mesma origem.
- Sem credenciais Google, `/auth/google/start` redireciona para `/login?error=oauth_unavailable` e registra um aviso estruturado.
- `GET /api/v1/me/export` e `DELETE /api/v1/me` exigem autenticação, mas nunca assinatura ativa.

## LGPD

- `GET /api/v1/me/export` baixa os dados pessoais retidos, incluindo buscas em soft delete, sem
  tokens, hashes de sessão, `googleSub`, ids internos do Asaas ou chaves de deduplicação.
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
- Buscas com alertas são avaliadas ao final da coleta contra `tenders.created_at` desde `lastCheckedAt`.
- `notifications(user_id, dedupe_key)` impede duplicatas; registros com mais de 90 dias são removidos após a avaliação.
- O scheduler de trial roda no boot e a cada 6 horas, criando uma única notificação `trial_ending`
  quando faltam no máximo 3 dias.

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
pnpm run typecheck
pnpm --dir artifacts/api-server build
```

Sem `PNCP_TEST_DATABASE_URL`, testes que exigem PostgreSQL são ignorados. Com a variável, cada suíte cria e remove um schema isolado.
