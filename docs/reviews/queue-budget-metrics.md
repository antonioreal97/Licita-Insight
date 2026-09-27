# Revisão de fila, orçamento, métricas e escala — CODEX_HANDOFF-019

Data: 26 set 2026. PostgreSQL 16.15 do Compose, sem reiniciar ou subir containers. Dados sintéticos foram usados somente nos bancos descartáveis `licita_smoke019`, `licita_budget019` e `licita_scale`; os três foram apagados e a ausência foi conferida em `pg_database`.

## Fila durável e smoke HTTP

O smoke usou o bundle `dist/`, um processo `APP_ROLE=api` e um `APP_ROLE=worker`. O edital apontava para um PDF real mínimo servido por HTTPS local; o certificado inseguro e `AI_DOCUMENT_HOSTS=localhost` foram exclusivos do processo descartável.

- `GET /api/v1/tenders/SMOKE-FAST/ask-status` respondeu `processing`. Antes de existir worker, `ai_jobs` estava `queued`, `attempts=0`, `started_at=null` e `tender_ai_documents` tinha zero linhas; o servidor do PDF não recebeu requisição. Isso confirma que o papel API só enfileirou.
- Ao iniciar o worker, o job passou a `succeeded`, o índice a `ready` e o mesmo GET respondeu `ready` com um documento legível. O tempo fila→início foi 15,869 s porque o worker foi mantido propositalmente desligado durante essa janela.
- Com o worker já disponível, a fila→início medida em outra execução foi 0,138 s, dentro do polling configurado em 250 ms para o smoke.
- Para a recuperação, o primeiro worker foi morto com `SIGKILL` depois de o banco confirmar `status=running`, `attempts=1` e `locked_by=smoke019-worker-kill...`. O segundo worker observou a visibilidade expirada (`last_error='visibility timeout expired'`), assumiu `attempts=2`, concluiu `succeeded` e publicou o índice `ready`. O GET final respondeu `ready`. A visibilidade usada no smoke foi 3 s e o polling 250 ms.

Os testes PostgreSQL também cobrem dois consumidores concorrentes sem claim duplicado, dedupe, prioridade por lane, backoff e recuperação de visibilidade.

## Disjuntor de orçamento

Com US$ 0,001 gravado no contador diário e `AI_DAILY_BUDGET_USD=0.0001`, o worker deixou o job fit em `queued`, `attempts=0`. As métricas mostraram:

```text
licitai_ai_jobs{kind="fit",status="queued"} 1
licitai_ai_daily_cost_usd{feature="fit"} 0.001
licitai_ai_budget_ratio 1
licitai_ai_budget_paused 1
```

No mesmo estado pausado, uma pergunta interativa executada contra o índice real e um fetch Jev simulado respondeu `answered`, modelo `jev-test`, com uma passagem. Ao reiniciar o worker com teto de US$ 10, o fit foi consumido (`succeeded`, `attempts=1`) e `licitai_ai_budget_paused` voltou a zero. O gasto passou a US$ 0,0010042 após a pergunta.

Para medir a leitura sem tocar bancos do owner, `licita_budget019` recebeu 500.000 usuários e 500.000 linhas de `ai_daily_usage` no mesmo dia. Após aquecimento, 20 leituras da consulta usada por `loadAiDailySpend` tiveram mínimo 12,391 ms, p50 13,378 ms, p95 15,673 ms e máximo 15,691 ms. A meta de ≤20 ms foi atingida; leituras subsequentes no processo usam cache de até 30 s.

## Retenção

O dry-run real, somente leitura, foi executado em `licita_cycle4`:

```json
{"dryRun":true,"days":90,"tenders":0,"passages":0,"documents":0,"bytes":0,"savedTenders":0}
```

O teste integrado confirma prazo de 90 dias, preservação de edital salvo e da ficha em cache, deleção em lote e tombstone `purged_at` sem reindexação fantasma.

## Métricas por papel

As portas internas foram `9119` para API e `9120` para worker. O caminho `/metrics` na porta pública respondeu 404.

```text
# API :9119
licitai_build_info{role="api"} 1
licitai_postgres_pool_connections{state="waiting"} 0
licitai_ai_jobs{kind="index",status="succeeded"} 2

# worker :9120
licitai_build_info{role="worker"} 1
licitai_postgres_pool_connections{state="waiting"} 0
licitai_ai_jobs{kind="index",status="succeeded"} 2
licitai_ai_budget_paused 0
```

O import da proteção HTTP foi testado em subprocesso sem `DATABASE_URL`; banco, orçamento e scheduler só são carregados ao coletar as métricas dinâmicas.

## Escala de 1,5 milhão

O seed determinístico chegou a 1.500.000 editais e 3.648.805.911 bytes. A primeira amostra HTTP, termo comum com 10 conexões por 10 s, elevou o VM do PostgreSQL a 826% de CPU e abriu 18 execuções ativas; a carga foi interrompida imediatamente. Não houve rodada HTTP válida com 10 ou 50 conexões.

Os `EXPLAIN (ANALYZE, BUFFERS)` sequenciais foram concluídos: termo comum 731,4 ms + 378,1 ms de contagem exata; termo médio 179,6 + 124,5 ms; raro 18,6 + 4,4 ms; três termos 293,4 + 257,2 ms; filtros 65,8 + 51,7 ms; página profunda 413,1 + 372,7 ms. A avaliação de 5.000 candidatos teve sobreposição top-20 de 100% em 50 consultas, mas não foi implementada porque piorou o p50 (567,6→584,0 ms) e `contratacao` (1.724,9→2.441,5 ms). Detalhes estão em `docs/reviews/scale-baseline.md`, seção “1,5 M”.

## Validação final

- suíte completa sem `DATABASE_URL`, com `PNCP_TEST_DATABASE_URL` em schema isolado de `licita_cycle4`: 160/160 testes;
- `typecheck`, `build`, verificação da ficha pelo bundle e extração PDF pelo bundle: passaram;
- `verify:ai-jobs` e `verify:ai-purged-at`: banco vazio, dado existente e segundo `push-force`: passaram;
- dois `push-force` consecutivos no banco existente `licita_cycle4`: passaram;
- Jev real não foi chamado; todos os resultados Jev do smoke foram simulados.
