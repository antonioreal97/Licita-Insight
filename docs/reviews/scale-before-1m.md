# Carga before-1m

> Evidência legada, mantida somente pelos planos `EXPLAIN (ANALYZE, BUFFERS)` de 1 milhão de linhas. A tabela de carga desta rodada é inválida para comparação: foi executada com a implementação parcial (pool com espera de 2 s), houve 500 por esgotamento do pool e cenários sem respostas concluídas dentro da amostra. A retomada reproduziu o baseline limpo no código original `903e88c` com 100 mil linhas e, para preservar a máquina, 300 mil linhas.

- Linhas: 1.000.000
- Duração por amostra: 5s
- Pico RSS: 366592000 bytes
- Event loop lag p95/máx.: 22.298623/256.245759 ms

| Cenário | Conc. | RPS | p50 ms | p95 ms | p99 ms | erros | não-2xx |
|---|---:|---:|---:|---:|---:|---:|---:|
| busca-comum | 10 | 1 | 2531 | 3710.072625 | 3710 | 0 | 0 |
| busca-comum | 50 | 16.2 | 2016 | 2026.310333 | 4319 | 0 | 81 |
| busca-comum | 100 | 37.4 | 2020 | 2042.298125 | 2043 | 0 | 187 |
| busca-media | 10 | 0.8 | 3019 | 4658.7840830000005 | 4658 | 0 | 0 |
| busca-media | 50 | 16.4 | 2014 | 2034.706708 | 2035 | 0 | 82 |
| busca-media | 100 | 39 | 2038 | 2057.765792 | 2058 | 0 | 195 |
| busca-rara | 10 | 0.8 | 2755 | 3998.0123750000002 | 3998 | 0 | 0 |
| busca-rara | 50 | 18 | 2067 | 2106.710792 | 2106 | 0 | 90 |
| busca-rara | 100 | 37.21 | 2019 | 2040.132916 | 2040 | 0 | 186 |
| busca-multitermo | 10 | 0.8 | 3908 | 4082.173416 | 4082 | 0 | 0 |
| busca-multitermo | 50 | 15.8 | 2015 | 2031.555958 | 4027 | 0 | 79 |
| busca-multitermo | 100 | 38 | 2018 | 2040.301334 | 2040 | 0 | 190 |
| filtros | 10 | 3 | 2535 | 3974.790292 | 3974 | 0 | 5 |
| filtros | 50 | 10 | 4568 | 4574.094541 | 4575 | 0 | 20 |
| filtros | 100 | 34 | 2018 | 2036.031333 | 2036 | 0 | 170 |
| pagina-profunda | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| pagina-profunda | 50 | 17.61 | 2014 | 2063.051 | 2063 | 0 | 88 |
| pagina-profunda | 100 | 37.21 | 2026 | 2042.925334 | 2043 | 0 | 186 |
| sugestoes | 10 | 3.8 | 2005 | 2011.152125 | 2011 | 0 | 19 |
| sugestoes | 50 | 20 | 2039 | 2150.52775 | 2162 | 0 | 100 |
| sugestoes | 100 | 40 | 2094 | 2291.804958 | 2311 | 0 | 200 |
| detalhe | 10 | 277.8 | 11 | 75.50025 | 333 | 0 | 0 |
| detalhe | 50 | 775 | 28 | 294.018084 | 471 | 0 | 0 |
| detalhe | 100 | 1005.6 | 79 | 251.8905 | 411 | 0 | 0 |
| rajada-cliente-a | 500 | 196.4 | 2161 | 2312.088417 | 2318 | 0 | 982 |
| cliente-b-durante-rajada | 10 | 4 | 2085 | 2301.3860839999998 | 2301 | 0 | 20 |

## EXPLAIN (ANALYZE, BUFFERS)

### busca-comum

