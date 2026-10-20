# Auditoria de segurança — LicitAI

**Data:** 2026-09-26 02:56 -03  
**Escopo:** frontend React, API Express, autenticação/sessões/OAuth, billing Asaas, webhook, ingestão PNCP/Mapas Culturais, IA/documentos, PostgreSQL/Drizzle, e-mail, Docker e dependências.  
**Método:** revisão estática independente em três frentes, validação manual dos achados principais, busca por padrões perigosos/segredos, auditoria de dependências, typecheck e testes da API.  
**Limitações:** testes PostgreSQL opt-in foram pulados por ausência de `PNCP_TEST_DATABASE_URL`; não houve pentest contra ambiente publicado nem validação de controles externos de CDN/WAF/proxy. O `gitleaks` não estava instalado; foi feita busca regex por formatos comuns de segredo, sem ocorrência.

## Resumo executivo

Não foi encontrada vulnerabilidade crítica nem advisory conhecido nas dependências de produção. Foram confirmados **3 achados altos**, **7 médios** e lacunas de hardening/privacidade. O risco mais imediato é operacional: rotas administrativas de ingestão estão publicamente acionáveis. Em seguida, a indexação documental pode ser disparada sem limite global por qualquer usuário com acesso de IA, e o webhook Asaas não possui idempotência/ordenação segura.

### Prioridade imediata

1. Remover/proteger as rotas HTTP de ingestão.
2. Colocar indexação documental em fila com cotas, backpressure e concorrência global.
3. Tornar o webhook Asaas idempotente, transacional e resistente a eventos antigos/inconsistentes.
4. Corrigir redirects SSRF e aplicar limites de streaming nos downloads.
5. Adicionar rate limiting em camadas e reduzir dados sensíveis nos logs.

## Achados confirmados

### SEC-01 — Alta — Ingestão administrativa pública

**CWE-306 / CWE-862 / CWE-400**

- `artifacts/api-server/src/routes/ingest.ts:6-21` expõe `POST /v1/ingest/pncp` sem autenticação/autorização.
- `artifacts/api-server/src/routes/ingest.ts:32-50` expõe `POST /v1/ingest/opportunities` da mesma forma.
- `artifacts/api-server/src/routes/ingest.ts:23-29,52-58` publica status e possíveis erros operacionais.
- `artifacts/api-server/src/app.ts:38` monta o router sob `/api` sem proteção global.

**Impacto:** qualquer cliente pode iniciar repetidamente coletas externas e operações de banco, reprocessar janelas amplas e causar consumo de banda, CPU, conexões e pressão nas APIs upstream. Também há exposição de telemetria operacional.

**Correção:** retirar os disparadores da interface pública e usar scheduler/fila interna. Se HTTP for indispensável, exigir identidade de serviço/admin de curta duração, restrição de rede, rate limit, auditoria e resposta de status sanitizada.

### SEC-02 — Alta — Indexações documentais ilimitadas e concorrentes

**CWE-400 / CWE-770**

- `artifacts/api-server/src/routes/ai.ts:78-85`: um `GET /v1/tenders/:id/ask-status` autenticado calcula `trigger = hasAiAccess(userId)` e pode iniciar indexação como efeito colateral.
- `artifacts/api-server/src/ai/tender-index-service.ts:509-518,550-591`: qualquer licitação existente pode iniciar download/extração; a deduplicação é somente por `tenderId` em um `Map` local.
- Não há limite global, limite por usuário/IP nem coordenação entre réplicas.

**Impacto:** uma conta em trial ou assinante pode percorrer muitos IDs e iniciar downloads, PDFs/ZIPs, extração e gravações simultâneas, antes de consumir a cota de perguntas. Isso permite exaustão de CPU, memória, sockets e banco.

**Correção:** usar `POST` com CSRF/idempotency key; reservar orçamento antes do trabalho; fila persistente com concorrência global; cotas por usuário/IP; lock distribuído; limites por licitação de documentos, bytes e CPU.

### SEC-03 — Alta — Webhook Asaas sem idempotência e ordenação segura

**CWE-294 / CWE-841**

- `artifacts/api-server/src/routes/billing.ts:18-24`: autenticação por token estático, sem timestamp/nonce.
- `artifacts/api-server/src/billing/billing-service.ts:142-209`: não extrai nem persiste ID único do evento; atualização não é protegida contra replay.
- `artifacts/api-server/src/billing/asaas-webhook.ts:34-43`: evento antigo de pagamento pode reativar acesso.
- `artifacts/api-server/src/billing/asaas-webhook.ts:64-70`: refund antigo cancela incondicionalmente.

