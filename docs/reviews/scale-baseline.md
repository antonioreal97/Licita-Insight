# Baseline de escala — CODEX_HANDOFF-017

Data: 26 set 2026. Máquina: macOS 26.5 arm64, 10 CPUs, 16 GiB de RAM. PostgreSQL 16.15 no container já existente do Compose, sem reinício, com `shared_buffers=163848kB`, `effective_cache_size=5242888kB`, `work_mem=4096kB`, `max_connections=100` e `random_page_cost=4`.

## Método

- Banco descartável exclusivo `licita_scale`, seed determinística 42; nenhuma carga sintética tocou `licita` ou `licita_cycle4`.
- Dataset: 20% `open`, 27 UFs ponderadas, ~5 mil órgãos, 2 anos de datas, 1–20 itens e `search_text` médio de 472 bytes. Todas as linhas têm `source_name='SYNTHETIC'`.
- Amostras de 10 s, um cenário por vez. Pool com 10 conexões tanto antes quanto depois.
- **Antes:** aplicação do commit `903e88c` executada numa cópia temporária, sem proteção nova e com os índices trigrama removidos.
- **Depois (desempenho do banco):** código atual, índices presentes e proteções de janela/concorrência elevadas somente para não mascarar o custo da consulta. O cenário de rajada foi executado separadamente com concorrência por cliente/global nos valores padrão e limite por janela elevado.
- O baseline completo foi refeito com 100 mil linhas. A retomada limitou a segunda escala a 300 mil linhas e parou a carga bruta depois do cenário raro: com 100 conexões, o código anterior não concluiu nenhuma resposta em 10 s e a carga da máquina chegou ao número de CPUs. Isso segue a instrução de preservação da máquina; a evidência legada de 1 milhão foi mantida somente para `EXPLAIN`.

Artefatos brutos:

- [antes, 100 mil](./scale-before-100k-clean.md) e [JSON](./scale-before-100k-clean.json)
- [depois, 100 mil](./scale-after-100k-clean.md) e [JSON](./scale-after-100k-clean.json)
- [rajada depois, 100 mil](./scale-after-100k-burst.md) e [JSON](./scale-after-100k-burst.json)
- [antes, raro, 300 mil](./scale-before-300k-rara.md) e [JSON](./scale-before-300k-rara.json)
- [depois, raro, 300 mil](./scale-after-300k-rara.md) e [JSON](./scale-after-300k-rara.json)
- [EXPLAIN legado, 1 milhão](./scale-before-1m.md) — resultados HTTP rejeitados como baseline; planos preservados

O banco foi apagado ao final (`scale:drop`); a consulta em `pg_database` retornou zero linhas para `licita_scale`.

## 100 mil linhas — concorrência 50

| Cenário | p95 antes | p95 depois | RPS antes | RPS depois | Observação |
|---|---:|---:|---:|---:|---|
| termo comum (`contratacao`, 50%) | 2.233 ms | 2.305 ms | 24,7 | 24,7 | planner mantém `Seq Scan`; índice não ajuda baixa seletividade |
| termo médio (`tecnologia`, 5%) | 2.602 ms | 215 ms | 21,9 | 266,4 | p95 −91,7%; RPS 12,2× |
| termo raro (`ultrassom`, 0,1%) | 2.188 ms | 60 ms | 25,9 | 978,9 | p95 −97,2%; RPS 37,8× |
| três termos | 2.687 ms | 345 ms | 19,6 | 163,0 | p95 −87,2%; RPS 8,3× |
| filtros | 233 ms | 132 ms | 312,2 | 489,3 | p95 −43,4% |
| página profunda | 4.107 ms | 4.597 ms | 13,0 | 12,3 | `OFFSET` + termo comum continuam lineares |
| sugestões | 2.208 ms | 1.885 ms | 23,2 | 27,9 | melhora pequena; consulta não foi redesenhada |
| detalhe por id | 13 ms | 21 ms | 4.639 | 3.691 | variação/overhead HTTP; segue muito abaixo da busca |

Não houve erro, timeout nem resposta não-2xx em nenhuma célula dessa comparação. A degradação do termo comum e da página profunda é esperada: o filtro casa metade da tabela, a relevância calcula `CASE ... LIKE` para todos os candidatos e a paginação usa `OFFSET`. Não foi alterado o contrato para limitar resultados nem trocar cursor neste handoff.

`totalIsEstimate` permanece `false`: `countRows` executa `count(*)` exato com o mesmo filtro. Em termos raros/médios o GIN acelera também a contagem; em termos muito comuns a contagem continua uma varredura e é parte importante do custo. Próximo passo compatível com o contrato: calcular ranking somente sobre um conjunto candidato limitado e, mediante decisão de produto, tornar a contagem uma estimativa ou limitar o total anunciado.

## 300 mil linhas — termo raro

| Concorrência | p95 antes | p95 depois | RPS antes | RPS depois |
|---:|---:|---:|---:|---:|
| 10 | 2.087 ms | 23 ms | 7,7 | 648,2 |
| 50 | 8.349 ms | 90 ms | 5,0 | 675,0 |
| 100 | >10.000 ms, 0 respostas concluídas | 166 ms | 0 | 670,0 |

A meta indicativa do handoff foi atingida na escala segura executada: p95 raro com 50 conexões = **89,6 ms** (<250 ms). A redução é de 98,9% contra o baseline de 8.349 ms.

