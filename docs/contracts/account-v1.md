# Contrato — Account API v1 (login, salvos, monitoramento, notificações)

Status: **ACEITO E IMPLEMENTADO** pelo `CODEX_BACKEND_AGENT` · integração liberada em [`docs/handoffs/CLAUDE_HANDOFF-004-account.md`](../handoffs/CLAUDE_HANDOFF-004-account.md)

Decisões do owner (23–24 set 2026): login **Google OAuth**; notificações no app e por e-mail;
monitoramento de **editais específicos** e de **buscas salvas**; envio por Resend com digest diário
e alertas críticos imediatos.

O Codex é autoridade sobre schema, sessão, segurança e geração de alertas. Este documento fixa a
forma pública consumida pelo frontend. Mesmas convenções de [`search-v1.md`](search-v1.md) (JSON camelCase, enums
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
  Billing, LGPD (`GET /me/export`, `DELETE /me`) e preferências de e-mail/recomendações exigem só sessão; as
  mutações autenticadas também exigem CSRF.

## Novos códigos de erro

| HTTP | code                    | Quando                                                                                                                |
| ---- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 401  | `UNAUTHENTICATED`       | sem sessão / sessão expirada / webhook Asaas com token inválido                                                       |
| 402  | `SUBSCRIPTION_REQUIRED` | rota paga sem assinatura ativa                                                                                        |
| 403  | `FORBIDDEN`             | CSRF inválido, recurso de outro usuário                                                                               |
| 404  | `NOT_FOUND`             | recurso ou edital inexistente                                                                                         |
| 409  | `CONFLICT`              | limite atingido (`details: [{ field: 'limit', issue: 'max_saved_tenders' }]`) ou assinatura já ativa / não cancelável |
| 503  | `BILLING_UNAVAILABLE`   | Asaas não configurado ou recusou a cobrança                                                                           |
| 400  | `INVALID_PARAMETER`     | corpo inválido (inclui `query` de busca salva inválida)                                                               |

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
type User = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
};
```

### `POST /api/v1/auth/logout`

204. Revoga a sessão no banco e limpa o cookie. Idempotente.

### (Somente desenvolvimento) `POST /api/v1/auth/dev-login` `{ email: string, name?: string }`

Existe **apenas** quando `NODE_ENV !== 'production'` **e** `AUTH_DEV_LOGIN=true`; caso contrário a
rota não é registrada (404). Serve para QA/testes automatizados sem conta Google. Retorna 204 + cookie.

---

## 2. Editais salvos e monitorados

Monitorar implica salvar: `monitored` é um atributo do edital salvo.

Extensão implementada em setembro de 2026: [participação por usuário e edital](participation-v1.md).
Ela acrescenta etapas, checklist triestado, protocolo, próxima ação, histórico e filtros à lista,
além do GET individual. Os campos também fazem parte da exportação pessoal. As formas mínimas
abaixo continuam aceitas; consulte a extensão para o contrato completo.

```ts
type SavedTender = {
  tender: TenderSummary;
  savedAt: string;
  monitored: boolean;
  monitoredAt: string | null;
};
```

| Método | Caminho                               | Corpo / params                                             | Resposta                                                                 |
| ------ | ------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/api/v1/me/saved-tenders`            | `page`, `pageSize` (1–100, def. 20), `monitored?: boolean` | `{ data: SavedTender[]; pagination }` ordenado por `savedAt desc`        |
| GET    | `/api/v1/me/saved-tenders/ids`        | —                                                          | `{ saved: string[]; monitored: string[] }` (para marcar botões na lista) |
| PUT    | `/api/v1/me/saved-tenders/{tenderId}` | `{ monitored?: boolean }`                                  | 200 `SavedTender` — idempotente (salva ou atualiza)                      |
| DELETE | `/api/v1/me/saved-tenders/{tenderId}` | —                                                          | 204 (idempotente)                                                        |
| POST   | `/api/v1/me/saved-tenders/import`     | `{ ids: string[] }` (≤ 500)                                | `{ imported: number; alreadySaved: number; notFound: string[] }`         |

`import` migra, uma vez, os ids que o navegador guardou em `localStorage` antes do login.
Limite: 500 editais salvos por usuário (409 `CONFLICT`).

## 3. Buscas salvas

