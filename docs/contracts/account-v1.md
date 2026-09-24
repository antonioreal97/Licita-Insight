# Contrato — Account API v1 (login, salvos, monitoramento, notificações)

Status: **ACEITO E IMPLEMENTADO** pelo `CODEX_BACKEND_AGENT` · integração liberada em `docs/handoffs/CLAUDE_HANDOFF-004-account.md`

Decisões do owner (23–24 set 2026): login **Google OAuth**; notificações no app e por e-mail;
monitoramento de **editais específicos** e de **buscas salvas**; envio por Resend com digest diário
e alertas críticos imediatos.

O Codex é autoridade sobre schema, sessão, segurança e geração de alertas. Este documento fixa a
forma pública consumida pelo frontend. Mesmas convenções de `search-v1.md` (JSON camelCase, enums
`snake_case`, datas ISO 8601, envelope de erro `{ error: { code, message, details?, requestId } }`).

## Topologia e cookies

- O frontend chama a API pela **mesma origem**: o Vite (dev) faz proxy de `/api` → `http://localhost:3001`.
  `VITE_API_BASE_URL=/api`. Em produção, mesmo esquema (reverse proxy). Assim o cookie é first-party.
- Sessão em cookie `licita_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` fora de dev,
  validade de 10 minutos sem atividade, renovada a cada requisição autenticada (no máximo uma escrita por minuto). Sessões guardadas no PostgreSQL (revogáveis).
- **CSRF:** toda requisição que muda estado (`POST|PUT|PATCH|DELETE` sob `/api/v1/me`, `/auth/logout`
  e `/auth/dev-login`)
  exige o header `X-Requested-With: licita-insight` **e** `Origin` igual à origem pública configurada.
  Sem isso → 403 `FORBIDDEN`.
- Rotas de busca/detalhe (`search-v1`) continuam **públicas**. Tudo sob `/api/v1/me/*` exige sessão.
  Salvar, monitorar, buscas salvas e notificações exigem também assinatura ativa (`402`).
  Billing, LGPD (`GET /me/export`, `DELETE /me`) e preferências de e-mail exigem só sessão; as
  mutações autenticadas também exigem CSRF.

## Novos códigos de erro

| HTTP | code | Quando |
|---|---|---|
| 401 | `UNAUTHENTICATED` | sem sessão / sessão expirada / webhook Asaas com token inválido |
| 402 | `SUBSCRIPTION_REQUIRED` | rota paga sem assinatura ativa |
| 403 | `FORBIDDEN` | CSRF inválido, recurso de outro usuário |
| 404 | `NOT_FOUND` | recurso ou edital inexistente |
| 409 | `CONFLICT` | limite atingido (`details: [{ field: 'limit', issue: 'max_saved_tenders' }]`) ou assinatura já ativa / não cancelável |
| 503 | `BILLING_UNAVAILABLE` | Asaas não configurado ou recusou a cobrança |
| 400 | `INVALID_PARAMETER` | corpo inválido (inclui `query` de busca salva inválida) |

---

## 1. Autenticação (Google OAuth — authorization code + PKCE, no servidor)

