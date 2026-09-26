# Contrato operacional — proteção HTTP e readiness

Status: aditivo ao OpenAPI v1; não altera rotas nem formatos existentes.

## Readiness

- `GET /api/healthz` permanece liveness e não consulta dependências.
- `GET /api/readyz` responde `200 {"status":"ok"}` somente quando `select 1` conclui em até 2 s; caso contrário responde `503 {"status":"unavailable"}`.
- Liveness e readiness não entram em limite de janela, concorrência nem load shedding.

## Limites

- Leituras públicas de busca, sugestão e detalhe: 60/min por IP sem sessão válida; 240/min por usuário com sessão válida.
- Início/callback OAuth e login de desenvolvimento: 20/min por IP.
- Rotas `/api/v1/ingest/*`: 3/min por IP. Elas continuam sem autenticação nesta etapa e não são tratadas como confiáveis.
- Webhook Asaas: isento da janela porque valida `asaas-access-token`, mas continua sujeito aos limites globais, de corpo e timeout.
- Concorrência em andamento: 10 por IP anônimo, 20 por usuário autenticado e 200 global. Excesso por cliente recebe `429 RATE_LIMITED`; excesso global recebe `503 SERVICE_OVERLOADED`. Não há fila.
- Timeout da aplicação: 30 s geral e 120 s para ingestão/exportação. Responde `503 REQUEST_TIMEOUT` no envelope existente e libera a vaga.
- Corpo: 256 KiB por padrão; excesso responde `413 PAYLOAD_TOO_LARGE` no envelope existente.
- Todo 429/503 de proteção inclui `Retry-After`; o limite por janela também publica `RateLimit-Limit`, `RateLimit-Remaining` e `RateLimit-Reset`.

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
| `RATE_LIMIT_PREAUTH_PER_MINUTE` | 600 |
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