```text
Limit  (cost=247661.02..247663.35 rows=20 width=26) (actual time=375.935..378.162 rows=20 loops=1)
  Buffers: shared hit=11719 read=221719 written=17
  ->  Gather Merge  (cost=247661.02..296113.73 rows=415280 width=26) (actual time=369.965..372.191 rows=20 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=11719 read=221719 written=17
        ->  Sort  (cost=246660.99..247180.09 rows=207640 width=26) (actual time=359.669..359.670 rows=20 loops=3)
              Sort Key: (CASE WHEN (title_norm ~~ '%contratacao%'::text) THEN 5 WHEN (object_norm ~~ '%contratacao%'::text) THEN 4 WHEN (items_norm ~~ '%contratacao%'::text) THEN 3 WHEN (organization_norm ~~ '%contratacao%'::text) THEN 2 WHEN (other_norm ~~ '%contratacao%'::text) THEN 1 ELSE 0 END) DESC, published_at DESC NULLS LAST, id
              Sort Method: top-N heapsort  Memory: 27kB
              Buffers: shared hit=11719 read=221719 written=17
              Worker 0:  Sort Method: top-N heapsort  Memory: 27kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 27kB
              ->  Parallel Seq Scan on tenders  (cost=0.00..241135.77 rows=207640 width=26) (actual time=10.290..342.302 rows=166667 loops=3)
                    Filter: (search_text ~~ '%contratacao%'::text)
                    Rows Removed by Filter: 166667
                    Buffers: shared hit=11615 read=221719 written=17
Planning:
  Buffers: shared hit=86 read=3 written=3
Planning Time: 0.447 ms
JIT:
  Functions: 14
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 1.639 ms, Inlining 0.000 ms, Optimization 1.278 ms, Emission 35.377 ms, Total 38.294 ms
Execution Time: 378.686 ms
Finalize Aggregate  (cost=240059.58..240059.59 rows=1 width=8) (actual time=312.980..315.676 rows=1 loops=1)
  Buffers: shared hit=11711 read=221623
  ->  Gather  (cost=240059.37..240059.58 rows=2 width=8) (actual time=312.875..315.662 rows=3 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=11711 read=221623
        ->  Partial Aggregate  (cost=239059.37..239059.38 rows=1 width=8) (actual time=305.388..305.388 rows=1 loops=3)
              Buffers: shared hit=11711 read=221623
              ->  Parallel Seq Scan on tenders  (cost=0.00..238540.27 rows=207640 width=0) (actual time=3.180..299.254 rows=166667 loops=3)
                    Filter: (search_text ~~ '%contratacao%'::text)
                    Rows Removed by Filter: 166667
                    Buffers: shared hit=11711 read=221623
Planning Time: 0.087 ms
JIT:
  Functions: 14
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 0.707 ms, Inlining 0.000 ms, Optimization 0.639 ms, Emission 8.876 ms, Total 10.223 ms
Execution Time: 315.982 ms
```

### busca-media

```text
Limit  (cost=240093.32..240095.65 rows=20 width=22) (actual time=4085.524..4085.613 rows=20 loops=1)
  Buffers: shared hit=16178 read=217156
  ->  Gather Merge  (cost=240093.32..244943.02 rows=41566 width=22) (actual time=4054.396..4054.483 rows=20 loops=1)
        Workers Planned: 2
        Workers Launched: 0
        Buffers: shared hit=16178 read=217156
        ->  Sort  (cost=239093.29..239145.25 rows=20783 width=22) (actual time=4054.229..4054.230 rows=20 loops=1)
              Sort Key: published_at DESC NULLS LAST, id
              Sort Method: top-N heapsort  Memory: 27kB
              Buffers: shared hit=16178 read=217156
              ->  Parallel Seq Scan on tenders  (cost=0.00..238540.27 rows=20783 width=22) (actual time=0.061..4026.685 rows=50000 loops=1)
                    Filter: (search_text ~~ '%tecnologia%'::text)
                    Rows Removed by Filter: 950000
                    Buffers: shared hit=16178 read=217156
Planning Time: 0.216 ms
JIT:
  Functions: 6
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 0.436 ms, Inlining 0.000 ms, Optimization 0.332 ms, Emission 30.798 ms, Total 31.566 ms
Execution Time: 4086.123 ms
Finalize Aggregate  (cost=239592.44..239592.45 rows=1 width=8) (actual time=718.163..721.548 rows=1 loops=1)
  Buffers: shared hit=16192 read=217142
  ->  Gather  (cost=239592.22..239592.43 rows=2 width=8) (actual time=718.008..721.516 rows=3 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16192 read=217142
        ->  Partial Aggregate  (cost=238592.22..238592.23 rows=1 width=8) (actual time=697.645..697.646 rows=1 loops=3)
              Buffers: shared hit=16192 read=217142
              ->  Parallel Seq Scan on tenders  (cost=0.00..238540.27 rows=20783 width=0) (actual time=6.223..696.104 rows=16667 loops=3)
                    Filter: (search_text ~~ '%tecnologia%'::text)
                    Rows Removed by Filter: 316667
                    Buffers: shared hit=16192 read=217142
Planning Time: 0.144 ms
JIT:
  Functions: 14
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 1.425 ms, Inlining 0.000 ms, Optimization 1.151 ms, Emission 17.467 ms, Total 20.043 ms
Execution Time: 722.052 ms
```