`query` é a query string **canônica** gerada pelo frontend (`searchParamsToUrl`, sem `page`, `pageSize`
e `view`), ex. `q=limpeza&state=DF&status=open`. O backend valida com o mesmo parser da rota de busca
e devolve a forma canônica que guardou.

```ts
type SavedSearch = {
  id: string;
  name: string; // 1–80 chars
  query: string; // canônica
  alertsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string | null; // última avaliação pelo job de buscas salvas
  newMatchesCount: number; // editais novos desde a última visita (zerado por /seen)
};
```

| Método | Caminho                                  | Corpo                               | Resposta                                         |
| ------ | ---------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| GET    | `/api/v1/me/saved-searches`              | —                                   | `{ data: SavedSearch[] }` (`updatedAt desc`)     |
| POST   | `/api/v1/me/saved-searches`              | `{ name, query, alertsEnabled }`    | 201 `SavedSearch`                                |
| PATCH  | `/api/v1/me/saved-searches/{id}`         | `{ name?, query?, alertsEnabled? }` | 200 `SavedSearch`                                |
| DELETE | `/api/v1/me/saved-searches/{id}`         | —                                   | 204                                              |
| POST   | `/api/v1/me/saved-searches/{id}/restore` | —                                   | 200 `SavedSearch` restaurada, preservando o `id` |
| POST   | `/api/v1/me/saved-searches/{id}/seen`    | —                                   | 200 `SavedSearch` com `newMatchesCount = 0`      |

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
  | "tender_deadline_changed" // proposalDeadline mudou
  | "tender_status_changed" // status mudou
  | "tender_document_added" // novo documento
  | "tender_value_changed" // estimatedValue ou estimatedValueStatus mudou
  | "saved_search_new_matches" // editais novos que batem com uma busca salva com alertas
  | "profile_new_matches" // editais novos com alta aderência ao perfil da empresa
  | "trial_ending"; // teste termina em até 3 dias

type Notification = {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  tender: {
    id: string;
    title: string;
    tenderNumberShort: string | null;
    isNew: boolean;
  } | null; // tipos tender_*
  change: {
    field: string;
    from: string | number | null;
    to: string | number | null;
  } | null;
  savedSearch: { id: string; name: string; query: string } | null; // saved_search_*
  matchCount: number | null;
  newMatchCount: number | null; // resultados vinculados que ainda estão na janela de novos
  tenderIds: string[]; // até 20 ids dos novos editais (saved_search_new_matches / profile_new_matches)
  profileMatches: Array<{
    id: string;
    title: string;
    organizationName: string;
    proposalDeadline: string | null;
    level: "high";
  }>;
};
```

| Método | Caminho                                 | Params / corpo                                    | Resposta                                                                            |
| ------ | --------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/api/v1/me/notifications`              | `unreadOnly?`, `page`, `pageSize` (1–50, def. 20) | `{ data: Notification[]; pagination; unreadCount: number }` (`createdAt desc`)      |
| GET    | `/api/v1/me/notifications/unread-count` | —                                                 | `{ unreadCount: number }` — barato; frontend consulta a cada 60 s com a aba visível |
| POST   | `/api/v1/me/notifications/read`         | `{ ids?: string[]; all?: boolean }`               | `{ unreadCount: number }`                                                           |

Regras de geração:

- **Editais monitorados:** ao fazer upsert/revisão de um edital, comparar com o estado anterior
  persistido; para cada campo alterado e cada usuário que monitora o edital, uma notificação.
  Não notificar na primeira ingestão do edital.
- **Buscas salvas com `alertsEnabled`:** um job independente da coleta avalia a busca contra os
  editais **vistos pela primeira vez** desde `lastCheckedAt`; se houver ≥ 1, criar uma notificação
  `saved_search_new_matches` com `matchCount` e até 20 `tenderIds`, somar em `newMatchesCount` e
  atualizar `lastCheckedAt`. O link abre `/search?status=all&notification=<id>`, que preserva o
  snapshot mesmo depois da janela de novos; a busca original fica disponível como ação secundária.
- **Fim do teste:** um scheduler da API avalia a cada 6 horas usuários cujo `trialEndsAt` está entre
  agora e D-3 e cria exatamente uma notificação `trial_ending` por usuário.
- **Perfil da empresa:** antes do digest diário, avaliar somente editais novos desde o checkpoint do
  perfil e criar no máximo uma `profile_new_matches` por usuário/dia quando houver aderência alta.
  Com mais de um edital, o link usa o mesmo snapshot por `notification=<id>`; com um, abre o edital.
