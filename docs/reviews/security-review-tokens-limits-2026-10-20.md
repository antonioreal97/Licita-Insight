# Revisão de segurança: tokens e limites de uso

**Data:** 2026-10-20
**Base:** `main` em `0419e8c`. Para a infra, branch `ops/macbook-worker` (nginx do servidor e middleware da Vercel).
**Escopo:**
- tokens: sessão, OAuth Google, cancelamento de e-mail, cupom, ingestão e webhook Asaas;
- limites: rate limit, concorrência, filas e cotas de IA, paginação.

O objetivo é saber o que precisa estar resolvido antes de abrir um MCP com tokens de API para assinantes.
**Método:** revisão estática do código, comparada com a [auditoria de 26/09](security-audit-2026-09-26.md).
**Limitação:** não consegui ler o `.env` de produção. Os valores efetivos dos limites estão na seção "Conferir em produção".

## Resumo

Não encontrei nenhum achado alto. O sistema de tokens está bem feito, e os limites de uso evoluíram bastante desde 26/09: o SEC-07 (sem rate limiting) foi resolvido e o SEC-02 (indexação ilimitada) foi bastante mitigado.

Ficaram **3 achados médios** e **4 baixos**. Dois médios devem ser resolvidos antes do MCP:
- **T-01:** a sessão não tem expiração absoluta.
- **T-02:** a base inteira pode ser extraída em minutos pela busca.

Os dois pioram muito quando o acesso passa a ser feito por agentes automáticos com um token de longa duração.

| ID | Severidade | Achado | Antes do MCP? |
|---|---|---|---|
| T-01 | Média | Sessão sem expiração absoluta (SEC-09 continua aberto) | Sim |
| T-02 | Média | Paginação sem teto: a base inteira sai em minutos | Sim |
| T-03 | Média | Indexação disparada por GET, antes da cota; contas de trial enchem a fila | Recomendado |
| T-04 | Baixa | Rate limit só em memória | Se o MCP rodar em outro processo |
| T-05 | Baixa | `SESSION_SECRET` usado para quatro finalidades | Não |
| T-06 | Baixa | Cupom personalizado curto pode ser adivinhado | Não |
| T-07 | Baixa | Webhook Asaas com token estático e sem registro de eventos (SEC-03 em parte resolvido) | Não |

## Achados

### T-01 — Média — Sessão sem expiração absoluta

`artifacts/api-server/src/auth/session-service.ts:172-219`: `readSession` só confere a inatividade de 10 minutos (linha 192) e `expiresAt`. A cada toque, `expiresAt` é renovado para mais 10 minutos, e `createdAt` nunca é comparado com um teto.

**Impacto:** um cookie roubado (máquina compartilhada, extensão maliciosa, backup do navegador) continua valendo para sempre, desde que alguém faça uma requisição a cada 10 minutos. Um script faz isso sem esforço. O usuário não tem como ver nem encerrar outras sessões, só a atual (`/v1/auth/logout`).

**Correção:**
- Recusar a sessão quando `now - createdAt` passar de um teto, por exemplo 12 h ou 7 dias, a decidir pelo produto.
- Oferecer "sair de todos os dispositivos": revogar todas as linhas de `sessions` do usuário.
- Para tokens de MCP, a expiração precisa ser obrigatória desde o primeiro dia (ver os pré-requisitos).

### T-02 — Média — Paginação sem teto

- `lib/api-spec/openapi.yaml:1853`: `pageSize` vai até 100, e `page` não tem máximo.
- `artifacts/api-server/src/repositories/postgres-tender-repository.ts:506`: a consulta usa `offset((page - 1) * pageSize)` sem limite.
- `artifacts/api-server/src/middlewares/request-protection.ts:107-108`: a busca permite 60 requisições por minuto por IP anônimo e 240 por minuto por usuário logado. O nginx do servidor permite 30 r/s por IP.

**Impacto:** com cerca de 201 mil editais, bastam umas 2.000 páginas de 100 para levar a base inteira. Isso leva ~9 min com uma conta logada e ~34 min por IP anônimo, ou menos com vários IPs. Os dados de origem são públicos (PNCP), mas os títulos reescritos, as categorias, a plataforma de disputa e a curadoria são do Pardal. O offset alto também fica cada vez mais caro para o Postgres.

Pelo MCP, um agente faria isso sozinho, mesmo sem intenção, por exemplo ao "listar tudo de pavimentação".

**Correção:**
- Limitar a profundidade: `page * pageSize ≤ 1.000` (ou 2.000). Acima disso, devolver `400` com a dica de refinar os filtros.
- Uma cota diária de **resultados** por usuário ou token, além da cota de requisições.
- `pageSize` menor para anônimos (20).

### T-03 — Média — Indexação disparada por GET, antes da cota