### busca-rara

```text
Limit  (cost=239553.59..239555.93 rows=20 width=22) (actual time=3878.979..3879.073 rows=20 loops=1)
  Buffers: shared hit=15858 read=217476
  ->  Gather Merge  (cost=239553.59..239670.27 rows=1000 width=22) (actual time=3852.750..3852.843 rows=20 loops=1)
        Workers Planned: 2
        Workers Launched: 0
        Buffers: shared hit=15858 read=217476
        ->  Sort  (cost=238553.57..238554.82 rows=500 width=22) (actual time=3852.580..3852.581 rows=20 loops=1)
              Sort Key: published_at DESC NULLS LAST, id
              Sort Method: top-N heapsort  Memory: 27kB
              Buffers: shared hit=15858 read=217476
              ->  Parallel Seq Scan on tenders  (cost=0.00..238540.27 rows=500 width=22) (actual time=1.911..3847.721 rows=1000 loops=1)
                    Filter: (search_text ~~ '%ultrassom%'::text)
                    Rows Removed by Filter: 999000
                    Buffers: shared hit=15858 read=217476
Planning Time: 0.272 ms
JIT:
  Functions: 6
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 1.444 ms, Inlining 0.000 ms, Optimization 3.226 ms, Emission 23.016 ms, Total 27.685 ms
Execution Time: 3880.622 ms
Finalize Aggregate  (cost=239541.73..239541.74 rows=1 width=8) (actual time=1516.827..1516.891 rows=1 loops=1)
  Buffers: shared hit=16129 read=217205
  ->  Gather  (cost=239541.52..239541.73 rows=2 width=8) (actual time=1516.820..1516.885 rows=1 loops=1)
        Workers Planned: 2
        Workers Launched: 0
        Buffers: shared hit=16129 read=217205
        ->  Partial Aggregate  (cost=238541.52..238541.53 rows=1 width=8) (actual time=1516.672..1516.673 rows=1 loops=1)
              Buffers: shared hit=16129 read=217205
              ->  Parallel Seq Scan on tenders  (cost=0.00..238540.27 rows=500 width=0) (actual time=10.133..1515.905 rows=1000 loops=1)
                    Filter: (search_text ~~ '%ultrassom%'::text)
                    Rows Removed by Filter: 999000
                    Buffers: shared hit=16129 read=217205
Planning Time: 0.104 ms
JIT:
  Functions: 6
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 0.230 ms, Inlining 0.000 ms, Optimization 0.230 ms, Emission 7.842 ms, Total 8.302 ms
Execution Time: 1517.178 ms
```

### busca-multitermo