- Deduplicar: a mesma mudança não gera duas notificações para o mesmo usuário.
- Retenção sugerida: 90 dias.

## 5. E-mail

O canal de e-mail reutiliza as notificações persistidas como snapshots. As preferências e o
descadastro permanecem acessíveis sem assinatura ativa.

```ts
type NotificationPreferences = {
  email: { digest: "daily" | "off"; immediateCritical: boolean };
  profileAlerts: boolean;
  emailAddress: string;
  updatedAt: string | null;
};
```

| Método | Caminho                               | Corpo                                                                                             | Resposta                                          |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| GET    | `/api/v1/me/notification-preferences` | —                                                                                                 | `NotificationPreferences`                         |
| PUT    | `/api/v1/me/notification-preferences` | `{ email?: { digest?: 'daily' \| 'off'; immediateCritical?: boolean }; profileAlerts?: boolean }` | `NotificationPreferences`                         |
| POST   | `/api/v1/email/unsubscribe`           | `{ token, scope: 'all' \| 'digest' \| 'immediate' }`                                              | `{ scope, email: { digest, immediateCritical } }` |

- `GET` e `PUT` exigem sessão; `PUT` exige CSRF. Ambos ficam fora do gate de assinatura.
- `PUT` é parcial, mas precisa informar ao menos uma propriedade de `email` ou `profileAlerts`; corpo vazio responde
  `400 INVALID_PARAMETER`.
- O padrão para contas novas e preexistentes é `digest: 'daily'`, `immediateCritical: true` e
  `profileAlerts: true` (o alerta só produz eventos quando existe perfil).
- O descadastro é público e idempotente. Token ou escopo inválido responde
  `400 INVALID_PARAMETER`. O token é opaco, assinado com HMAC-SHA256 usando
  `EMAIL_UNSUBSCRIBE_SECRET` (fallback `SESSION_SECRET`), não contém PII legível e não possui
  expiração curta. O segredo dedicado deve permanecer estável nas rotações de sessão.
- Todo e-mail inclui a página `/descadastro?token=...&scope=all`, preferências em
  `/settings#notificacoes` e os headers `List-Unsubscribe` e `List-Unsubscribe-Post` para
  descadastro em um clique.
- O digest roda às 07:00 em `America/Sao_Paulo` por padrão, agrega notificações lidas ou não que
  ainda não foram vinculadas a uma entrega e não envia e-mail vazio.
- **Seus prazos** (seção do digest, antes das novidades): editais salvos do usuário nas etapas
  pessoais `analyzing` (Analisando) e `participating` (Preparando documentos) cujo `nextActionDeadline`
  (prazo pessoal, informado pelo usuário, com o texto de `nextAction`) ou prazo oficial de proposta
  (`proposal_deadline`) cai depois de agora e até o fim do 3º dia seguinte no horário de Brasília.
  Cada edital é um item: título, órgão, etapa pessoal e uma linha de prazo que começa pelo mais
  próximo e, se o outro também estiver na janela, cita-o na mesma linha separado por " · ". Cada
  prazo diz se é "Seu prazo (informado por você)" ou "Prazo oficial de proposta", com data/hora em
  Brasília e "hoje"/"amanhã"/"em N dias"; o item leva link `/tenders/{id}` em `PUBLIC_APP_ORIGIN`.
  Ordem: editais pelo prazo mais próximo de cada um, no máximo 10 editais e "e mais N editais salvos
  com prazo" com link para `/saved-tenders`. O assunto conta prazos (um edital com os dois conta 2).
  Prazos vencidos não entram; o prazo de proposta de edital
  `suspended`, `cancelled` ou `closed` também não. Sem novidades, o digest sai só com os prazos; sem
  nenhum dos dois, nada é enviado. Vale a mesma preferência `digest`, o mesmo gate de acesso
  (assinatura/teste vigente ou convite beta, sem a exceção de `trial_ending`), o mesmo descadastro
  em um clique e a mesma idempotência por usuário e dia de Brasília (`email:digest:{userId}:{data}`):
  rodar o job de novo no mesmo dia não reenvia. Não cria notificação nem preferência nova.
- Alertas imediatos agrupam por 10 minutos mudanças de prazo e mudanças de status para
  `suspended`/`cancelled` em editais que continuam monitorados. `trial_ending` também é enviado
  imediatamente uma única vez.
