```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-017

Feature: Fase 1a de docs/architecture-scale.md — proteger e medir: harness de carga, índice de busca,
  pool/desligamento limpo/readyz, limite de taxa e cache HTTP nas rotas públicas.

Priority: P1. Branch: antonioreal97/cycle7 (sobre main 524f083).
Leia antes: docs/architecture-scale.md (diagnóstico R1, R2, R3, R9 com as evidências e os números).

Regra do ciclo: cada correção entra COM número. Meça antes, corrija, meça depois, na mesma máquina.
Sem mudar contrato público (rotas, formatos, erros existentes). O frontend não muda.

1. Harness de carga (R9) — fazer primeiro
   - Banco DESCARTÁVEL `licita_scale` no Postgres do Compose (localhost:5432, usuário licita). NUNCA use os
     bancos `licita` nem `licita_cycle4` (têm dados de teste do owner) e não pare/reinicie containers.
     O script cria e apaga o banco (`scale:drop`). Verifique espaço em disco antes; 1 milhão de linhas
     pode ocupar alguns GB: prefira rawPayload mínimo e apague o banco no fim.
   - `pnpm --filter @workspace/api-server run scale:seed -- --rows 1000000 [--seed 42]`: aplica o schema
     (o mesmo caminho do db-setup) e gera editais SINTÉTICOS e determinísticos, com distribuição realista:
     ~20% `open`, 27 UFs com peso, modalidades, órgãos repetidos (~5 mil), datas de 2 anos, e textos em PT-BR
     montados de um vocabulário de objetos de licitação (limpeza, material de expediente, engenharia, TI,
     medicamentos, transporte, etc.) com o mesmo tamanho médio do real (`search_text` ≈ 475 bytes; itens
     com 1–20 descrições). Termos com frequências bem diferentes (comum, médio, raro) para exercitar o
     índice. Marque as linhas como sintéticas (por exemplo `source_name = 'SYNTHETIC'`).
   - `pnpm --filter @workspace/api-server run scale:load`: sobe a API contra `licita_scale` (porta própria,
     login de dev desligado, coletas e e-mail desligados) e roda cenários com autocannon (dependência de
     desenvolvimento; sem instalar k6): busca por termo comum, médio e raro, busca com 2–3 termos, filtros
     (UF, status, modalidade, datas), página 1 e página profunda, sugestões, detalhe por id. Concorrência
     10, 50 e 100. Saída em JSON e em Markdown: RPS, p50/p95/p99, taxa de erro, mais o `EXPLAIN (ANALYZE,
     BUFFERS)` da consulta de busca de cada cenário.
   - Baseline ANTES de qualquer correção, em 100 mil e em 1 milhão de linhas, em docs/reviews/scale-baseline.md.

2. Busca (R1)
   - Hoje o filtro é `LIKE '%token%'` em `search_text` (repositories/postgres-tender-repository.ts, ~linhas 69–100)
     e a relevância usa `CASE WHEN titleNorm LIKE …`. Adicione `pg_trgm` + índice GIN
     `gin_trgm_ops` em `tenders.search_text` (e em `cultural_opportunities.search_text`).
   - ARMADILHA JÁ VISTA NESTE PROJETO (CODEX_HANDOFF-012): `drizzle-kit push --force` (db-setup do Compose)
     e as migrations SQL divergiram no `search_vector`. Aqui: declare o índice no schema Drizzle
     (`.using('gin', ... gin_trgm_ops)`), garanta que a extensão exista antes do push (`CREATE EXTENSION
     IF NOT EXISTS pg_trgm` no db-setup e na migration) e que um segundo `push --force` sobre o banco
     existente NÃO tente recriar nem apague o índice. Escreva um `verify:*` (como o `verify:ai-push`) que
     cria um banco vazio, roda push duas vezes e confirma o índice e o plano `Bitmap Index Scan`.
   - Verifique se a ordenação por relevância continua barata para termos muito comuns (casam metade da
     tabela). Se não, proponha (sem quebrar o contrato) ordenar só o topo ou limitar o cálculo, e mostre o
     número. Confira também como o total de resultados é calculado (`totalIsEstimate`) e se a contagem vira
     o gargalo.
   - Meta a reportar (não é critério de falha; se não atingir, explique por quê): páginas lidas por busca
     −95% ou mais; p95 de termo raro < 250 ms com 50 conexões em 1 milhão de linhas.

3. Pool, timeouts, desligamento e readiness (R3)
   - lib/db/src/index.ts: `new Pool({ connectionString })` hoje usa os padrões. Configure por env:
     `DB_POOL_MAX` (padrão 10), `DB_POOL_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS`,
     `DB_STATEMENT_TIMEOUT_MS` (padrão 15000 para a API; os jobs longos de coleta podem precisar de outro
     valor, então permita sobrescrever por contexto) e `application_name`. Trate o erro de pool ocioso.
   - Desligamento limpo: em SIGTERM/SIGINT parar de aceitar conexões, esperar as requisições em curso até
     `SHUTDOWN_TIMEOUT_MS`, parar os agendadores (hoje `setInterval`/`setTimeout` sem função de parada),
     encerrar o pool e sair com código 0. Um teste que envia SIGTERM ao processo com requisição em curso.
   - `GET /api/healthz` continua como está (liveness). Novo `GET /api/readyz`: 200 só se `select 1` responde
     em até 2 s, senão 503. Documente no OpenAPI.

4. Rotas públicas: limite de taxa e cache (R2)
   - Limite de taxa (middleware novo, armazenamento atrás de uma interface para trocar por Redis depois;
     agora em memória): chave = usuário da sessão quando há cookie válido, senão IP. Respeitar
     `TRUST_PROXY` (env; padrão desligado) para ler o IP real atrás de balanceador/CDN. Padrões
     configuráveis: busca/detalhe/sugestões/oportunidades anônimos 60/min por IP; autenticados 240/min por
     usuário; rotas de autenticação (login, callback) 20/min por IP; webhook do Asaas e ingestão do n8n
     ficam FORA do limite (têm token próprio). Resposta `429` com o envelope de erro existente
     (`RATE_LIMITED`) e `Retry-After`. Cabeçalhos `RateLimit-*` opcionais.
   - Cache HTTP nas leituras públicas (busca, detalhe, sugestões, oportunidades): para requisições SEM cookie
     de sessão, `Cache-Control: public, max-age=30, stale-while-revalidate=120`, ETag fraco e 304; com
     sessão, `Cache-Control: private, no-cache`. `Vary: Cookie, Accept-Encoding`. ANTES confirme, lendo o
     código, que essas respostas não têm nenhum campo por usuário; se tiverem, não cacheie aquela rota e
     explique. Rotas de conta, billing, IA e exportação continuam `no-store`.
   - Compressão (`compression`) para respostas JSON acima de ~1 KB.
   - `helmet` com o mínimo compatível com a API (sem CSP para uma API JSON).
   - Documente a configuração recomendada de CDN (chave de cache sem cookie para anônimos).

5. Rajada do mesmo cliente e timeouts (pedido do owner em 26 set 2026, durante a execução)
   Objetivo: um único cliente/conexão com muitas requisições simultâneas não pode sobrecarregar a API nem
   o banco, e uma requisição pendurada não pode segurar recursos para sempre. O limite por janela do item 4
   NÃO cobre isso (60 req/min podem chegar todas no mesmo segundo).
   a. Limite de concorrência por cliente (requisições EM ANDAMENTO), mesma chave do item 4 (usuário da
      sessão, senão IP): padrão 10 anônimo e 20 autenticado (`MAX_INFLIGHT_PER_ANON`, `MAX_INFLIGHT_PER_USER`).
      Acima do limite, resposta imediata `429` com o envelope de erro e `Retry-After: 1`. Não enfileirar
      (fila ilimitada é o problema). A vaga é liberada ao terminar, ao dar timeout OU se o cliente desconectar.
   b. Limite global de requisições em andamento (`MAX_INFLIGHT_GLOBAL`, padrão 200): acima disso, descartar
      com `503` + `Retry-After` (load shedding), começando pelas anônimas. `/api/healthz` e `/api/readyz`
      nunca são descartadas. Opcional: descartar também quando o atraso do event loop
      (`perf_hooks.monitorEventLoopDelay`) passar de um limite configurável.
   c. Timeout de requisição na aplicação (`REQUEST_TIMEOUT_MS`, padrão 30000; rotas que legitimamente demoram,
      como exportação de dados e ingestão do n8n, com valor próprio configurável): responde `503` (ou `504`)
      com envelope de erro e libera a vaga. Garanta que `statement_timeout` (item 3) seja MENOR que esse
      valor para que o banco não continue trabalhando depois que o cliente já recebeu o erro. Se surgir um
      código de erro novo (ex.: `REQUEST_TIMEOUT`), é aditivo: documente no OpenAPI e avise no CLAUDE_HANDOFF
      (o frontend trata status >= 500 como transitório; o Claude ajusta os tipos).
   d. Timeouts do servidor HTTP do Node, por env com padrões seguros: `headersTimeout`, `requestTimeout`
      (recepção da requisição; protege de conexão lenta/slowloris), `keepAliveTimeout` (maior que o idle do
      balanceador, sugestão 65 s), `server.maxRequestsPerSocket` (sugestão 1000) e `server.maxConnections`.
      Limite de conexões por IP não se resolve no Node: documente que fica no balanceador/CDN.
   e. Limites de corpo explícitos (`express.json({ limit })` e urlencoded) com `413` no envelope de erro.
   f. Timeouts de chamadas de SAÍDA: audite todo `fetch`/cliente externo (PNCP, Mapas Culturais, Asaas,
      Google OAuth, Resend, Jev) e garanta `AbortSignal.timeout` ou o timeout do SDK, configurável por env.
      Uma chamada externa pendurada segura a requisição e a vaga de concorrência.
   g. Espera por conexão do pool (`DB_CONNECTION_TIMEOUT_MS`, item 3) deve virar `503` rápido no envelope de
      erro, não travar a requisição até o timeout geral.
   Cenário de carga NOVO no harness: rajada de 500 requisições simultâneas de UM cliente contra a busca
   enquanto um segundo cliente faz requisições normais. Reporte, antes e depois: latência p95 do segundo
   cliente (justiça), quantas do primeiro receberam 429, memória e event loop lag da API, sem erros 5xx
   inesperados.

Não faça (ficam para os HANDOFFs 018/019): separar processos api/worker, fila durável, ledger de custo,
semáforo do Jev, particionamento, métricas Prometheus, Redis.

Acceptance criteria:
  - testes do item 5: o (N+1)º pedido simultâneo do mesmo cliente recebe 429 enquanto os N estão em
    andamento e a vaga volta ao terminar/timeout/desconexão; descarte global com 503 sem afetar
    /healthz e /readyz; timeout de requisição responde no envelope e libera a vaga; conexão com cabeçalhos
    lentos é fechada (`headersTimeout`); `maxRequestsPerSocket`; corpo acima do limite dá 413; chamadas de
    saída com timeout (fetch simulado que nunca responde).
  - testes: limitador (janela, chave por usuário vs IP, 429 com Retry-After, rotas isentas), cache (anônimo
    público com ETag e 304, com sessão privado, rotas de conta no-store), readyz (200 e 503 com banco
    fora), desligamento (SIGTERM com requisição em curso), pool via env; testes existentes intactos.
  - `docs/reviews/scale-baseline.md` com os números ANTES e DEPOIS (100 mil e 1 milhão de linhas) e os
    planos `EXPLAIN`.
  - o verify do índice passando em banco vazio e em banco existente; push-force duas vezes sem erro.
  - typecheck, build (incluindo os testes pelo dist/ existentes), suíte completa com Postgres
    (PNCP_TEST_DATABASE_URL=… no licita_cycle4, schema isolado como nos ciclos anteriores).
  - banco `licita_scale` apagado no fim (ou instruções de `scale:drop` no relatório).

Ownership: artifacts/api-server/**, lib/db/**, lib/api-spec/** e os clientes gerados (só se a rota /readyz
entrar no OpenAPI), docker-compose.yml (somente para criar a extensão no db-setup), docs/contracts/, 
docs/reviews/scale-*.md, docs/handoffs/CLAUDE_HANDOFF-017-scale-protect-measure.md, .env.example (só
variáveis novas), package.json do api-server para scripts e devDependencies.
NÃO edite artifacts/licitainsight/**, o .env do worktree nem o .gitignore (alteração local do owner).
Processo: commite só seus paths (`git commit -- <paths>`), sem push.
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-017-scale-protect-measure.md, com: o que mudou por
rota/arquivo, variáveis novas com padrões, comandos, números antes/depois, migration (sim/não) e o que não
foi verificado.
```