Isto é o que sobra do SEC-02 de 26/09. O que já existe:
- fila persistente com teto de 1.000 jobs por tipo;
- até 60 indexações por usuário por hora (`ai/ai-job-queue.ts:96`);
- orçamento diário em USD;
- cota diária de editais consultados.

O que falta:
- `GET /v1/tenders/:id/ask-status` (`routes/ai.ts:109`) dispara a indexação para quem tem acesso à IA, **antes** de reservar a cota de editais. A cota só é consumida ao perguntar.
- Contas em trial têm acesso à IA. Cerca de 17 contas fazendo 60 indexações cada enchem a fila global de 1.000 em uma hora. A partir daí, todos recebem `queue_full`, inclusive os assinantes pagantes.

**Correção:**
- Reservar a cota antes de enfileirar, ou contar a indexação como consulta.
- Teto por usuário de jobs na fila ao mesmo tempo (por exemplo 5), menor no trial.
- Disparar a indexação com `POST` em vez de GET.

### T-04 — Baixa — Rate limit só em memória

`middlewares/request-protection.ts:202` usa `MemoryRateLimitStore`. Hoje há um único processo, então funciona. Mas os contadores zeram a cada deploy ou reinício, e o limite não vale entre processos. A interface `RateLimitStore` já foi pensada para um store compartilhado.

**Quando importa:** se o MCP rodar em outro processo ou contêiner, ou se a API ganhar uma segunda réplica. A saída é um store no Postgres: uma tabela de janelas com `insert … on conflict do update`.

### T-05 — Baixa — `SESSION_SECRET` com quatro finalidades

O mesmo segredo assina o state do OAuth (`routes/auth.ts`), gera o hash da identidade de trial (`auth/session-service.ts:40-43`) e serve de reserva para o token de cancelamento de e-mail (`auth/config.ts:34`). Os tokens de sessão, porém, **não** dependem dele, porque são aleatórios e guardados com SHA-256.

**Consequências que não são óbvias:**
- Trocar o `SESSION_SECRET` **não** desconecta ninguém.
- Trocar o segredo faz as "lápides" de trial (`google_trial_tombstones`) deixarem de bater. Quem já excluiu a conta poderia ganhar um trial novo.
- Sem `EMAIL_UNSUBSCRIBE_SECRET` próprio, trocar o segredo invalida todos os links de descadastro já enviados.

**Correção:**
- Segredos separados: `OAUTH_STATE_SECRET`, `TRIAL_SUBJECT_SECRET` e `EMAIL_UNSUBSCRIBE_SECRET` obrigatório em produção.
- Documentar no runbook o que cada rotação causa.

### T-06 — Baixa — Cupom personalizado curto

`billing/coupons.ts:36` aceita códigos personalizados de 4 a 64 caracteres. A única proteção contra tentativas é o limite geral de escrita, de 60 por minuto por usuário. Códigos gerados (`PARDAL-` + 64 bits aleatórios) são seguros, mas um código escolhido à mão, como `BETA2026`, pode ser adivinhado e vale 30 dias de acesso.

**Correção:** exigir pelo menos 10 caracteres em códigos personalizados e limitar as tentativas erradas, por exemplo 10 por hora por usuário.

### T-07 — Baixa — Webhook Asaas

Isto é o que sobra do SEC-03. Já melhorou:
- eventos antigos ou fora de ordem são ignorados (`chargeAlreadyCovered` em `asaas-webhook.ts`);
- a ativação confirma no Asaas a assinatura e as cobranças;
- há um job de reconciliação.

Continua igual: o token é estático e não existe tabela de eventos com ID único. A comparação do token é feita em tempo constante.

**Correção:** registrar o `id` do evento com índice único e aplicar na mesma transação. Documentar a rotação do `ASAAS_WEBHOOK_TOKEN`.

## O que está bem feito

- **Tokens de sessão:** 256 bits aleatórios. No banco fica só o SHA-256, então um vazamento do banco não entrega sessões válidas. O cookie é `HttpOnly`, `SameSite=Lax` e `Secure` em produção.
- **OAuth Google:**
  - PKCE S256, `state` e `nonce`;
  - state assinado com HMAC e comparado em tempo constante, expirando em 10 minutos;
  - `id_token` verificado por inteiro: assinatura com a chave pública do Google, `iss`, `aud`, `exp`, `nonce` e `email_verified`;
  - `safeReturnTo` impede redirecionamento aberto.
- **CSRF:** `requireCsrf` exige o cabeçalho `x-requested-with` e um `Origin` exato. Os dois POSTs de perfil sem CSRF só calculam, sem gravar nem chamar IA, e o `SameSite=Lax` já cobre esse caso.
- **Ingestão:**
  - o token tem no mínimo 32 caracteres e é comparado em tempo constante (via digest);
  - sem token configurado, a rota responde 404;
  - o nginx bloqueia `/api/v1/ingest` e `/metrics`.
  - Isso resolve o SEC-01.