### `GET /api/v1/auth/google/start?returnTo=/caminho`
302 para o Google. `returnTo` aceita apenas caminhos relativos do app (começa com `/`, sem `//`);
qualquer outro valor vira `/dashboard`. `state` + PKCE guardados em cookie temporário assinado.
Se as credenciais Google não estiverem configuradas, responde 302 para
`/login?error=oauth_unavailable` e registra aviso operacional, sem expor erro interno.

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
  lastCheckedAt: string | null; // última avaliação pelo job de buscas salvas
  newMatchesCount: number;      // editais novos desde a última visita (zerado por /seen)
};
```

| Método | Caminho | Corpo | Resposta |
|---|---|---|---|
| GET | `/api/v1/me/saved-searches` | — | `{ data: SavedSearch[] }` (`updatedAt desc`) |
| POST | `/api/v1/me/saved-searches` | `{ name, query, alertsEnabled }` | 201 `SavedSearch` |
| PATCH | `/api/v1/me/saved-searches/{id}` | `{ name?, query?, alertsEnabled? }` | 200 `SavedSearch` |
| DELETE | `/api/v1/me/saved-searches/{id}` | — | 204 |
| POST | `/api/v1/me/saved-searches/{id}/restore` | — | 200 `SavedSearch` restaurada, preservando o `id` |
| POST | `/api/v1/me/saved-searches/{id}/seen` | — | 200 `SavedSearch` com `newMatchesCount = 0` |

Limite: 50 buscas salvas por usuário (409 `CONFLICT`).
Uma segunda busca ativa com a mesma query canônica responde 409 `CONFLICT` com
`details: [{ field: 'query', issue: 'duplicate', existingId }]`, inclusive em alterações de query.
Exclusões são reversíveis por 30 segundos; o restore zera `newMatchesCount`, reinicia o checkpoint
de alertas e responde 409 `restore_expired` após a janela. Se outra busca ativa já ocupar a mesma
query, o restore responde o conflito `duplicate`.

## 4. Notificações (dentro do app)

Geradas por processos da API, nunca pelo frontend.

```ts
type NotificationType =
  | 'tender_deadline_changed'   // proposalDeadline mudou
  | 'tender_status_changed'     // status mudou
  | 'tender_document_added'     // novo documento
  | 'tender_value_changed'      // estimatedValue ou estimatedValueStatus mudou
  | 'saved_search_new_matches'  // editais novos que batem com uma busca salva com alertas
  | 'trial_ending';             // teste termina em até 3 dias

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
- **Buscas salvas com `alertsEnabled`:** um job independente da coleta avalia a busca contra os
  editais **vistos pela primeira vez** desde `lastCheckedAt`; se houver ≥ 1, criar uma notificação
  `saved_search_new_matches` com `matchCount` e até 20 `tenderIds`, somar em `newMatchesCount` e
  atualizar `lastCheckedAt`.
- **Fim do teste:** um scheduler da API avalia a cada 6 horas usuários cujo `trialEndsAt` está entre
  agora e D-3 e cria exatamente uma notificação `trial_ending` por usuário.
- Deduplicar: a mesma mudança não gera duas notificações para o mesmo usuário.
- Retenção sugerida: 90 dias.

## 5. E-mail

O canal de e-mail reutiliza as notificações persistidas como snapshots. As preferências e o
descadastro permanecem acessíveis sem assinatura ativa.

```ts
type NotificationPreferences = {
  email: { digest: 'daily' | 'off'; immediateCritical: boolean };
  emailAddress: string;
  updatedAt: string | null;
};
```

| Método | Caminho | Corpo | Resposta |
|---|---|---|---|
| GET | `/api/v1/me/notification-preferences` | — | `NotificationPreferences` |
| PUT | `/api/v1/me/notification-preferences` | `{ email: { digest?: 'daily' \| 'off'; immediateCritical?: boolean } }` | `NotificationPreferences` |
| POST | `/api/v1/email/unsubscribe` | `{ token, scope: 'all' \| 'digest' \| 'immediate' }` | `{ scope, email: { digest, immediateCritical } }` |

- `GET` e `PUT` exigem sessão; `PUT` exige CSRF. Ambos ficam fora do gate de assinatura.
- `PUT` é parcial, mas precisa informar ao menos uma propriedade de `email`; corpo vazio responde
  `400 INVALID_PARAMETER`.
- O padrão para contas novas e preexistentes é `digest: 'daily'` e `immediateCritical: true`.
- O descadastro é público e idempotente. Token ou escopo inválido responde
  `400 INVALID_PARAMETER`. O token é opaco, assinado com HMAC-SHA256 usando `SESSION_SECRET`, não
  contém PII legível e não possui expiração curta.
- Todo e-mail inclui a página `/descadastro?token=...&scope=all`, preferências em
  `/settings#notificacoes` e os headers `List-Unsubscribe` e `List-Unsubscribe-Post` para
  descadastro em um clique.
- O digest roda às 07:00 em `America/Sao_Paulo` por padrão, agrega notificações lidas ou não que
  ainda não foram vinculadas a uma entrega e não envia e-mail vazio.
- Alertas imediatos agrupam por 10 minutos mudanças de prazo e mudanças de status para
  `suspended`/`cancelled` em editais que continuam monitorados. `trial_ending` também é enviado
  imediatamente uma única vez.
- Entregas exigem acesso vigente, exceto `trial_ending`. Uma notificação é vinculada a no máximo
  uma entrega de e-mail, evitando duplicação entre envio imediato e digest.
- A entrega persiste o payload exato, status `queued | sent | failed | skipped`, tentativas, próximo
  retry, erro e id do provedor. Falhas transitórias usam backoff de 1, 5 e 30 minutos, com no máximo
  três tentativas. `dedupeKey` local e `Idempotency-Key` no Resend tornam o envio idempotente.