```text
Limit  (cost=241624.18..241626.51 rows=20 width=22) (actual time=3977.164..3977.390 rows=20 loops=1)
  Buffers: shared hit=16967 read=216367
  ->  Gather Merge  (cost=241624.18..241636.31 rows=104 width=22) (actual time=3964.342..3964.566 rows=20 loops=1)
        Workers Planned: 2
        Workers Launched: 0
        Buffers: shared hit=16967 read=216367
        ->  Sort  (cost=240624.16..240624.29 rows=52 width=22) (actual time=3964.200..3964.201 rows=20 loops=1)
              Sort Key: published_at DESC NULLS LAST, id
              Sort Method: top-N heapsort  Memory: 27kB
              Buffers: shared hit=16967 read=216367
              ->  Parallel Seq Scan on tenders  (cost=0.00..240622.77 rows=52 width=22) (actual time=0.027..3934.690 rows=50000 loops=1)
                    Filter: ((search_text ~~ '%tecnologia%'::text) AND (search_text ~~ '%integracao%'::text) AND (search_text ~~ '%especializada%'::text))
                    Rows Removed by Filter: 950000
                    Buffers: shared hit=16967 read=216367
Planning Time: 0.296 ms
JIT:
  Functions: 6
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 0.695 ms, Inlining 0.000 ms, Optimization 0.310 ms, Emission 12.513 ms, Total 13.518 ms
Execution Time: 3978.166 ms
Finalize Aggregate  (cost=241623.12..241623.13 rows=1 width=8) (actual time=1003.979..1007.126 rows=1 loops=1)
  Buffers: shared hit=17764 read=215570 written=1
  ->  Gather  (cost=241622.90..241623.11 rows=2 width=8) (actual time=1003.809..1007.102 rows=3 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=17764 read=215570 written=1
        ->  Partial Aggregate  (cost=240622.90..240622.91 rows=1 width=8) (actual time=977.930..977.931 rows=1 loops=3)
              Buffers: shared hit=17764 read=215570 written=1
              ->  Parallel Seq Scan on tenders  (cost=0.00..240622.77 rows=52 width=0) (actual time=12.495..975.874 rows=16667 loops=3)
                    Filter: ((search_text ~~ '%tecnologia%'::text) AND (search_text ~~ '%integracao%'::text) AND (search_text ~~ '%especializada%'::text))
                    Rows Removed by Filter: 316667
                    Buffers: shared hit=17764 read=215570 written=1
Planning Time: 0.320 ms
JIT:
  Functions: 14
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 1.627 ms, Inlining 0.000 ms, Optimization 1.259 ms, Emission 36.061 ms, Total 38.947 ms
Execution Time: 1007.715 ms
```

### filtros

```text
Limit  (cost=13137.86..13137.91 rows=20 width=22) (actual time=564.675..564.679 rows=0 loops=1)
  Buffers: shared hit=448 read=15232 written=3247
  ->  Sort  (cost=13137.86..13138.11 rows=101 width=22) (actual time=564.671..564.673 rows=0 loops=1)
        Sort Key: published_at DESC NULLS LAST, id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=448 read=15232 written=3247
        ->  Bitmap Heap Scan on tenders  (cost=4478.86..13135.17 rows=101 width=22) (actual time=564.663..564.665 rows=0 loops=1)
              Recheck Cond: ((state = 'SP'::text) AND (modality = 'pregao_eletronico'::text) AND (status = 'open'::text))
              Rows Removed by Index Recheck: 24606
              Filter: ((search_text ~~ '%tecnologia%'::text) AND (published_at >= '2025-01-01 03:00:00+00'::timestamp with time zone))
              Rows Removed by Filter: 2419
              Heap Blocks: exact=15342
              Buffers: shared hit=448 read=15232 written=3247
              ->  BitmapAnd  (cost=4478.86..4478.86 rows=2336 width=0) (actual time=95.493..95.494 rows=0 loops=1)
                    Buffers: shared read=338
                    ->  Bitmap Index Scan on tenders_state_idx  (cost=0.00..1034.88 rows=96328 width=0) (actual time=16.150..16.150 rows=96774 loops=1)
                          Index Cond: (state = 'SP'::text)
                          Buffers: shared read=78
                    ->  Bitmap Index Scan on tenders_modality_idx  (cost=0.00..1319.06 rows=122485 width=0) (actual time=48.620..48.620 rows=125000 loops=1)
                          Index Cond: (modality = 'pregao_eletronico'::text)
                          Buffers: shared read=101
                    ->  Bitmap Index Scan on tenders_status_idx  (cost=0.00..2124.34 rows=197855 width=0) (actual time=26.000..26.001 rows=200000 loops=1)
                          Index Cond: (status = 'open'::text)
                          Buffers: shared read=159
Planning:
  Buffers: shared hit=8
Planning Time: 0.325 ms
Execution Time: 565.475 ms
Aggregate  (cost=13135.42..13135.43 rows=1 width=8) (actual time=184.950..184.952 rows=1 loops=1)
  Buffers: shared hit=6210 read=9470 written=325
  ->  Bitmap Heap Scan on tenders  (cost=4478.86..13135.17 rows=101 width=0) (actual time=184.948..184.949 rows=0 loops=1)
        Recheck Cond: ((state = 'SP'::text) AND (modality = 'pregao_eletronico'::text) AND (status = 'open'::text))
        Rows Removed by Index Recheck: 24606
        Filter: ((search_text ~~ '%tecnologia%'::text) AND (published_at >= '2025-01-01 03:00:00+00'::timestamp with time zone))
        Rows Removed by Filter: 2419
        Heap Blocks: exact=15342
        Buffers: shared hit=6210 read=9470 written=325
        ->  BitmapAnd  (cost=4478.86..4478.86 rows=2336 width=0) (actual time=88.316..88.318 rows=0 loops=1)
              Buffers: shared read=338
              ->  Bitmap Index Scan on tenders_state_idx  (cost=0.00..1034.88 rows=96328 width=0) (actual time=9.635..9.636 rows=96774 loops=1)
                    Index Cond: (state = 'SP'::text)
                    Buffers: shared read=78
              ->  Bitmap Index Scan on tenders_modality_idx  (cost=0.00..1319.06 rows=122485 width=0) (actual time=40.429..40.429 rows=125000 loops=1)
                    Index Cond: (modality = 'pregao_eletronico'::text)
                    Buffers: shared read=101
              ->  Bitmap Index Scan on tenders_status_idx  (cost=0.00..2124.34 rows=197855 width=0) (actual time=30.972..30.972 rows=200000 loops=1)
                    Index Cond: (status = 'open'::text)
                    Buffers: shared read=159
Planning Time: 0.187 ms
Execution Time: 188.456 ms
```