- **IP real:**
  - a Vercel envia o IP do cliente com um segredo compartilhado;
  - o nginx só aceita o IP quando o segredo confere e sobrescreve o `X-Forwarded-For`;
  - a API usa `TRUST_PROXY=1`.
  - Resultado: o rate limit por IP não pode ser burlado forjando cabeçalhos.
- **Cookie forjado:** há um limite antes da autenticação contra a enxurrada de leituras no banco que cookies forjados causariam.
- **Logs:**
  - cabeçalhos `authorization`, `cookie` e `set-cookie` são mascarados;
  - a query string é cortada, então o token de descadastro não vai para o log;
  - IP e e-mail também são mascarados.
- **Exclusão de conta:** apaga todas as sessões do usuário.
- **Token de descadastro:** HMAC com contexto e versão, comparado em tempo constante. Não expira, o que é aceitável para descadastro com um clique.

## Pré-requisitos para os tokens do MCP

1. **Formato:**
   - prefixo reconhecível (`pardal_pat_…`), para o secret scanning do GitHub achar vazamentos;
   - 256 bits aleatórios;
   - no banco, só o SHA-256;
   - exibido uma única vez.
2. **Ciclo de vida:**
   - expiração obrigatória (90 dias, por exemplo);
   - revogação na tela da conta;
   - `last_used_at` e rede aproximada do último uso;
   - no máximo 5 tokens por usuário.
   - Excluir a conta revoga todos os tokens.
3. **Escopo:** começar com `read` (busca, detalhe, histórico, oportunidades). A IA fica num escopo separado, com cota.
4. **Assinatura verificada a cada chamada**, não só ao emitir o token. Usar o `userHasActiveAccess`, com cache curto.
5. **Limites próprios:**
   - um perfil `token:<id>` no rate limit;
   - uma cota diária de resultados;
   - o teto de paginação do T-02.
6. **Superfície separada:**
   - o token vale só em `/mcp`, só no cabeçalho `Authorization: Bearer`, nunca na query string;
   - `/mcp` não aceita o cookie de sessão, para evitar CSRF via navegador;
   - CORS fechado.
7. **Auditoria:** registrar por token a ferramenta, o horário e o volume retornado.
8. **Conteúdo de terceiros:** o texto dos editais vai para o agente do cliente e pode conter instruções escondidas (prompt injection). Na Fase 1 isso não afeta o Pardal, porque as ferramentas só leem. A documentação para o cliente deve avisar.
9. **Fase 2 (OAuth):**
   - PKCE obrigatório;
   - `redirect_uri` exato;
   - access token curto, com refresh rotativo;
   - limite para o registro dinâmico de clientes.

## Conferir em produção

Rodar no servidor, de dentro da pasta do projeto. Os valores secretos aparecem só como `<definido>`:

```sh
grep -hE '^(NODE_ENV|TRUST_PROXY|ORIGIN_MODE|AUTH_DEV_LOGIN|BILLING_DEV_ENTITLED|RATE_LIMIT_[A-Z_]+|MAX_INFLIGHT_[A-Z_]+|AI_DAILY_BUDGET_USD|AI_INDEX_ENQUEUE_PER_USER_PER_HOUR|AI_QUEUE_MAX_DEPTH_[A-Z_]+|(INGEST_API_TOKEN|COUPON_ADMIN_TOKEN|EMAIL_UNSUBSCRIBE_SECRET|ORIGIN_SHARED_SECRET))=' .env \
  | sed -E 's/^((INGEST_API_TOKEN|COUPON_ADMIN_TOKEN|EMAIL_UNSUBSCRIBE_SECRET|ORIGIN_SHARED_SECRET)=).+/\1<definido>/'
```

O esperado:
- `ORIGIN_MODE=enforce`;
- `AUTH_DEV_LOGIN` e `BILLING_DEV_ENTITLED` ausentes ou `false`;
- `EMAIL_UNSUBSCRIBE_SECRET` e `ORIGIN_SHARED_SECRET` definidos.

O `NODE_ENV=production` e o `TRUST_PROXY=1` já vêm do `compose.macbook.yml`.

## Plano

1. **Antes do MCP:** T-01 (teto da sessão e "sair de todos") e T-02 (teto de paginação e cota de resultados). São mudanças pequenas e isoladas.
2. **Junto com a Fase 1 do MCP:** os pré-requisitos 1 a 7, e o T-04 se o MCP rodar fora do processo da API.
3. **Próximo ciclo:** T-03.
4. **Quando houver folga:** T-05, T-06 e T-07.