- Sem `RESEND_API_KEY` ou `MAIL_FROM`, a API permanece disponível, registra warning e marca a
  entrega como `skipped`.
- As mensagens são HTML simples + texto puro em PT-BR, sem pixel, imagem ou link de tracking
  gerado pela aplicação. O rastreamento de abertura/clique também deve permanecer desligado no
  domínio do Resend.

## Assinatura (Asaas)

Um plano mensal. O valor vem de `BILLING_MONTHLY_BRL` (não fica no código). Sem `ASAAS_API_KEY`,
`ASAAS_API_BASE_URL` (https), `ASAAS_WEBHOOK_TOKEN` e o valor, o checkout responde `503 BILLING_UNAVAILABLE`
e o restante do app segue no ar.

Acesso (`entitled`) quando há assinatura elegível (`active`, ou `canceled` com período pago ainda
vigente), teste vigente ou bypass de desenvolvimento. A prioridade pública da origem é
`subscription > trial > dev`. Sem linha na tabela `subscriptions` = `status: none`.

```ts
type BillingResponse = {
  status: 'none' | 'pending' | 'active' | 'past_due' | 'canceled';
  entitled: boolean;
  source: 'subscription' | 'trial' | 'dev' | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  canCancel: boolean;
  monthlyBrl: number | null;
};
```

O teste dura 7 dias desde a criação do usuário. A migration `0003_trial_access` concede 7 dias desde
sua execução aos usuários preexistentes. Um tombstone fora de `users` preserva somente HMAC-SHA256
do Google `sub` (com `SESSION_SECRET`) e o fim original do teste. Excluir e recriar a conta preserva
apenas os dias restantes, sem reiniciar o período; e-mail e nome nunca entram no tombstone.

Em desenvolvimento, `BILLING_DEV_ENTITLED=true` libera o gate para qualquer usuário autenticado
somente quando `NODE_ENV !== 'production'`. `source: 'dev'` só aparece quando não há assinatura nem
teste vigente. Em produção a variável é sempre ignorada, mesmo se definida como `true`.

| Método | Caminho | Auth | Resposta |
|---|---|---|---|
| GET | `/api/v1/me/billing` | sessão | `BillingResponse` |
| GET | `/api/v1/billing/plan` | pública | `{ monthlyBrl: number | null, trialDays: 7, currency: 'BRL' }` |
| POST | `/api/v1/me/billing/checkout` | sessão + CSRF | `{ url }` — link recorrente do Asaas (Pix, boleto ou cartão). Permitido durante o teste; 409 somente se já houver assinatura elegível. |
| POST | `/api/v1/me/billing/cancel` | sessão + CSRF | `BillingResponse` — cancela no Asaas; o período já pago continua. |
| POST | `/api/v1/billing/asaas/webhook` | header `asaas-access-token` | `{ received: true }`. Sem cookie e sem CSRF. |

Webhook (idempotente): `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED` ativam até `nextDueDate` da assinatura;
`PAYMENT_OVERDUE` marca `past_due` (uma cobrança antiga não derruba um período já pago);
`PAYMENT_REFUNDED` cancela e encerra o período. Evento desconhecido responde 200 e não altera a linha.
O usuário é casado por `externalReference` ou pelo `paymentLink` / assinatura já gravados.
O checkout do Asaas disponível nesta versão cobra imediatamente; pagar durante o teste troca
`source` para `subscription` e não posterga a primeira cobrança até `trialEndsAt`.

## LGPD — exportação e exclusão da conta

Estas rotas ficam deliberadamente fora do gate de assinatura para garantir acesso aos direitos do
titular mesmo sem plano ativo.

### `GET /api/v1/me/export`

Responde `200 application/json` com `Content-Disposition: attachment;
filename="licitai-dados-YYYY-MM-DD.json"` e `Cache-Control: no-store`.

```ts
type AccountExport = {
  exportedAt: string;
  user: { id: string; email: string; name: string | null; avatarUrl: string | null; trialEndsAt: string; emailDigest: 'daily' | 'off'; emailImmediateCritical: boolean; emailPreferencesUpdatedAt: string | null; createdAt: string; updatedAt: string };
  sessions: Array<{ createdAt: string; lastSeenAt: string; expiresAt: string }>;
  savedTenders: Array<{ tenderId: string; savedAt: string; monitored: boolean; monitoredAt: string | null }>;
  savedSearches: Array<SavedSearch & { deletedAt: string | null }>;
  notifications: Array<Record<string, unknown>>;
  emailDeliveries: Array<{ id: string; mode: 'digest' | 'immediate'; status: 'queued' | 'sent' | 'failed' | 'skipped'; recipientEmail: string; subject: string; attempts: number; lastError: string | null; providerMessageId: string | null; createdAt: string; updatedAt: string; sentAt: string | null }>;
  subscription: { status: string; currentPeriodEnd: string | null; updatedAt: string } | null;
};
```