- Entregas exigem acesso vigente, exceto `trial_ending`. Uma notificação é vinculada a no máximo
  uma entrega de e-mail, evitando duplicação entre envio imediato e digest.
- A entrega persiste o payload exato, status `queued | sent | failed | skipped`, tentativas, próximo
  retry, erro e id do provedor. Falhas transitórias usam backoff de 1, 5 e 30 minutos, com no máximo
  três tentativas. `dedupeKey` local evita duplicação; Resend recebe `Idempotency-Key` e Brevo recebe
  uma tag de entrega derivada por hash para rastreabilidade sem expor o identificador interno.
- `EMAIL_PROVIDER=brevo|resend` escolhe explicitamente o provedor. Sem a variável, Brevo é usado
  quando `BREVO_API_KEY` existe; caso contrário, Resend é usado quando `RESEND_API_KEY` existe.
  Sem chave de provedor ou `MAIL_FROM`, a API permanece disponível, registra warning e marca a
  entrega como `skipped`. `MAIL_REPLY_TO` é opcional.
- As mensagens são HTML simples + texto puro em PT-BR, sem pixel ou link de tracking gerado pela
  aplicação. A única imagem é a logo do cabeçalho (PNG estático em
  `${PUBLIC_APP_ORIGIN}/brand/email/pardal-logo-lima-2x.png`, servido junto com o frontend), com a
  mesma URL para todos os destinatários. O rastreamento de abertura/clique também deve permanecer
  desligado no domínio do provedor.

## 6. Perfil da empresa e filtros inteligentes

O perfil da empresa (`GET|PUT|DELETE /api/v1/me/company-profile`) exige apenas sessão, com CSRF no `PUT` e no `DELETE`. A prévia da região exige acesso ativo (`402 SUBSCRIPTION_REQUIRED` sem acesso); alertas e aderência continuam pagos. A exportação LGPD permanece acessível com apenas sessão. Decisão do dono de 13/10/2026: o perfil da empresa continua disponível sem acesso ativo.

`GET|PUT|DELETE /api/v1/me/company-profile` continua aceitando os campos históricos `description`, `offerings`, `exclusions`, `coverage`, `valueRange` e `size`. O `PUT` também persiste três listas explícitas, devolvidas no `GET` e incluídas na exportação LGPD:

```ts
type CompanyProfileSmartFilters = {
  selectedCategories: string[]; // slugs da taxonomia canônica
  selectedKeywords: string[]; // formas de exibição escolhidas no vocabulário
  excludedKeywords: string[]; // remoção rígida em recomendações e alertas
};
```

Clientes anteriores podem omitir as três propriedades; a API as trata como listas vazias. Os novos clientes sempre as enviam. Cada lista aceita no máximo 20 valores únicos; categorias fora da lista canônica respondem `400 INVALID_PARAMETER`.

### Região de atuação

`coverage` passou a representar a região combinável e o comportamento de recomendação:

```ts
type MunicipalityReference = { ibgeCode: string; name: string; state: string };
type CompanyCoverage =
  | { scope: "national"; mode: "strict" | "prioritize"; acceptsRemote: boolean }
  | {
      scope: "custom";
      mode: "strict" | "prioritize";
      acceptsRemote: boolean;
      regions: Array<
        "north" | "northeast" | "central_west" | "southeast" | "south"
      >;
      states: string[];
      municipalities: MunicipalityReference[];
      radius: {
        center: MunicipalityReference;
        km: 50 | 100 | 200 | 300 | 500;
      } | null;
    };
```

O servidor valida nomes e UFs a partir do `ibgeCode`; valores enviados pelo cliente não substituem o catálogo oficial embarcado. O formato histórico `{scope:'states',states:[...]}` continua aceito no `PUT` e é convertido para `custom`, sem perda de `coverage_states`. `strict` remove editais fora da área das recomendações, alertas e do atalho de busca; `prioritize` mantém esses editais com peso menor e motivo “Fora da sua região”. `acceptsRemote` inclui categorias detectáveis como remotas.

| Método | Caminho                                     | Entrada                               | Resposta                                     |
| ------ | ------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| GET    | `/api/v1/profile/municipalities?q=&state=`  | nome com 2–80 caracteres; UF opcional | `{data: MunicipalityReference[]}` (máx. 20)  |
| GET    | `/api/v1/me/company-profile/region-preview` | —                                     | `{count}` de editais abertos na região salva |

