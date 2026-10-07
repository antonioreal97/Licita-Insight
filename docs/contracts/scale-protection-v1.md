# Contrato operacional — proteção HTTP e readiness

Status: aditivo ao OpenAPI v1; não altera rotas nem formatos existentes.

## Readiness

- `GET /api/healthz` permanece liveness e não consulta dependências.
- `GET /api/readyz` responde `200 {"status":"ok"}` somente quando `select 1` conclui em até 2 s; caso contrário responde `503 {"status":"unavailable"}`.
- Liveness e readiness não entram em limite de janela, concorrência nem load shedding.

## Limites

Cada requisição `/api` cai em exatamente um perfil de janela fixa, na ordem da tabela (o primeiro que casa vale). Cada perfil tem bucket próprio (`<perfil>:user:<id>` com sessão válida, senão `<perfil>:ip:<ip>`): estourar o limite de IA não bloqueia busca nem gravações.

| Perfil (`profile` na métrica) | Rotas | Padrão | Chave |
|---|---|---:|---|
| — (isento) | `GET /api/healthz`, `GET /api/readyz`, `POST /api/v1/billing/asaas/webhook`, caminhos fora de `/api` (app estático) | sem janela | — |
| `auth` | `GET /v1/auth/google/start`, `GET /v1/auth/google/callback`, `POST /v1/auth/dev-login` | 20/min | IP |
| `ingest` | `/v1/ingest/*` (rotas operacionais protegidas por `Authorization: Bearer <INGEST_API_TOKEN>`) | 3/min | IP |
| `ai` | `POST /v1/tenders/{id}/ask`, `GET /v1/tenders/{id}/ask-status`, `GET /v1/tenders/{id}/sheet`, `GET /v1/me/fit` | 60/min | usuário |
| `billing` | `POST /v1/me/billing/checkout`, `POST /v1/me/billing/cancel` | 5/min | usuário |
| `privacy` | `GET /v1/me/export`, `DELETE /v1/me` (um bucket para os dois) | 5/hora | usuário |
| `public_write` | `POST /v1/email/unsubscribe` e qualquer POST/PUT/PATCH/DELETE sem sessão válida | 10/min | IP |
| `write` | qualquer POST/PUT/PATCH/DELETE com sessão válida não coberto acima (`/v1/me/*`, logout) | 60/min | usuário |
| `public` | leituras públicas (busca, sugestões, detalhe) e **qualquer outra rota `/api`** não mapeada, inclusive `GET /v1/auth/session`, `GET /v1/me/billing` e demais GETs de `/v1/me/*` | 60/min anônimo; 240/min usuário | IP ou usuário |

Notas sobre os padrões:

- `ai` usa 60/min, não 30/min: o frontend consulta `ask-status`, `sheet` e `fit` enquanto o trabalho está em andamento (2 s, 4 s, 8 s e depois a cada 10 s). Uma página de detalhe faz cerca de 16 chamadas no primeiro minuto; abrir um segundo edital no mesmo minuto passaria de 30. O custo real de IA continua limitado pela deduplicação da fila e pelas cotas diárias por usuário.
- `GET /v1/me/billing` fica no bucket `public`, embora consulte o Asaas quando a assinatura está `pending`/`past_due`: o frontend lê esse estado em quase toda tela, e 5/min quebraria a navegação.
- `public_write` conta por IP. O descadastro de um clique (`List-Unsubscribe-Post`) pode vir dos servidores do provedor de e-mail; se muitos usuários descadastrarem ao mesmo tempo pelo mesmo provedor, aumente `RATE_LIMIT_PUBLIC_WRITE_PER_MINUTE`.
- Pré-autenticação: requisição com cookie `licita_session` ainda não resolvido consome antes `preauth:ip:<ip>` (600/min), porque a sessão custa uma leitura no banco.
- Concorrência em andamento: 10 por IP anônimo, 20 por usuário autenticado e 200 global, em todas as rotas exceto healthz/readyz. Excesso por cliente recebe `429 RATE_LIMITED`; excesso global recebe `503 SERVICE_OVERLOADED`. Não há fila. O webhook Asaas continua sujeito a esses limites globais, de corpo e de timeout.
- Timeout da aplicação: 30 s geral e 120 s para ingestão/exportação. Responde `503 REQUEST_TIMEOUT` no envelope existente e libera a vaga.
- Corpo: 256 KiB por padrão; excesso responde `413 PAYLOAD_TOO_LARGE` no envelope existente.
- Ingestão HTTP: sem `INGEST_API_TOKEN` válido no ambiente (mínimo 32 caracteres), `/v1/ingest/*` responde `404 NOT_FOUND`. Com segredo configurado e token ausente/incorreto, responde `401 UNAUTHENTICATED`. Coletas agendadas e comandos CLI não dependem desse token.

### Respostas e métricas

- Todo 429/503 de proteção usa o envelope de erro existente (`RATE_LIMITED`, `SERVICE_OVERLOADED`) e inclui `Retry-After` em segundos até o fim da janela do perfil (até 3600 em `privacy`).
- Toda resposta sujeita a janela publica `RateLimit-Policy: <limite>;w=<janela em s>`, `RateLimit-Limit`, `RateLimit-Remaining` e `RateLimit-Reset`. `RateLimit-Reset` é o número de segundos até o fim da janela (draft IETF), não mais um timestamp Unix; o frontend usa só `Retry-After`.
- `licitai_http_rate_limited_total{type="window",profile="<perfil>"}` conta rejeições por janela; `type="preauthentication",profile="preauth"` e `type="concurrency"` seguem existindo. `licitai_http_global_shed_total` conta o 503 global.