**Impacto:** retries, entrega fora de ordem ou replay de evento capturado podem reativar/cancelar uma assinatura incorretamente.

**Correção:** tabela de eventos com índice único; transação única para registrar/aplicar; timestamp/versão monotônica por pagamento/assinatura; confirmar no Asaas ID, status, cliente, valor e período antes de alterar entitlement.

### SEC-04 — Média — Webhook aceita identificadores conflitantes

**CWE-345 / CWE-20**

- `artifacts/api-server/src/billing/billing-service.ts:240-254`: `externalReference` tem precedência e pode selecionar diretamente um usuário.
- `artifacts/api-server/src/billing/billing-service.ts:256-274`: `paymentLink`, `subscription` e `customer` são combinados com `OR`, não por consistência conjunta.
- `artifacts/api-server/src/billing/billing-service.ts:167-174`: a assinatura remota é consultada, mas o cliente remoto não é comparado com o vínculo local.

**Impacto:** payload autenticado porém inconsistente — por erro do provedor ou após comprometimento do token — pode atribuir assinatura/entitlement ao usuário errado.

**Correção:** derivar os identificadores de uma consulta autenticada ao pagamento; exigir consistência de todos os IDs; rejeitar divergências sem alterar estado; registrar incidente.

### SEC-05 — Média — SSRF por redirect validado somente após a requisição

**CWE-918**

- `artifacts/api-server/src/ai/tender-index-service.ts:95-113` valida a URL inicial por HTTPS/hostname.
- `artifacts/api-server/src/ai/tender-index-service.ts:122-136` usa `fetch` com redirects automáticos e só depois valida `response.url`.

**Impacto:** se um host permitido redirecionar a um serviço interno, a requisição SSRF já terá ocorrido quando a URL final for rejeitada. A exploração depende de redirect controlável/comprometimento de host permitido.

**Correção:** `redirect: "manual"`; validar cada hop, porta e DNS/IP; bloquear ranges privados, loopback, link-local e metadata; limitar hops e considerar proxy de egress allowlisted.

### SEC-06 — Média — Limite de documento aplicado após alocação integral

**CWE-400 / CWE-770**

- `artifacts/api-server/src/ai/tender-index-service.ts:137-145`: quando `Content-Length` falta/mente, `response.arrayBuffer()` carrega todo o corpo antes da checagem de `maxBytes`.

**Impacto:** servidor documental permitido pode responder via chunked com corpo muito acima do limite; indexações paralelas amplificam a exaustão de memória.

**Correção:** leitura streaming com contador e aborto no teto; limite agregado por licitação; limite de documentos; extração isolada com orçamento de memória/CPU.

### SEC-07 — Média — Ausência de rate limiting na aplicação

**CWE-770 / CWE-307**

- `artifacts/api-server/src/app.ts:11-40` registra logging, parsers, cookies e rotas, mas nenhum throttling.
- Não há dependência equivalente em `artifacts/api-server/package.json`.

**Impacto:** busca/facets, OAuth, webhook, ingestão e IA podem receber volume abusivo. Quotas de negócio não substituem limites por IP/identidade/rota.

**Correção:** limites no gateway/CDN e na aplicação; perfis específicos para login, webhook e tarefas caras; `429`/`Retry-After`; configurar `trust proxy` de forma explícita e segura.

### SEC-08 — Média — Cliente Asaas sem timeout/teto e logging excessivo

**CWE-400 / CWE-532**

- `artifacts/api-server/src/billing/asaas-client.ts:119-155`: `fetch` sem `AbortSignal.timeout`, `response.text()` sem teto e log do payload completo em erro.
- `artifacts/api-server/src/lib/logger.ts:5-11` redige apenas headers conhecidos, não PII arbitrária dentro do payload do Asaas.

**Impacto:** upstream lento/grande pode ocupar workers e memória; respostas rejeitadas podem persistir CPF/CNPJ, e-mail, telefone ou IDs financeiros em logs.

**Correção:** timeout 10–15 s; limite de bytes; redirects desabilitados/validados; circuit breaker; registrar apenas status, correlation ID e código/mensagem allowlisted e truncada.

### SEC-09 — Média — Sessão deslizante sem expiração absoluta

**CWE-613**

- `artifacts/api-server/src/auth/session-service.ts:14-20,156-168,200-205`: a expiração é renovada para `agora + 10 min` sem teto baseado em `createdAt`.

**Impacto:** token roubado pode ser mantido válido indefinidamente por uso periódico.