O catálogo e as coordenadas de sede vêm do produto oficial “Localidades do Brasil” do IBGE e ficam no repositório; não há consulta externa em runtime. Fonte e termos de uso estão em [`docs/data/ibge-municipalities.md`](../data/ibge-municipalities.md).

| Método | Caminho                                     | Entrada                               | Resposta                                         |
| ------ | ------------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| GET    | `/api/v1/profile/categories`                | —                                     | `{data: Array<{slug,label,openTenderCount}>}`    |
| GET    | `/api/v1/profile/keywords/suggest?q=`       | `q` com 2–80 caracteres               | `{data: ProfileKeywordSuggestion[]}` (máx. 10)   |
| POST   | `/api/v1/profile/keywords/from-description` | `{description}` com 20–600 caracteres | `{keywords,categories,estimatedOpenTenderCount}` |

### Plataformas em que a empresa é cadastrada

O `PUT` também aceita `registeredPlatforms: string[]` (opcional; omitido = `[]`), devolvido sempre no `GET` e na exportação LGPD. Os valores são slugs de `GET /api/v1/profile/platforms`: as salas de disputa conhecidas (mesmos slugs de `platform.slug` em [`search-v1.md`](./search-v1.md)) e `sicaf`. Slug desconhecido responde `400 INVALID_PARAMETER` com `field: registeredPlatforms.<i>` e `issue: invalid_value`; repetido, `issue: duplicate`.

A lista não entra no cálculo de aderência: quando só ela muda, o `PUT` atualiza `updatedAt` e mantém `version`, sem descartar os selos já calculados nem gerar novas chamadas de IA. Ela serve para desempate nas recomendações ([`recommendations-v1.md`](./recommendations-v1.md)) e para o aviso "Você ainda não é cadastrado nesta plataforma", mostrado só quando o perfil declara ao menos uma plataforma e a disputa é em uma sala conhecida fora da lista.