### Store e limitação conhecida

- O store padrão é em memória, por processo. Remove janelas vencidas a cada 1000 chamadas e tem teto de `RATE_LIMIT_MAX_ENTRIES` chaves; se o teto for atingido só com janelas ativas, as mais antigas são descartadas primeiro (o contador delas reinicia antes da hora).
- Limitação: com mais de uma réplica da API, cada processo conta sozinho e o limite efetivo se multiplica pelo número de réplicas. A produção planejada é uma máquina só (`APP_ROLE=all`). Para várias réplicas, implementar a interface `RateLimitStore` (aceita resposta síncrona ou `Promise`) sobre um store compartilhado (Redis ou Postgres) e passá-la a `createRequestProtection`.

`SERVICE_OVERLOADED`, `REQUEST_TIMEOUT` e `PAYLOAD_TOO_LARGE` são códigos aditivos no enum OpenAPI. Clientes devem continuar tratando status 5xx como transitório.

## Cache HTTP

- `GET /api/v1/tenders/search`, `GET /api/v1/tenders/{id}` e `GET /api/v1/search/suggestions`, sem cookie `licita_session`: `Cache-Control: public, max-age=30, stale-while-revalidate=120`, ETag fraco e 304 por `If-None-Match`.
- Com cookie de sessão: `Cache-Control: private, no-cache`.
- `Vary: Cookie, Accept-Encoding` em ambos os casos.
- Conta, billing, IA, exportação, ingestão e erros continuam `no-store`.
- Oportunidades culturais não têm campos personalizados, porém o contrato atual exige sessão e assinatura. Portanto permanecem `private, no-cache`; não foi removido o gate para criar um cache público.

Configuração recomendada da CDN:

1. Cachear somente os três GETs públicos acima e apenas quando `Cookie` e `Authorization` estiverem ausentes.
2. Usar path + query string completa + variante de `Accept-Encoding` na chave; respeitar `Vary` e o TTL/SWR da origem.
3. Nunca cachear 4xx/5xx, 429, 503 ou respostas com `Set-Cookie`/`private`/`no-store`.
4. Remover/bypassar cache quando aparecer o cookie `licita_session`, em vez de incluir seu valor na chave.
5. Aplicar limite de conexões por IP, proteção slowloris e WAF no balanceador/CDN; o Node limita conexões globais, não por IP.
6. Configurar `TRUST_PROXY` com número de saltos ou sub-rede exata. Evitar `true` em produção se o origin puder ser acessado fora do proxy.

## Variáveis e padrões

| Variável | Padrão |
|---|---:|
| `DB_POOL_MAX` | 10 |
| `DB_POOL_IDLE_TIMEOUT_MS` | 30000 |
| `DB_CONNECTION_TIMEOUT_MS` | 2000 |
| `DB_STATEMENT_TIMEOUT_MS` | 15000 |
| `DB_APPLICATION_NAME` | `licitai-api` |
| `RATE_LIMIT_ANON_PER_MINUTE` | 60 |
| `RATE_LIMIT_USER_PER_MINUTE` | 240 |
| `RATE_LIMIT_AUTH_PER_MINUTE` | 20 |
| `RATE_LIMIT_INGEST_PER_MINUTE` | 3 |
| `RATE_LIMIT_AI_PER_MINUTE` | 60 |
| `RATE_LIMIT_WRITE_PER_MINUTE` | 60 |
| `RATE_LIMIT_BILLING_PER_MINUTE` | 5 |
| `RATE_LIMIT_PRIVACY_PER_HOUR` | 5 |
| `RATE_LIMIT_PUBLIC_WRITE_PER_MINUTE` | 10 |
| `RATE_LIMIT_PREAUTH_PER_MINUTE` | 600 |
| `RATE_LIMIT_MAX_ENTRIES` | 100000 |
| `MAX_INFLIGHT_PER_ANON` | 10 |
| `MAX_INFLIGHT_PER_USER` | 20 |
| `MAX_INFLIGHT_GLOBAL` | 200 |
| `REQUEST_TIMEOUT_MS` | 30000 |
| `LONG_REQUEST_TIMEOUT_MS` | 120000 |
| `REQUEST_BODY_LIMIT` | `256kb` |
| `HTTP_HEADERS_TIMEOUT_MS` | 15000 |
| `HTTP_REQUEST_TIMEOUT_MS` | 30000 |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS` | 65000 |
| `HTTP_MAX_REQUESTS_PER_SOCKET` | 1000 |
| `HTTP_MAX_CONNECTIONS` | 1000 |
| `SHUTDOWN_TIMEOUT_MS` | 15000 |
| `GOOGLE_HTTP_TIMEOUT_MS` | 15000 |
| `ASAAS_HTTP_TIMEOUT_MS` | 15000 |
| `RESEND_HTTP_TIMEOUT_MS` | 15000 |
| `MAPAS_HTTP_TIMEOUT_MS` | 30000 |
| `PNCP_HTTP_TIMEOUT_MS` | 60000 |

`DB_STATEMENT_TIMEOUT_MS` deve permanecer menor que `REQUEST_TIMEOUT_MS`. Jobs longos podem sobrescrever o valor no ambiente do processo de worker/coleta.