**Correção:** `absoluteExpiresAt` (por exemplo 8–24 h), rotação periódica do token e reautenticação em ações destrutivas.

### SEC-10 — Média — Exportação/retensão de dados pessoais incompleta

**Natureza:** privacidade/LGPD; não é um bypass técnico.

- `artifacts/api-server/src/account/account-privacy-service.ts:45-58`: exporta apenas sessões ativas, embora sessões expiradas/revogadas possam permanecer armazenadas.
- `artifacts/api-server/src/account/account-privacy-service.ts:112-140`: exporta metadados de e-mail/IA, mas omite corpos de e-mail e respostas/passagens que continuam no banco.
- `artifacts/api-server/src/account/account-privacy-service.ts:192-200`: exclusão preserva HMAC determinístico de `googleSub` em tombstone sem expiração visível.

**Impacto:** exportação pode não representar todo o conteúdo pessoal retido; após exclusão permanece identificador pseudonimizado e correlacionável para antifraude.

**Correção:** inventário formal de dados pessoais; exportar todo dado aplicável ou documentar exclusões; definir base legal, transparência, prazo de retenção e job de expurgo dos tombstones.

## Hardening e riscos de implantação

- **Headers:** `artifacts/api-server/src/app.ts` não usa Helmet, não remove `X-Powered-By` nem define CSP/HSTS/nosniff/referrer/frame policy. Confirmar controles no edge; caso ausentes, adicionar na aplicação e no proxy.
- **Container:** `Dockerfile:1-14` não define usuário não-root e instala/copia a árvore completa. Usar multi-stage, dependências de produção e `USER` sem privilégios.
- **Compose de desenvolvimento:** PostgreSQL é publicado em `0.0.0.0:5432` com credenciais estáticas (`docker-compose.yml:15-24`). Vincular a `127.0.0.1` ou não publicar; nunca reutilizar este compose em produção.
- **Segredo local:** `.env` está ignorado pelo Git, mas no host auditado está com modo `0644`. Aplicar `chmod 600 .env` e rotacionar se o host foi compartilhado.
- **Supply chain:** `minimumReleaseAge: 1440`, lockfile e allowlist de scripts são controles positivos; reduzir a exceção wildcard `@replit/*` para pacotes explícitos.
- **Conta:** exclusão de conta usa sessão+CSRF+texto fixo, mas não reautenticação recente; exigir step-up OAuth/token curto de uso único.

## Controles positivos observados

- OAuth com `state` assinado/expirável, PKCE S256, nonce e validação de ID token.
- Cookie de sessão `HttpOnly`, `SameSite=Lax`, `Secure` em produção; token armazenado no banco apenas como digest.
- CSRF por origem exata + header customizado nas rotas mutáveis autenticadas.
- SQL de busca via Drizzle/parametrização; ordenação selecionada em código; nenhuma SQL injection confirmada.
- Frontend renderiza destaques como nós React; nenhum XSS explorável confirmado.
- Sem upload multipart ou caminho de filesystem derivado do usuário; nenhum path traversal confirmado.
- Token do webhook comparado em tempo constante.
- URLs de integrações PNCP/Mapas/Resend são fixas; não foi encontrada SSRF controlável diretamente por payload HTTP.
- `pnpm audit --prod --audit-level=low`: nenhum advisory conhecido.

## Evidências de verificação

- `pnpm --filter @workspace/api-server run typecheck`: **PASS**.
- `pnpm --filter @workspace/api-server run test`: **103 passaram, 0 falharam, 3 pulados**; build e verificação do bundle da ficha: **PASS**.
- `pnpm audit --prod --audit-level=low`: **No known vulnerabilities found**.
- Busca regex por chaves AWS/GitHub/Google e private keys: **0 ocorrências**.
- Revisão independente em três frentes convergiu em SEC-01 e validou separadamente autenticação, billing/integrações e frontend/IA.

## Plano de remediação sugerido

### P0 — antes de expor/continuar tráfego público

- SEC-01: fechar ingestão pública.
- SEC-02: limitar/serializar indexação.
- SEC-03/04: idempotência, ordem e consistência do webhook.

### P1 — próximo ciclo

- SEC-05/06: downloads seguros.
- SEC-07: rate limiting.
- SEC-08: timeout, teto e sanitização de logs.
- SEC-09: expiração absoluta e step-up auth.

### P2 — governança/hardening

- SEC-10: inventário LGPD, retenção e exportação.
- Headers, container não-root, Compose local-only, permissões do `.env` e redução de exceções de supply chain.