| Método | Caminho                     | Entrada | Resposta                                                                                                      |
| ------ | --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/profile/platforms` | —       | `{data: Array<{slug,label,url,kind:'platform'\|'registry',openTenderCount:number\|null}>}` (SICAF com `null`) |

As rotas desta seção exigem sessão e usam o limite leve geral de leitura autenticada (240/min por padrão; o POST de sugestão usa o limite de escrita autenticada, 60/min). O POST apenas calcula sugestões e não altera estado, portanto não exige assinatura.

O vocabulário global é materializado em `profile_keyword_vocabulary`: unigramas, bigramas e trigramas de títulos, objetos e itens de editais abertos, com chave em minúsculas sem acento, forma de exibição, contagem de editais, categoria predominante e seis relacionados por coocorrência. Stopwords não aparecem como unigramas. Apenas termos presentes em pelo menos três editais entram, limitados aos 15 mil mais frequentes; a fase intermediária também é limitada a 60 mil candidatos e 250 mil hashes de termos vistos uma vez para manter a memória previsível. A extensão `pg_trgm`, já criada pelo baseline do projeto, alimenta o índice GIN do autocomplete; a normalização sem acento é feita pela aplicação, sem depender de `unaccent`.

O job `profile_keyword_vocabulary` roda diariamente às 04:00 em `America/Sao_Paulo`, fora da coleta PNCP das 06:00, sob advisory lock. `PROFILE_KEYWORD_DAILY_REFRESH=false` o desliga; `pnpm --filter @workspace/api-server run profile-keywords:refresh` executa manualmente. A troca do conteúdo ocorre em transação depois do cálculo, preservando o vocabulário anterior se o job falhar.

## Assinatura (Asaas)

Um plano mensal. O valor vem de `BILLING_MONTHLY_BRL` (não fica no código). Sem `ASAAS_API_KEY`,
`ASAAS_API_BASE_URL` (https), `ASAAS_WEBHOOK_TOKEN` e o valor, o checkout responde `503 BILLING_UNAVAILABLE`
e o restante do app segue no ar.

Acesso (`entitled`) quando há assinatura elegível (`active`, ou `canceled` com período pago ainda
vigente), teste vigente, acesso beta por convite ou bypass de desenvolvimento. A prioridade pública
da origem é `subscription > coupon > trial > dev > beta` (em produção `dev` nunca aparece). Sem linha na tabela
`subscriptions` = `status: none`.

```ts
type BillingResponse = {
  status: "none" | "pending" | "active" | "past_due" | "canceled";
  entitled: boolean;
  source: "subscription" | "coupon" | "trial" | "beta" | "dev" | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  couponAccessUntil: string | null;
  canCancel: boolean;
  monthlyBrl: number | null;
};
```

O teste dura 7 dias desde a criação do usuário. A migration `0003_trial_access` concede 7 dias desde
sua execução aos usuários preexistentes. Um tombstone fora de `users` preserva somente HMAC-SHA256
do Google `sub` (com `SESSION_SECRET`) e o fim original do teste. Excluir e recriar a conta preserva
apenas os dias restantes, sem reiniciar o período; e-mail e nome nunca entram no tombstone.

Beta fechado (`source: 'beta'`): liberação dada pelo owner, fora do Asaas, na tabela
`beta_access_grants` (e-mail, `access_until`, `revoked_at`), gerida pelo runner
`lib/db/scripts/beta-access.mjs` (grant/revoke/list; exige `DATABASE_URL` explícito). Vale enquanto
não revogada e antes de `access_until`, com e-mail comparado sem diferenciar maiúsculas. É respeitada
pelo gate `402`, por `GET /me/billing` e pela elegibilidade de e-mail; webhook e cancelamento do Asaas
não leem nem alteram essa tabela.

Em desenvolvimento, `BILLING_DEV_ENTITLED=true` libera o gate para qualquer usuário autenticado
somente quando `NODE_ENV !== 'production'`. `source: 'dev'` só aparece quando não há assinatura nem
teste vigente. Em produção a variável é sempre ignorada, mesmo se definida como `true`.

| Método | Caminho                         | Auth                          | Resposta                                                                                                                               |
| ------ | ------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/me/billing`            | sessão                        | `BillingResponse`                                                                                                                      |
| GET    | `/api/v1/billing/plan`          | pública                       | `{ monthlyBrl: number                                                                                                                  | null, trialDays: 7, currency: 'BRL' }` |
| POST   | `/api/v1/me/billing/checkout`   | sessão + CSRF                 | `{ url }` — link recorrente do Asaas (Pix, boleto ou cartão). Permitido durante o teste; 409 somente se já houver assinatura elegível. |
| POST   | `/api/v1/me/billing/cancel`     | sessão + CSRF                 | `BillingResponse` — cancela no Asaas; o período já pago continua.                                                                      |
| POST   | `/api/v1/me/billing/coupon`     | sessão + CSRF                 | `{ accessUntil, durationDays, alreadyRedeemed }` — resgata um código de 7 ou 30 dias; repetir o mesmo código é idempotente.            |
| POST   | `/api/v1/billing/coupons`       | header `x-coupon-admin-token` | Emite um cupom; o código em texto puro aparece apenas nesta resposta. Requer `COUPON_ADMIN_TOKEN`.                                     |
| POST   | `/api/v1/billing/asaas/webhook` | header `asaas-access-token`   | `{ received: true }`. Sem cookie e sem CSRF.                                                                                           |

Cupons são armazenados por digest SHA-256, aceitam duração de 7 ou 30 dias, podem ter janela de validade e limite de resgates. O resgate grava uma linha por conta e calcula
`accessUntil` a partir do maior entre agora, o período pago/trial vigente e outro cupom ativo; portanto estende acesso sem alterar a assinatura no Asaas. `GET /me/billing` expõe `couponAccessUntil` e usa `source: 'coupon'` quando o cupom é a fonte vigente (assinatura paga continua tendo prioridade).

Webhook (idempotente): `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED` ativam até `nextDueDate` da assinatura;
`PAYMENT_OVERDUE` marca `past_due`; `PAYMENT_REFUNDED` cancela e encerra o período. Cobrança paga ou
vencida com `dueDate` anterior ao fim do período já pago não altera a linha — assim reenvio e entrega fora
de ordem não recalculam o período, não reativam uma assinatura vencida e não derrubam um cancelamento
voluntário ainda vigente. Evento desconhecido responde 200 e não altera a linha.
O usuário é casado por `externalReference` ou pelo `paymentLink` / assinatura já gravados.