### pagina-profunda

```text
Limit  (cost=253916.63..253918.97 rows=20 width=22) (actual time=441.771..444.057 rows=20 loops=1)
  Buffers: shared hit=99 read=233325
  ->  Gather Merge  (cost=253335.59..301788.31 rows=415280 width=22) (actual time=434.806..438.449 rows=5000 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=99 read=233325
        ->  Sort  (cost=252335.57..252854.67 rows=207640 width=22) (actual time=418.249..418.347 rows=2423 loops=3)
              Sort Key: published_at DESC NULLS LAST, id
              Sort Method: top-N heapsort  Memory: 976kB
              Buffers: shared hit=99 read=233325
              Worker 0:  Sort Method: top-N heapsort  Memory: 995kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 972kB
              ->  Parallel Seq Scan on tenders  (cost=0.00..238540.27 rows=207640 width=22) (actual time=5.083..382.161 rows=166667 loops=3)
                    Filter: (search_text ~~ '%contratacao%'::text)
                    Rows Removed by Filter: 166667
                    Buffers: shared hit=18 read=233316
Planning Time: 0.132 ms
JIT:
  Functions: 14
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 1.194 ms, Inlining 0.000 ms, Optimization 0.822 ms, Emission 19.873 ms, Total 21.888 ms
Execution Time: 444.710 ms
Finalize Aggregate  (cost=240059.58..240059.59 rows=1 width=8) (actual time=794.263..796.718 rows=1 loops=1)
  Buffers: shared hit=32 read=233302
  ->  Gather  (cost=240059.37..240059.58 rows=2 width=8) (actual time=794.165..796.693 rows=3 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=32 read=233302
        ->  Partial Aggregate  (cost=239059.37..239059.38 rows=1 width=8) (actual time=785.906..785.907 rows=1 loops=3)
              Buffers: shared hit=32 read=233302
              ->  Parallel Seq Scan on tenders  (cost=0.00..238540.27 rows=207640 width=0) (actual time=3.915..772.770 rows=166667 loops=3)
                    Filter: (search_text ~~ '%contratacao%'::text)
                    Rows Removed by Filter: 166667
                    Buffers: shared hit=32 read=233302
Planning Time: 0.081 ms
JIT:
  Functions: 14
  Options: Inlining false, Optimization false, Expressions true, Deforming true
  Timing: Generation 2.582 ms, Inlining 0.000 ms, Optimization 0.843 ms, Emission 10.923 ms, Total 14.348 ms
Execution Time: 796.939 ms
```