## Planos `EXPLAIN (ANALYZE, BUFFERS)`

### Raro, 100 mil — antes

```text
Limit  (actual time=91.531..91.534 rows=20 loops=1)
  Buffers: shared hit=16316 read=7018
  ->  Sort
        ->  Seq Scan on tenders
              Filter: (search_text ~~ '%ultrassom%'::text)
              Rows Removed by Filter: 99900
              Buffers: shared hit=16316 read=7018
Execution Time: 91.543 ms
```

### Raro, 100 mil — depois

```text
Limit  (actual time=0.775..0.777 rows=20 loops=1)
  Buffers: shared hit=140 read=29
  ->  Sort
        ->  Bitmap Heap Scan on tenders
              Recheck Cond: (search_text ~~ '%ultrassom%'::text)
              Heap Blocks: exact=100
              ->  Bitmap Index Scan on tenders_search_text_trgm_idx
                    Index Cond: (search_text ~~ '%ultrassom%'::text)
Execution Time: 0.788 ms
```

Páginas/buffers: 23.334 → 169, redução de **99,28%**.

### Raro, 300 mil — antes

```text
Limit  (actual time=104.154..105.371 rows=20 loops=1)
  Buffers: shared hit=14073 read=56018
  ->  Gather Merge
        ->  Parallel Seq Scan on tenders
              Filter: (search_text ~~ '%ultrassom%'::text)
              Rows Removed by Filter: 99900 (por worker)
Execution Time: 105.386 ms
```

### Raro, 300 mil — depois

```text
Limit  (actual time=4.475..4.478 rows=20 loops=1)
  Buffers: shared hit=214 read=264
  ->  Sort
        ->  Bitmap Heap Scan on tenders
              Recheck Cond: (search_text ~~ '%ultrassom%'::text)
              Heap Blocks: exact=300
              ->  Bitmap Index Scan on tenders_search_text_trgm_idx
                    Index Cond: (search_text ~~ '%ultrassom%'::text)
Execution Time: 4.501 ms
```

Páginas/buffers: 70.091 → 478, redução de **99,32%**.

### Comum, 100 mil — depois

```text
Limit  (actual time=55.059..56.785 rows=20 loops=1)
  Buffers: shared hit=12756 read=10682
  ->  Gather Merge
        ->  Sort
              Sort Key: CASE WHEN title_norm LIKE ... END DESC, published_at DESC, id
              ->  Parallel Seq Scan on tenders
                    Filter: (search_text ~~ '%contratacao%'::text)
                    Rows Removed by Filter: 16667 (por worker)
Execution Time: 56.808 ms
```

O planner rejeita corretamente o GIN quando 50% da tabela casa. O plano legado de 1 milhão confirma a mesma forma (`Parallel Seq Scan`, 233.438 buffers no topo); não se usa a latência HTTP daquela rodada porque o pool parcial de 2 s contaminou os resultados.

## Rajada: 500 conexões de um cliente + 10 do segundo

| Métrica | Antes (`903e88c`) | Depois |
|---|---:|---:|
| cliente A: respostas 429 | 0 | 155.032 |
| cliente A: respostas 200 | 0 concluídas em 10 s | 460 |
| cliente B: p95 | >10 s, 0 respostas concluídas | 283 ms, 322/322 respostas 200 |
| 5xx inesperados | 0 | 0 |
| pico RSS da API | 419 MiB | 686 MiB |
| event-loop lag p95 | 22,3 ms | 39,7 ms |

O RSS maior depois é o custo de aceitar 500 sockets e responder 155 mil descartes rápidos; o banco fica protegido por 10 requisições simultâneas do cliente A e o cliente B preserva seu próprio limite. O antes é uma medição censurada, não zero de latência: o pool ficou saturado e nenhuma resposta terminou dentro dos 10 s.

## Diagnóstico das anomalias da rodada descartada

- O teto próximo de 2 s e os 500 vieram de medir o servidor já parcialmente modificado com `DB_CONNECTION_TIMEOUT_MS=2000`; o erro de aquisição ainda caía em 500. O handler agora converte esse caso em `503 SERVICE_OVERLOADED`.
- As células zeradas eram cenários sem resposta concluída antes de o autocannon encerrar a amostra, seguidos sem uma espera explícita pelo banco. O harness agora espera `pg_stat_activity` ficar ocioso entre células.
- O limite por janela e o limite de concorrência agora são desligados somente na rodada que mede a consulta, e são medidos separadamente na rajada. Assim, 429 não é confundido com ganho do índice.
- `shared_buffers` foi registrado e permaneceu o padrão do container (aprox. 160 MiB); nenhum ajuste de PostgreSQL foi feito entre antes e depois.

## Reprodução

```sh
pnpm --filter @workspace/api-server run scale:seed -- --rows 100000 --seed 42
pnpm --filter @workspace/api-server run scale:load -- --label exemplo --duration 10 --concurrency 10,50,100
pnpm --filter @workspace/api-server run scale:drop
```

Para medir consulta pura depois da proteção, elevar temporariamente apenas no processo do harness `RATE_LIMIT_ANON_PER_MINUTE`, `MAX_INFLIGHT_PER_ANON`, `MAX_INFLIGHT_GLOBAL`, `DB_CONNECTION_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS` e `REQUEST_TIMEOUT_MS`, como registrado nos JSONs. Nunca executar o seed fora de `licita_scale`.