Reconciliação (corrige webhook perdido): o job `billing_reconciliation` roda uma vez por dia às
`BILLING_RECONCILE_HOUR` (padrão 14:00, `America/Sao_Paulo`; aceita 7–23, fora da janela noturna
00:00–05:30 e da coleta PNCP das 06:00), sob advisory lock, só com o Asaas configurado.
Percorre, uma assinatura por vez e com `BILLING_RECONCILE_PAUSE_MS` (padrão 1000) antes de cada chamada,
as linhas `pending`, `active`, `past_due` e `canceled` com período pago vigente, até
`BILLING_RECONCILE_MAX_PER_RUN` (padrão 200) por execução; a execução seguinte continua de onde parou.
Para cada linha consulta o Asaas e aplica a mesma decisão do webhook à cobrança decidida mais recente
(`RECEIVED`/`CONFIRMED`/`OVERDUE`/`REFUNDED`): `pending` pago → `active`; `active` com a cobrança
vigente vencida → `past_due`; `past_due` pago → `active`; estorno → `canceled` sem acesso; assinatura
removida ou inativa no Asaas sem estorno → `canceled` mantendo o período pago. O fim do período é o
vencimento da cobrança seguinte (ou `nextDueDate`, se ela ainda não existe). Sem divergência, nada é gravado.

Consultas ao Asaas: `GET /v3/subscriptions/{id}` e `GET /v3/subscriptions/{id}/payments`; para `pending`,
a assinatura é localizada por `GET /v3/payments?externalReference={userId}` filtrando o `paymentLink`
do checkout atual. Falha do Asaas (timeout, 5xx, 429) não altera a linha; três falhas seguidas encerram a
execução. Assinatura que o Asaas responde com 404 (removida ou criada em outro ambiente, como o sandbox
depois da troca para produção) também não altera a linha, nunca cancela acesso e não conta como falha:
entra em `missingRemote` no resumo, sem log de erro. Se um webhook gravar a linha entre a leitura e a escrita, o webhook prevalece.
`BILLING_RECONCILE_ENABLED=false` desliga o job. Manual, em desenvolvimento:
`pnpm --filter @workspace/api-server run billing:reconcile [--dry-run]`. Em produção, a imagem leva só o
bundle, e a CLI é `dist/reconcile-billing.mjs`, que lê apenas o ambiente do processo:
`docker exec licita-macbook-app-1 node artifacts/api-server/dist/reconcile-billing.mjs --dry-run`.
Rode a simulação (`--dry-run`, consulta o Asaas e não grava) antes da primeira execução real e confira
as contagens. Sem `--dry-run`, a CLI toma o mesmo lock do job `billing_reconciliation` e falha se o
agendado estiver rodando; começa do início, sem o cursor do job. Imprime só contagens por transição;
`--help` mostra o uso, argumento desconhecido sai com código 2, e erro ou falha de consulta ao Asaas sai
com código 1. Saída e logs não levam e-mail nem nome, e identificadores de usuário ou do Asaas aparecem
só em nível `debug`.
O checkout do Asaas disponível nesta versão cobra imediatamente; pagar durante o teste troca
`source` para `subscription` e não posterga a primeira cobrança até `trialEndsAt`.

## LGPD — exportação e exclusão da conta

Estas rotas ficam deliberadamente fora do gate de assinatura para garantir acesso aos direitos do
titular mesmo sem plano ativo.

### `GET /api/v1/me/export`

Responde `200 application/json` com `Content-Disposition: attachment;
filename="pardal-digital-dados-YYYY-MM-DD.json"` e `Cache-Control: no-store`.

```ts
type AccountExport = {
  exportedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    trialEndsAt: string;
    emailDigest: "daily" | "off";
    emailImmediateCritical: boolean;
    emailPreferencesUpdatedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  sessions: Array<{
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
    revokedAt: string | null;
  }>;
  savedTenders: Array<{
    tenderId: string;
    savedAt: string;
    monitored: boolean;
    monitoredAt: string | null;
  }>;
  savedSearches: Array<SavedSearch & { deletedAt: string | null }>;
  notifications: Array<Record<string, unknown>>;
  emailDeliveries: Array<{
    id: string;
    mode: "digest" | "immediate";
    status: "queued" | "sent" | "failed" | "skipped";
    recipientEmail: string;
    subject: string;
    htmlBody: string;
    textBody: string;
    attempts: number;
    lastError: string | null;
    providerMessageId: string | null;
    createdAt: string;
    updatedAt: string;
    sentAt: string | null;
  }>;
  aiQuestions: Array<{
    question: string;
    passages: unknown[];
    summary: Record<string, unknown> | null;
    requestedModel: string;
    model: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  aiDailyUsage: Array<Record<string, unknown>>;
  aiDailyTenders: Array<Record<string, unknown>>;
  aiJobs: Array<{
    id: string;
    kind: string;
    tenderId: string;
    lane: "interactive" | "batch";
    status: string;
    attempts: number;
    createdAt: string;
  }>;
  companyProfile: Record<string, unknown> | null;
  companyFits: Array<Record<string, unknown>>;
  fitUsage: Array<Record<string, unknown>>;
  recommendationEvents: Array<{
    type: "search" | "tender_view";
    normalizedTerms: string[];
    tenderId: string | null;
    occurredAt: string;
  }>;
  recommendationDismissals: Array<Record<string, unknown>>;
  recommendationInterestProfile: Record<string, unknown> | null;
  recommendations: Array<Record<string, unknown>>;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    updatedAt: string;
  } | null;
};
```

