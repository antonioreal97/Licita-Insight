```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-018

Feature: Fase 1b de docs/architecture-scale.md — custo e isolamento: papéis api/worker, jobs seguros com
  várias réplicas, ledger de custo de IA por usuário, faixas de prioridade no cliente Jev e filtro lexical do
  fit em modo sombra.

Priority: P1. Branch: antonioreal97/cycle8 (sobre main b3225b2, PR #9 mergeado).
Leia antes: docs/architecture-scale.md (R4, R5, R6, R7 e a seção 4, modelo de custo),
docs/contracts/scale-protection-v1.md e docs/reviews/scale-baseline.md (o que a Fase 1a entregou).

Regras do ciclo (aprendidas no 017):
  - Sem mudar contrato público (rotas, formatos, envelopes de erro). O frontend não muda.
  - Teste com CORPOS REAIS: no 017 o teste do ETag usava um corpo fixo e não pegou que `meta.tookMs`
    mudava a cada resposta. Sempre que um teste depender de "igualdade entre respostas", use a forma real.
  - Depois dos testes, suba a API de verdade e confirme o comportamento por HTTP (o orquestrador refaz).
  - Commite em partes (um commit por item), path-limited, para uma interrupção não perder trabalho.
  - Paridade schema × migration: ver a armadilha do item 2.

Evidência que orienta este handoff (medida pelo orquestrador em 26 set 2026):
  - A API sobe 6 grupos de agendadores no mesmo processo (index.ts). Duas réplicas duplicariam todos.
  - O custo de IA está espalhado em 4 tabelas com colunas diferentes (ver item 2).
  - Cinco pontos chamam o Jev (ai/jev-client.ts): scoreCompanyFit e scoreSizeRestriction (fit, LOTE),
    scoreTenderPassage (Perguntar ao edital, INTERATIVO), scoreSheetPassage e classifySheetField (ficha,
    disparada por quem abre o detalhe, INTERATIVO). O limite do Jev é da conta inteira: 1.200 req/min e
    250 mil tokens/s (docs.typesafe.ai/models), e a doc avisa que muda sem aviso.
  - Filtro lexical no fit: nas 90 avaliações da calibração do ciclo 5 (3 perfis × 30 editais), um filtro
    RÍGIDO ("exigir ao menos um termo do perfil no texto") cortaria 43 de 71 chamadas de nível baixo (61%),
    mas perderia 3 de 19 editais alta/média (recall 84%), dois deles de nível alto: um edital de obra que
    diz "obra" mas não "obra civil" (score 1,0) e um de manutenção predial com cessão de mão de obra
    (0,77). Amostra pequena e enviesada: NÃO ligar o filtro sem medir. Por isso o item 5 é modo sombra.

1. Papéis do processo (R4): APP_ROLE=all|api|worker
   - `all` (padrão) = comportamento de hoje; o Compose e o dev não mudam.
   - `api`: só HTTP (rotas, readyz, limites), NENHUM agendador.
   - `worker`: só os agendadores/jobs (trial, e-mails, retenção da IA, retentativa de documentos, coleta
     PNCP e cultural, avaliação de buscas salvas), sem servir rotas de negócio. Sobe um servidor HTTP
     mínimo em `WORKER_HEALTH_PORT` (opcional; sem a variável, não abre porta) com /api/healthz e
     /api/readyz para orquestrador. Mesmo desligamento limpo do 017 (parar agendadores, esperar jobs em
     curso até SHUTDOWN_TIMEOUT_MS, fechar o pool, sair 0).
   - Um bundle só; scripts `dev:worker` e `start:worker` no package.json do api-server.
   - docker-compose.yml: serviço `worker` sob `profiles: ["scale"]` (não sobe por padrão), mesma imagem,
     APP_ROLE=worker. O serviço `api` continua com APP_ROLE=all por padrão.
   - ATENÇÃO: o trabalho disparado por request continua no processo da API nesta fase (download e extração
     de PDF, fila do fit, geração da ficha: `runningIndexes`, `runningFits`). Mover isso para o worker é
     o HANDOFF-019 (fila durável). NÃO tente resolver aqui; documente essa fronteira em
     docs/architecture-scale.md, seção 8.

2. Jobs seguros com várias réplicas (R4/R5)
   - Audite cada agendador e diga, em uma tabela no CLAUDE_HANDOFF, se já é seguro com 2+ workers
     (idempotência, unique index, `ingest_runs_one_running`, advisory lock) ou não.
   - Onde não for, envolva a execução em `pg_try_advisory_lock` (sessão) com chave por job: quem não obtém a
     trava pula o ciclo sem erro e sem log de erro (log em debug). A trava é liberada ao terminar, e se o
     processo morre a conexão cai e a trava some. Cuidado com o pool: a trava de sessão precisa da MESMA
     conexão até o unlock (use um client dedicado, não pool.query solto).
   - Teste: 2 execuções concorrentes do mesmo job, só uma trabalha; a segunda retorna sem efeito.
   - Smoke: sobe 2 processos `worker` no mesmo banco de teste e mostra em log que cada ciclo de cada job
     rodou uma vez só (não precisa de carga; use intervalos curtos por env no teste).

3. Ledger de custo de IA (R7)
   - Uma VIEW `ai_usage_ledger` que UNE as fontes existentes, sem mudar o caminho de escrita:
       ask   ← ai_ask_requests   (user_id, input_tokens, estimated_cost_usd, response_model, tender_id,
                                  created_at; só status answered/not_found)
       fit   ← company_tender_fits (user_id, tender_id, input_tokens, estimated_cost_usd, response_model,
                                  checked_at; só status ready. inputTokens já soma a checagem de porte)
       sheet ← tender_ai_sheets  (user_id NULL: é custo da PLATAFORMA por edital; input_tokens,
                                  estimated_cost_usd, response_model, generated_at; só status ready)
     Colunas: occurred_at, user_id (nullable), feature ('ask'|'fit'|'sheet'), tender_id, model,
     input_tokens, cost_usd.
   - ARMADILHA JÁ VISTA (HANDOFF-012 e 017): `drizzle-kit push --force` (db-setup do Compose) e as migrations
     SQL divergiram duas vezes. Declare a view no schema Drizzle (pgView(...).existing() ou .as(...), o que
     funcionar de forma estável), garanta que um SEGUNDO push sobre banco existente não apague nem recrie a
     view, e escreva um `verify:*` (como o verify:search-index) que cria um banco vazio, roda push duas vezes
     e confirma a view e um SELECT de teste.
   - CLI `pnpm --filter @workspace/api-server run report:ai-cost -- [--days 30] [--user <id|email>] [--json]`:
       * total e por função (ask/fit/sheet): chamadas, tokens, US$;
       * por dia (tendência);
       * por usuário ativo: média, p50, p90, p99 e máximo de US$ no período; top 10 gastadores (id + e-mail,
         é ferramenta administrativa local);
       * quantos usuários encostaram no teto (AI_DAILY_ASK_LIMIT_*, AI_DAILY_FIT_LIMIT) e a % do teto usada;
       * projeção mensal simples (média diária × 30), com a ressalva de que é extrapolação;
       * custo da plataforma (ficha) separado do custo por usuário.
   - Contrato do relatório e definições (o que é "usuário ativo", como a ficha entra) em
     docs/contracts/ai-cost-v1.md.
   - Teste do relatório com dados sintéticos num banco descartável (NÃO invente dados em licita_cycle4).

4. Faixas de prioridade no cliente Jev (R6)
   - Um agendador no ai/jev-client.ts com duas faixas: `interactive` (ask + ficha) e `batch` (fit, incluindo a
     checagem de porte). Toda chamada passa por ele.
   - Concorrência: `JEV_MAX_CONCURRENCY` (padrão 16); o lote pode usar no máximo `JEV_BATCH_MAX_SHARE`
     (padrão 0,5) das vagas; o interativo usa todas.
   - Taxa: balde de tokens por minuto `JEV_RPM_LIMIT` (padrão 900, 75% do limite da conta) com reserva de
     `JEV_INTERACTIVE_RESERVE_RPM` (padrão 300): o lote só consome enquanto o saldo estiver acima da reserva.
   - 429/529 do Jev: o SDK já tem retry com backoff. Adicione uma PAUSA da faixa `batch` pelo tempo do
     `retry-after` (ou `JEV_BACKOFF_MS`, padrão 30000) para o lote parar de bater enquanto o interativo segue
     tentando.
   - Espera na fila: interativo desiste após `JEV_INTERACTIVE_QUEUE_TIMEOUT_MS` (padrão 5000) com o mesmo
     erro que já vira 503 AI_UNAVAILABLE; o lote espera sem prazo, e o que não couber fica `pending` como já
     acontece com a cota (não mude a semântica pública).
   - Observabilidade mínima: a cada minuto um log pino com, por faixa, em andamento, na fila, espera p95,
     total de chamadas e de 429/529. Sem Prometheus (HANDOFF-019).
   - Testes com o fetch do Jev simulado: lote não passa de 50% das vagas mesmo com fila grande; o interativo
     entra na frente com o lote saturado; pausa do lote em 429; interativo estoura o prazo de espera; nenhuma
     chamada fica pendurada para sempre. Um teste com concorrência real (50 chamadas de cada faixa) que
     comprove o teto.

5. Filtro lexical do fit em modo sombra (custo por usuário)
   - `AI_FIT_LEXICAL_GATE=off|shadow|on`, padrão `shadow`.
   - Regra do filtro (mais branda que a rígida, para recuperar os casos que ela perde): passa se QUALQUER
     palavra (com radical, tsvector 'portuguese') de QUALQUER termo de `offerings` casa com título, objeto ou
     itens do edital. Compare com o critério atual, que exige o termo inteiro/frase (ver lexicalMatches em
     ai/company-fit-service.ts). "obra" deve passar para o termo "obra civil".
   - `shadow`: calcula a decisão, CHAMA o Jev normalmente e grava `lexical_gate_pass boolean` na linha do fit
     (coluna nova, nula para linhas antigas; migration + schema Drizzle, mesma paridade do item 3).
     `on`: quem não passa não chama o Jev: grava fit `ready` com nível `low`, score 0, motivo novo
     `{ kind: 'no_offering_term' }` (documente no contrato company-fit-v1; a UI ignora motivos
     desconhecidos, confirme lendo fit-badge.tsx, e me avise se não ignorar).
   - CLI `report:fit-gate`: entre as avaliações `ready` com `lexical_gate_pass` preenchido, mostra a matriz
     gate × nível (high/medium/low), o recall do filtro sobre alta+média, quantas chamadas ao Jev ele
     economizaria (e US$) e a lista dos alta/média que ele perderia (título + score) para revisão humana.
     Inclua também o recorte por status do edital (aberto/encerrado): quantas avaliações foram de edital já
     encerrado (candidato futuro a pular o Jev; NÃO implemente isso agora).
   - Regra de ativação (documente; o owner decide): só ligar `on` com pelo menos 500 avaliações medidas e
     recall ≥ 97% sobre alta+média. Enquanto isso, fica em `shadow`.
   - Teste: gate por palavra; "obra" passa para "obra civil"; modo shadow chama o Jev e grava a coluna; modo
     on não chama o Jev; modo off não grava nem filtra.

Não faça (ficam para o HANDOFF-019 ou dependem de decisão do owner): fila durável de extração/fit/ficha,
mover trabalho de request para o worker, disjuntor de orçamento diário, métricas Prometheus, Redis,
proteção da ingestão com token, teto global de indexação (segurança), limite por plano.

Acceptance criteria:
  - testes de cada item passando; typecheck, build (com os testes pelo dist/ existentes) e a suíte completa com
    Postgres (PNCP_TEST_DATABASE_URL=… no licita_cycle4, schema isolado como nos ciclos anteriores).
  - verify de paridade da view do ledger e da coluna do fit: banco vazio, dois push-force, banco existente.
  - relatório docs/reviews/cost-isolation.md: tabela de segurança dos jobs (item 2), exemplo real do
    report:ai-cost com dados sintéticos de um banco descartável, e a medição do item 4 (concorrência e espera
    por faixa).
  - smoke com 2 workers + 1 api no mesmo banco, evidência de execução única por ciclo.

Ambiente:
  - Postgres do Compose em localhost:5432 (usuário/senha licita). Bancos `licita` e `licita_cycle4` são do
    owner: NÃO escreva dados sintéticos neles, exceto as suítes de teste que já usam schema isolado. Dados
    sintéticos só em bancos descartáveis criados e apagados por você (ex.: `licita_cost`).
  - NÃO pare, reinicie nem suba containers. Se o Postgres não estiver de pé, pare e pergunte pelo canal de
    perguntas do Orca (não tente subir).
  - JEV_API_KEY não é necessária (Jev simulado nos testes). Não leia nem copie chaves.
  - O .env do worktree, o .gitignore (alteração local do owner) e docs/reviews/security-audit-2026-09-26.md
    (outro agente, Hermes) NÃO são seus: nunca use `git add -A` nem commit sem paths.

Ownership: artifacts/api-server/**, lib/db/**, docker-compose.yml (só o serviço worker sob profile),
docs/contracts/ai-cost-v1.md, docs/contracts/company-fit-v1.md (só o motivo novo), docs/reviews/cost-isolation.md,
docs/architecture-scale.md (só a seção 8), docs/handoffs/CLAUDE_HANDOFF-018-cost-isolation.md, .env.example
(só variáveis novas), package.json do api-server. NÃO edite artifacts/licitainsight/**.
Processo: commite só seus paths (`git commit -- <paths>`), um commit por item, sem push.
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-018-cost-isolation.md, com: o que mudou por arquivo, variáveis
novas com padrões, comandos, migration (sim/não), a tabela do item 2, os números do item 4 e o que não foi
verificado.
```