Somente sessões ativas são exportadas. Tokens, hashes de sessão, `googleSub`, chaves do Asaas,
identificadores internos de cobrança, tokens de descadastro, corpos/headers de e-mail e `dedupeKey`
de notificações não são incluídos. Buscas ainda retidas por soft delete e metadados de entregas de
e-mail são incluídos.

### `DELETE /api/v1/me`

Exige sessão, CSRF e corpo exato `{ "confirm": "EXCLUIR" }`; confirmação ausente ou diferente
responde `400 INVALID_PARAMETER`. Sucesso responde `204`, remove `users` e todos os dados pessoais
por cascata, invalida todas as sessões e limpa o cookie.

Quando existe assinatura remota não cancelada, a API cancela primeiro no Asaas. Falha remota responde
`503 BILLING_UNAVAILABLE` sem iniciar a exclusão local. Depois do sucesso remoto, a exclusão local
ocorre em uma única transação. Se essa transação falhar, os dados permanecem íntegros e a compensação
marca localmente a assinatura como `canceled`, permitindo repetir a exclusão sem cobrar/cancelar de
novo.

O tombstone antiabuso do teste é deliberadamente preservado após a exclusão. Ele não possui FK para
`users` e contém somente HMAC não reversível do Google `sub`, `trialEndsAt` e `createdAt`, com
finalidade documentada de impedir repetição do benefício.

## Performance esperada

`/auth/session`, `/me/saved-tenders/ids`, `/me/notifications/unread-count`: p95 < 100 ms.
Demais rotas `/me/*`: p95 < 300 ms.

## Fora de escopo v1

Push, compartilhamento de buscas, times/organizações e papéis.

## Esclarecimentos propostos pelo frontend (Codex: confirme ou contraponha no CLAUDE_HANDOFF-004)

1. `GET /auth/session` sem sessão → 401 **com** envelope `{ error: { code: 'UNAUTHENTICATED' } }`.
2. `PUT /me/saved-tenders/{id}` com corpo `{}` num edital já salvo **preserva** `monitored`; só `{ monitored: bool }` altera.
3. `import` perto do limite: importa até completar 500 e responde 200 com `{ imported, alreadySaved, notFound, skippedByLimit: number }` (campo aditivo); `notFound` não conta em `alreadySaved`.
4. `PUT` para edital inexistente → 404 `NOT_FOUND`.
5. `query` de busca salva é armazenada/devolvida **sem** `?` inicial.
6. `POST /auth/logout` exige o header `X-Requested-With`, mas é aceito sem sessão (204 idempotente); a checagem de `Origin` vale como nas demais mutações.
7. `POST /me/notifications/read` sem `ids` nem `all` → 400 `INVALID_PARAMETER`.
8. Origem pública única: `PUBLIC_APP_ORIGIN=http://localhost:24252` em dev (usar `localhost`, não `127.0.0.1`, inclusive na redirect URI do Google).

## Decisões do backend

- Os oito esclarecimentos do frontend foram aceitos sem contraproposta e estão cobertos pelo OpenAPI e pelos testes HTTP/integrados.
- Sessões usam tokens aleatórios; somente o hash SHA-256 é persistido. A validade é de 10 minutos sem atividade, com renovação deslizante. O token não vai para o `localStorage`.
- Limites de salvos são serializados por usuário com advisory lock transacional, além das constraints de unicidade do PostgreSQL.
- Alertas de edital são criados na mesma transação do upsert/revisão e deduplicados por usuário + mudança. Alertas de busca são avaliados por job próprio, desacoplado da coleta PNCP.
- Notificações mantêm snapshots mínimos de edital/busca para permanecerem legíveis mesmo após mudanças posteriores; notificações e entregas de e-mail têm retenção operacional de 90 dias.
- O índice de busca continua reconstruível a partir do banco canônico; nenhuma tabela de conta passa a ser fonte de verdade para os dados públicos do edital.
- Follow-up 005: OAuth indisponível redireciona com `oauth_unavailable`; dev-login exige CSRF; queries canônicas ativas são únicas por usuário; exclusão de busca usa soft delete com restore de 30 segundos.