Todas as sessões ainda retidas são exportadas, inclusive revogadas/expiradas aguardando o expurgo. Tokens,
hashes de sessão, `googleSub`, chaves do Asaas, identificadores internos de cobrança, tokens de descadastro,
headers de e-mail e `dedupeKey` não são incluídos. Entram o assunto, status, datas e os corpos de e-mails que
ainda não foram expurgados, perguntas, respostas/passagens, metadados dos jobs de IA, cotas, preferências,
filtros do perfil, eventos e descartes de recomendação. Não há tabela de plataformas cadastradas nesta
versão. Um teste compara todas as tabelas com `user_id` ao registro `ACCOUNT_EXPORT_TABLES`, para que uma
nova tabela não seja omitida silenciosamente.

### `DELETE /api/v1/me`

Exige sessão, CSRF e corpo exato `{ "confirm": "EXCLUIR" }`; confirmação ausente ou diferente
responde `400 INVALID_PARAMETER`. Sucesso responde `204`, remove `users` e todos os dados pessoais
por cascata, invalida todas as sessões e limpa o cookie.

O e-mail também é removido de `beta_access_grants`, tabela independente da conta. Um teste genérico verifica
que toda tabela com `user_id` possui FK `ON DELETE CASCADE` para `users`; identificadores fora desse padrão
exigem tratamento e teste explícitos.

Quando existe assinatura remota não cancelada, a API cancela primeiro no Asaas. Falha remota responde
`503 BILLING_UNAVAILABLE` sem iniciar a exclusão local. Depois do sucesso remoto, a exclusão local
ocorre em uma única transação. Se essa transação falhar, os dados permanecem íntegros e a compensação
marca localmente a assinatura como `canceled`, permitindo repetir a exclusão sem cobrar/cancelar de
novo.

O tombstone antiabuso do teste é deliberadamente preservado após a exclusão. Ele não possui FK para
`users` e contém somente HMAC não reversível do Google `sub`, `trialEndsAt` e `createdAt`, com
finalidade documentada de impedir repetição do benefício.

O banco local não mantém faturas, documentos fiscais nem dados de cartão depois da exclusão. Registros que o
Asaas precise preservar por obrigação fiscal, contábil ou regulatória permanecem sob responsabilidade desse
operador, conforme sua base legal e seus prazos.

## Performance esperada

`/auth/session`, `/me/saved-tenders/ids`, `/me/notifications/unread-count`: p95 < 100 ms.
Demais rotas `/me/*`: p95 < 300 ms.

## Fora de escopo v1

Push, compartilhamento de buscas, times/organizações e papéis.

## Esclarecimentos propostos pelo frontend (Codex: confirme ou contraponha no [CLAUDE_HANDOFF-004](../handoffs/CLAUDE_HANDOFF-004-account.md))

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
- Notificações mantêm snapshots mínimos de edital/busca para permanecerem legíveis mesmo após mudanças posteriores; notificações lidas e conteúdo de entregas de e-mail têm retenção operacional padrão de 180 dias, conforme [`../compliance/retencao-dados-pessoais.md`](../compliance/retencao-dados-pessoais.md).
- O índice de busca continua reconstruível a partir do banco canônico; nenhuma tabela de conta passa a ser fonte de verdade para os dados públicos do edital.
- Follow-up 005: OAuth indisponível redireciona com `oauth_unavailable`; dev-login exige CSRF; queries canônicas ativas são únicas por usuário; exclusão de busca usa soft delete com restore de 30 segundos.
