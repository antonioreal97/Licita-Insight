```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-019

Feature: Fase 2 de docs/architecture-scale.md — fila durável no Postgres para extração, fit e ficha (o
  trabalho sai do processo da API e vai para o worker), disjuntor de orçamento de IA, métricas e alertas,
  retenção de documentos e o harness de carga na escala decidida (1,5 milhão de editais).

Priority: P1. Branch: antonioreal97/cycle8 (já contém o HANDOFF-018 e o merge das decisões do owner, 41e7137).
Leia antes: docs/architecture-scale.md (seção 7 = decisões do owner de 26 set 2026; R4, R5, R6, R7, R8),
docs/contracts/ai-cost-v1.md, docs/contracts/scale-protection-v1.md, docs/reviews/cost-isolation.md e
docs/handoffs/CLAUDE_HANDOFF-018-cost-isolation.md (o que o 018 entregou e a fronteira que este handoff fecha).

Decisões do owner que valem aqui (não reabrir sem ele):
  - No limite do orçamento de IA, PAUSA SÓ O LOTE: fila da aderência (inclusive o selo na busca, que fica
    pendente) e o alerta diário do perfil. Continuam: "Perguntar ao edital" (cota por usuário) e a ficha
    (teto global próprio). Disjuntor: US$ 10/dia de gasto TOTAL no Jev, `AI_DAILY_BUDGET_USD`.
  - Retenção: 90 dias após `tenders.proposal_deadline` para `tender_ai_passages`, `tender_ai_documents` e
    `tender_ai_indexes`, EXCETO edital salvo por algum usuário. `tenders` NÃO expira. Perguntas continuam
    em 90 dias (purgeExpiredAiQuestions).
  - Metas para dimensionar: 100 pagantes em 6 meses, 500 em 12; 30 buscas por usuário ativo por dia, pico de
    10× a média; base de ~1,5 milhão de editais em 12 meses (~4,2 mil por dia, sem apagar `tenders`).
  - Hospedagem: Fly.io `gru` (api e worker como máquinas da mesma imagem, Managed Postgres). O deploy em si
    NÃO é escopo deste handoff (será o 020), mas nada aqui pode pressupor um filesystem local persistente nem
    um único processo.

Regras do ciclo (aprendidas nos 017 e 018):
  - Sem mudar contrato público além do que este handoff diz (valor novo `expired`, item 4). Frontend NÃO muda:
    eu integro depois.
  - Teste com corpos e formas REAIS; depois dos testes, suba API + worker de verdade e confirme por HTTP.
  - Paridade schema × migration: tabela nova e coluna nova precisam sobreviver a DOIS `drizzle-kit push --force`
    sobre banco existente. Escreva `verify:*` (como verify:ai-ledger) para cada objeto novo.
  - Commite em partes (um commit por item), path-limited, para uma interrupção não perder trabalho.

Evidência do estado atual (medida em 26 set 2026):
  - O trabalho disparado por request roda dentro da API, em três `Map` em memória: `runningIndexes`
    (ai/tender-index-service.ts, download + extração de PDF/ZIP com pdfjs, CPU), `runningFits`
    (ai/company-fit-service.ts) e `runningSheets` (ai/tender-sheet-service.ts). Uma requisição
    (`GET ask-status`, `GET sheet`, `GET me/fit`) pode iniciar qualquer um. Morre com o processo; duas
    réplicas duplicam trabalho; não há teto global de indexação.
  - O 018 já entrega: `APP_ROLE=api|worker|all`, `jobs/job-lock.ts` (advisory lock por ciclo),
    `ai/jev-scheduler.ts` (faixas interativo/lote, por PROCESSO), view `ai_usage_ledger`, `job_run_audit`.
  - O limite de taxa do Jev (1.200 req/min) é da conta; hoje cada processo acha que tem os 900 do
    `JEV_RPM_LIMIT` inteiros. Com API e worker separados, a soma pode passar do limite.
  - Na busca, termos muito comuns (que casam ~50% da tabela) seguem com leitura sequencial (017).

1. Fila durável no Postgres (R4/R5)
   - Tabela `ai_jobs`: id, kind ('index'|'fit'|'sheet'), dedupe_key (UNIQUE), tender_id, user_id (nulo para
     custo de plataforma), payload jsonb, lane ('interactive'|'batch'), status ('queued'|'running'|
     'succeeded'|'failed'|'dead'), attempts, max_attempts, run_after, locked_by, locked_until (visibility
     timeout), last_error, created_at/started_at/finished_at. Índice parcial para o claim
     (status='queued' AND run_after <= now(), por lane e created_at). Nada de user/tender em rótulo de métrica.
   - Enfileirar: as funções que hoje disparam trabalho (`ensureTenderIndex`, `getTenderSheet`,
     `getTenderFits`) passam a só INSERIR o job (idempotente pelo dedupe_key: kind + tender + versão do índice/
     perfil/prompt) e a responder o estado atual. Os valores públicos de status NÃO mudam
     (`not_started`/`processing`/`ready`/… e `pending`/`ready` do fit): "processing" = job na fila ou rodando.
   - Consumir: worker faz claim com `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT n) RETURNING`.
     Concorrência por tipo por env: `WORKER_INDEX_CONCURRENCY` (2), `WORKER_SHEET_CONCURRENCY` (2),
     `WORKER_FIT_CONCURRENCY` (8). Ordem: lane interactive antes de batch; dentro da lane, mais antigo primeiro.
     Índice e ficha disparados por um usuário esperando são `interactive`; fit e alerta diário do perfil,
     `batch`.
   - Latência: o usuário espera o índice/ficha. Polling a cada 1 s quando ocioso é aceitável; `LISTEN/NOTIFY`
     ao enfileirar (com fallback para polling) é bem-vindo se não complicar. Reporte o tempo entre enfileirar
     e iniciar.
   - Recuperação: o worker estende `locked_until` enquanto trabalha (heartbeat); job `running` com trava
     vencida volta para `queued` (attempts+1) por um varredor no próprio worker; acima de `max_attempts`, vira
     `dead` com o estado de domínio consistente (índice `failed`, retentável pelo job de retentativa que já
     existe). Backoff exponencial em `run_after` para falha transitória.
   - Regras de execução: o CÓDIGO de extração/fit/ficha existente é MOVIDO, não reescrito (pdfjs, chunking,
     Jev, cache global da ficha, cotas). A API-role NÃO executa extração nem chamadas em lote ao Jev
     (a pergunta interativa ao edital continua na API). `APP_ROLE=all` (dev) roda API + consumidor no mesmo
     processo, para o desenvolvimento local continuar funcionando com um comando só.
   - Contenção de custo (SEC-02 da auditoria do Hermes, parte de escala): teto por usuário para enfileirar
     índices novos via GET (`AI_INDEX_ENQUEUE_PER_USER_PER_HOUR`, padrão 60; acima, o GET só responde o estado
     e registra em métrica) e profundidade máxima da fila por tipo (`AI_QUEUE_MAX_DEPTH_INDEX` etc.; cheia =
     não enfileira, mesmo comportamento). Documente que NÃO substitui autenticar a ingestão (decisão do owner
     pendente).
   - Contrato interno em docs/contracts/ai-queue-v1.md (estados, dedupe, visibilidade, retentativa, env).
   - Testes: dois consumidores nunca pegam o mesmo job (SKIP LOCKED); morte do consumidor no meio do job (kill
     -9 do processo de teste, ou trava vencida simulada) → outro retoma; dedupe (100 GET simultâneos =
     1 job); prioridade; backoff; a API-role responde ao GET sem baixar nada (fetch espiado); `all` termina
     o fluxo sozinho; teste pelo dist/ quando houver bundle.

2. Disjuntor de orçamento de IA (R6/R7)
   - `AI_DAILY_BUDGET_USD` (padrão 10; 0 desliga) medido sobre o gasto TOTAL do dia no Jev (ask + fit + ficha),
     no dia de America/Sao_Paulo (o mesmo das cotas). `AI_DAILY_BUDGET_WARN_RATIO` (padrão 0,8).
   - A leitura do gasto precisa ser barata: cache em memória ≤ 30 s e consulta ≤ 20 ms com 500 mil linhas/dia
     (a view do ledger junta tabelas grandes: prefira somar as tabelas diárias que já existem ou um contador
     incremental; MEÇA com dados sintéticos e registre no relatório).
   - Acima do teto: faixa `batch` do scheduler do Jev pausa e o consumidor NÃO faz claim de jobs `fit`
     (ficam `queued`; a API continua respondendo `pending`); o alerta diário do perfil registra
     `skipped_budget` na auditoria dos jobs. Interativo (pergunta) e ficha seguem. Retoma sozinho na virada do
     dia (SP) ou se o teto for aumentado. Log WARN só na transição (ok→warn→pausado→ok), com o valor.
   - Testes com relógio injetado: transições, virada do dia, teto 0 = desligado, fit pausado e pergunta
     seguindo, cache de 30 s.

3. Jev: orçamento de taxa entre processos (R6)
   - Hoje cada processo assume o `JEV_RPM_LIMIT` inteiro. Implemente a partição estática por papel:
     `JEV_RPM_LIMIT_API` (padrão 300) e `JEV_RPM_LIMIT_WORKER` (padrão 600), que somam ≤ o teto da conta;
     `APP_ROLE=all` continua com `JEV_RPM_LIMIT` inteiro. Documente o trade-off (subutilização) e a
     alternativa de balde compartilhado no Postgres, que NÃO deve ser feita agora. Testes no scheduler.

4. Retenção de documentos e índices (R8)
   - Job diário `ai_document_retention` no worker (com job lock e auditoria): para editais com
     `proposal_deadline < now() - 90 dias` e que NENHUM usuário salvou (`saved_tenders`), apagar em lotes de
     ~5.000 linhas `tender_ai_passages` e `tender_ai_documents` e marcar o índice como expirado (tombstone:
     coluna `purged_at` em `tender_ai_indexes`; NÃO reindexar depois). `tenders` e `tender_ai_sheets` ficam.
   - Sem reindexação de fantasma: um GET de ask-status/ficha sobre edital expirado NÃO enfileira índice novo. A
     exceção é o edital SALVO por quem pede (salvar reabre o direito ao índice).
   - Contrato (ADITIVO): novo valor `expired` em `TenderAskIndexStatus` e no status da ficha. Ficha em cache é
     servida normalmente (`ready`); sem cache, `expired`. `POST ask` em índice expirado responde com o erro
     existente mais adequado e um `details[].issue` `index_expired` (proponha e documente). Atualize
     OpenAPI + codegen; o frontend eu ajusto.
   - CLI `report:retention -- --dry-run [--days 90]`: quantos editais, trechos e documentos seriam apagados, o
     espaço estimado e quantos ficam por estarem salvos. Rode em `licita_cycle4` e reporte.
   - Testes: prazo, edital salvo poupado, lote, tombstone (sem reindexação), ficha em cache preservada, dry-run
     sem efeito.

5. Métricas e alertas (R7)
   - Endpoint Prometheus (`prom-client` ou equivalente leve) em porta interna própria (`METRICS_PORT`; ausente =
     desligado), em cada papel, sem passar pelos limites nem pelo cache. NÃO expor em `/api`.
   - Métricas (sem id de usuário/edital em rótulo; rota como PADRÃO, não caminho cru): latência HTTP em
     histograma por padrão de rota e classe de status; requisições em andamento; contadores de 429 por tipo
     (janela, concorrência, pré-autenticação) e de descarte global; pool do Postgres (total, ocioso, esperando);
     atraso do event loop e RSS; fila por tipo e status (profundidade) e idade do job mais antigo por tipo e
     lane; resultados dos jobs agendados (auditoria); scheduler do Jev por faixa (em andamento, fila, espera
     p95, chamadas, 429/529); gasto do dia por função e razão do orçamento (gauge 0–1) + flag pausado;
     apagados pela retenção.
   - docs/ops/alerts.md: regras de alerta em PromQL ligadas aos gatilhos do plano (busca p95 > 300 ms por 10
     min; conexões esperando no pool > 0 por 2 min; readyz falhando; idade do job interativo mais antigo > 10
     min e do lote > 60 min; orçamento ≥ 80% e pausado; taxa de 5xx > 2% por 5 min; falhas de job; conexões
     do banco > 80% do máximo). Só documentação de regras; nenhuma infraestrutura de monitoramento agora.
   - Testes: formato do texto, ausência de rótulos de alta cardinalidade, métricas de fila/orçamento mudam
     com o estado, o endpoint não existe na porta pública.

6. Harness de carga na escala decidida (R9)
   - `scale:seed` com `--rows 1500000` (padrão novo). Metas derivadas: 500 usuários × 30 buscas/dia ≈ 0,17
     req/s de média, ~1,7 req/s de pico só de buscas de assinantes, mais o tráfego anônimo (limitado). Meta a
     REPORTAR (não é critério de falha): p95 < 300 ms com 10 conexões simultâneas e 1,5 M de linhas, incluindo
     termo comum, que é o pior caso. Cenários: 10 e 50 conexões (o de 100 não é necessário).
   - MÁQUINA: uma carga pesada por vez, amostras de 10 s, nunca com a suíte de testes rodando, e PARE no primeiro
     sinal de a máquina sofrer (o owner já interrompeu uma rodada por isso). Se o HTTP for inviável, entregue
     ao menos o `EXPLAIN (ANALYZE, BUFFERS)` dos cenários em 1,5 M linhas e diga o que não rodou. Espaço em
     disco: o banco descartável precisa ser apagado no fim.
   - Termo comum: se a meta não for atingida, PROPONHA e meça uma mitigação sem quebrar o contrato (ex.:
     candidatos = primeiros N casamentos por `published_at` em varredura de índice, depois relevância só
     sobre eles). Só implemente se, em ~50 consultas de amostra, a sobreposição do top-20 com o ranking exato
     for ≥ 90%; senão, documente a proposta e o número. Cursor de paginação e contagem exata: só medir e
     registrar; não mudar contrato.
   - Registre em docs/reviews/scale-baseline.md a seção "1,5 M".

Não faça (ficam para depois ou dependem do owner): deploy no Fly.io (HANDOFF-020), Redis, balde de taxa
compartilhado, proteção da ingestão com token, OCR, cursor de paginação, qualquer mudança no frontend.

Acceptance criteria:
  - testes de cada item; typecheck, build (com os testes pelo dist/) e a suíte completa com Postgres
    (PNCP_TEST_DATABASE_URL=… no licita_cycle4, schema isolado).
  - verify de paridade para `ai_jobs` e para `purged_at` (banco vazio, dois push-force, banco existente).
  - smoke real com 1 API-role + 1 worker: `GET ask-status` num edital sem índice enfileira e a API não faz
    download; o worker processa; a API passa a responder `ready`. Depois `kill -9` do worker no meio de um job
    e um segundo worker retoma (use visibilidade curta por env). Mostre a fila e a auditoria.
  - demonstração do disjuntor com orçamento minúsculo (ex.: US$ 0,0001): fit pausa, pergunta segue; volta ao
    subir o teto. Jev simulado ou real com poucas chamadas.
  - `curl` das métricas dos dois papéis no relatório.
  - docs/reviews/queue-budget-metrics.md com: tempos fila→início, medição da leitura do orçamento, dry-run da
    retenção no licita_cycle4 e a seção de 1,5 M.

Ambiente:
  - Postgres do Compose em localhost:5432 (usuário/senha licita). Bancos `licita` e `licita_cycle4` são do owner:
    sem dados sintéticos neles (exceto suítes com schema isolado). Sintético só em bancos descartáveis que você
    cria e apaga. NÃO pare, reinicie nem suba containers; se o Postgres cair, pare e pergunte pelo canal do
    Orca.
  - JEV_API_KEY: não necessária (Jev simulado). Se quiser UMA chamada real de conferência, peça ao
    orquestrador; não leia nem copie chaves.
  - O .env do worktree, o .gitignore e docs/reviews/security-audit-2026-09-26.md (outro agente, Hermes) NÃO são
    seus: nunca `git add -A`, nunca commit sem paths.

Ownership: artifacts/api-server/**, lib/db/**, lib/api-spec/** e clientes gerados (só o valor `expired`),
docker-compose.yml (só env/serviço worker), docs/contracts/ai-queue-v1.md, docs/contracts/ai-v1.md (só
`expired`), docs/ops/alerts.md, docs/reviews/queue-budget-metrics.md, docs/reviews/scale-baseline.md (seção 1,5 M),
docs/architecture-scale.md (só a seção 8), docs/handoffs/CLAUDE_HANDOFF-019-durable-queue-budget-metrics.md,
.env.example (só variáveis novas), package.json do api-server. NÃO edite artifacts/licitainsight/**.
Processo: commite só seus paths (`git commit -- <paths>`), um commit por item, sem push.
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-019-durable-queue-budget-metrics.md, com: o que mudou por arquivo,
variáveis novas com padrões, comandos, migrations (sim/não), o contrato final de `expired`, os números pedidos e o
que não foi verificado.
```
