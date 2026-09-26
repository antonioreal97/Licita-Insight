# Carga before-100k-clean

- Linhas: 100.000
- Duração por amostra: 10s
- Máquina: darwin 25.5.0 arm64, 10 CPUs, 17179869184 bytes de RAM
- PostgreSQL: 16.15 (Debian 16.15-1.pgdg13+2); effective_cache_size=5242888kB, max_connections=100, random_page_cost=4, shared_buffers=163848kB, work_mem=4096kB
- Pico RSS: 419135488 bytes
- Event loop lag p95/máx.: 22.298623/28.884991 ms

| Cenário | Conc. | RPS | p50 ms | p95 ms | p99 ms | erros | não-2xx |
|---|---:|---:|---:|---:|---:|---:|---:|
| busca-comum | 10 | 26.6 | 348 | 513.931166 | 552 | 0 | 0 |
| busca-comum | 50 | 24.7 | 1756 | 2232.729125 | 2361 | 0 | 0 |
| busca-comum | 100 | 20 | 3697 | 4123.284042 | 4636 | 0 | 0 |
| busca-media | 10 | 24.9 | 389 | 449.895417 | 524 | 0 | 0 |
| busca-media | 50 | 21.9 | 1910 | 2602.197208 | 2689 | 0 | 0 |
| busca-media | 100 | 20 | 3841 | 4525.955292 | 5403 | 0 | 0 |
| busca-rara | 10 | 28.1 | 344 | 395.067 | 474 | 0 | 0 |
| busca-rara | 50 | 25.9 | 1686 | 2188.022834 | 2431 | 0 | 0 |
| busca-rara | 100 | 20 | 3453 | 4400.629083 | 4839 | 0 | 0 |
| busca-multitermo | 10 | 21.7 | 438 | 581.659834 | 660 | 0 | 0 |
| busca-multitermo | 50 | 19.61 | 2156 | 2687.086459 | 3039 | 0 | 0 |
| busca-multitermo | 100 | 19.3 | 4113 | 5155.591709 | 5861 | 0 | 0 |
| filtros | 10 | 330.7 | 28 | 46.65025 | 66 | 0 | 0 |
| filtros | 50 | 312.2 | 148 | 232.504917 | 350 | 0 | 0 |
| filtros | 100 | 331.5 | 293 | 339.859208 | 358 | 0 | 0 |
| pagina-profunda | 10 | 14.3 | 596 | 1067.384333 | 1137 | 0 | 0 |
| pagina-profunda | 50 | 13 | 3250 | 4107.440292 | 4549 | 0 | 0 |
| pagina-profunda | 100 | 10 | 6869 | 8232.908209 | 8319 | 0 | 0 |
| sugestoes | 10 | 22.8 | 428 | 510.503166 | 546 | 0 | 0 |
| sugestoes | 50 | 23.2 | 2123 | 2207.594958 | 2220 | 0 | 0 |
| sugestoes | 100 | 22.9 | 4200 | 4464.621625 | 4504 | 0 | 0 |
| detalhe | 10 | 5282 | 1 | 2.961833 | 3 | 0 | 0 |
| detalhe | 50 | 4639.2 | 10 | 13.329083 | 17 | 0 | 0 |
| detalhe | 100 | 4033.7 | 23 | 35.585666 | 46 | 0 | 0 |
| rajada-cliente-a | 500 | 0 | 0 | 0 | 0 | 0 | 0 |
| cliente-b-durante-rajada | 10 | 0 | 0 | 0 | 0 | 0 | 0 |

## EXPLAIN (ANALYZE, BUFFERS)

### busca-comum

```text
Limit  (cost=25662.94..25665.27 rows=20 width=26) (actual time=54.375..55.972 rows=20 loops=1)
  Buffers: shared hit=11755 read=11683
  ->  Gather Merge  (cost=25662.94..30484.41 rows=41324 width=26) (actual time=54.374..55.969 rows=20 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=11755 read=11683
        ->  Sort  (cost=24662.92..24714.57 rows=20662 width=26) (actual time=52.559..52.560 rows=16 loops=3)
              Sort Key: (CASE WHEN (title_norm ~~ '%contratacao%'::text) THEN 5 WHEN (object_norm ~~ '%contratacao%'::text) THEN 4 WHEN (items_norm ~~ '%contratacao%'::text) THEN 3 WHEN (organization_norm ~~ '%contratacao%'::text) THEN 2 WHEN (other_norm ~~ '%contratacao%'::text) THEN 1 ELSE 0 END) DESC, published_at DESC NULLS LAST, id
              Sort Method: top-N heapsort  Memory: 27kB
              Buffers: shared hit=11755 read=11683
              Worker 0:  Sort Method: top-N heapsort  Memory: 27kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 27kB
              ->  Parallel Seq Scan on tenders  (cost=0.00..24113.11 rows=20662 width=26) (actual time=0.023..49.824 rows=16667 loops=3)
                    Filter: (search_text ~~ '%contratacao%'::text)
                    Rows Removed by Filter: 16667
                    Buffers: shared hit=11651 read=11683
Planning:
  Buffers: shared hit=77
Planning Time: 0.249 ms
Execution Time: 55.993 ms
Aggregate  (cost=24707.97..24707.98 rows=1 width=8) (actual time=71.861..71.862 rows=1 loops=1)
  Buffers: shared hit=11747 read=11587
  ->  Seq Scan on tenders  (cost=0.00..24584.00 rows=49590 width=0) (actual time=0.026..70.480 rows=50000 loops=1)
        Filter: (search_text ~~ '%contratacao%'::text)
        Rows Removed by Filter: 50000
        Buffers: shared hit=11747 read=11587
Planning Time: 0.136 ms
Execution Time: 71.891 ms
```

### busca-media

```text
Limit  (cost=24717.31..24717.36 rows=20 width=22) (actual time=97.276..97.278 rows=20 loops=1)
  Buffers: shared hit=16269 read=7065
  ->  Sort  (cost=24717.31..24729.84 rows=5010 width=22) (actual time=97.275..97.276 rows=20 loops=1)
        Sort Key: published_at DESC NULLS LAST, id
        Sort Method: top-N heapsort  Memory: 26kB
        Buffers: shared hit=16269 read=7065
        ->  Seq Scan on tenders  (cost=0.00..24584.00 rows=5010 width=22) (actual time=0.095..96.883 rows=5000 loops=1)
              Filter: (search_text ~~ '%tecnologia%'::text)
              Rows Removed by Filter: 95000
              Buffers: shared hit=16269 read=7065
Planning Time: 0.088 ms
Execution Time: 97.287 ms
Aggregate  (cost=24596.53..24596.53 rows=1 width=8) (actual time=95.837..95.838 rows=1 loops=1)
  Buffers: shared hit=16269 read=7065
  ->  Seq Scan on tenders  (cost=0.00..24584.00 rows=5010 width=0) (actual time=0.089..95.624 rows=5000 loops=1)
        Filter: (search_text ~~ '%tecnologia%'::text)
        Rows Removed by Filter: 95000
        Buffers: shared hit=16269 read=7065
Planning Time: 0.088 ms
Execution Time: 95.850 ms
```

### busca-rara

```text
Limit  (cost=24586.58..24586.63 rows=20 width=22) (actual time=91.531..91.534 rows=20 loops=1)
  Buffers: shared hit=16316 read=7018
  ->  Sort  (cost=24586.58..24586.82 rows=97 width=22) (actual time=91.531..91.532 rows=20 loops=1)
        Sort Key: published_at DESC NULLS LAST, id
        Sort Method: top-N heapsort  Memory: 27kB
        Buffers: shared hit=16316 read=7018
        ->  Seq Scan on tenders  (cost=0.00..24584.00 rows=97 width=22) (actual time=0.227..91.458 rows=100 loops=1)
              Filter: (search_text ~~ '%ultrassom%'::text)
              Rows Removed by Filter: 99900
              Buffers: shared hit=16316 read=7018
Planning Time: 0.075 ms
Execution Time: 91.543 ms
Aggregate  (cost=24584.24..24584.25 rows=1 width=8) (actual time=89.962..89.963 rows=1 loops=1)
  Buffers: shared hit=16316 read=7018
  ->  Seq Scan on tenders  (cost=0.00..24584.00 rows=97 width=0) (actual time=0.218..89.937 rows=100 loops=1)
        Filter: (search_text ~~ '%ultrassom%'::text)
        Rows Removed by Filter: 99900
        Buffers: shared hit=16316 read=7018
Planning Time: 0.080 ms
Execution Time: 89.978 ms
```

### busca-multitermo

```text
Limit  (cost=25063.25..25064.42 rows=10 width=22) (actual time=39.278..41.227 rows=20 loops=1)
  Buffers: shared hit=16286 read=7138
  ->  Gather Merge  (cost=25063.25..25064.42 rows=10 width=22) (actual time=39.278..41.225 rows=20 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16286 read=7138
        ->  Sort  (cost=24063.22..24063.24 rows=5 width=22) (actual time=37.750..37.751 rows=16 loops=3)
              Sort Key: published_at DESC NULLS LAST, id
              Sort Method: top-N heapsort  Memory: 27kB
              Buffers: shared hit=16286 read=7138
              Worker 0:  Sort Method: top-N heapsort  Memory: 27kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 27kB
              ->  Parallel Seq Scan on tenders  (cost=0.00..24063.17 rows=5 width=22) (actual time=0.034..37.516 rows=1667 loops=3)
                    Filter: ((search_text ~~ '%tecnologia%'::text) AND (search_text ~~ '%integracao%'::text) AND (search_text ~~ '%especializada%'::text))
                    Rows Removed by Filter: 31667
                    Buffers: shared hit=16205 read=7129
Planning Time: 0.166 ms
Execution Time: 41.239 ms
Aggregate  (cost=25084.03..25084.04 rows=1 width=8) (actual time=98.550..98.551 rows=1 loops=1)
  Buffers: shared hit=16269 read=7065
  ->  Seq Scan on tenders  (cost=0.00..25084.00 rows=13 width=0) (actual time=0.029..98.333 rows=5000 loops=1)
        Filter: ((search_text ~~ '%tecnologia%'::text) AND (search_text ~~ '%integracao%'::text) AND (search_text ~~ '%especializada%'::text))
        Rows Removed by Filter: 95000
        Buffers: shared hit=16269 read=7065
Planning Time: 0.203 ms
Execution Time: 98.566 ms
```

### filtros

```text
Limit  (cost=1385.54..1385.57 rows=11 width=22) (actual time=3.561..3.562 rows=0 loops=1)
  Buffers: shared hit=174 read=104
  ->  Sort  (cost=1385.54..1385.57 rows=11 width=22) (actual time=3.560..3.561 rows=0 loops=1)
        Sort Key: published_at DESC NULLS LAST, id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=174 read=104
        ->  Bitmap Heap Scan on tenders  (cost=478.69..1385.35 rows=11 width=22) (actual time=3.557..3.558 rows=0 loops=1)
              Recheck Cond: ((state = 'SP'::text) AND (modality = 'pregao_eletronico'::text) AND (status = 'open'::text))
              Filter: ((search_text ~~ '%tecnologia%'::text) AND (published_at >= '2025-01-01 03:00:00+00'::timestamp with time zone))
              Rows Removed by Filter: 241
              Heap Blocks: exact=241
              Buffers: shared hit=174 read=104
              ->  BitmapAnd  (cost=478.69..478.69 rows=245 width=0) (actual time=3.018..3.019 rows=0 loops=1)
                    Buffers: shared read=37
                    ->  Bitmap Index Scan on tenders_state_idx  (cost=0.00..114.07 rows=9837 width=0) (actual time=0.508..0.508 rows=9678 loops=1)
                          Index Cond: (state = 'SP'::text)
                          Buffers: shared read=9
                    ->  Bitmap Index Scan on tenders_modality_idx  (cost=0.00..141.52 rows=12430 width=0) (actual time=0.830..0.830 rows=12500 loops=1)
                          Index Cond: (modality = 'pregao_eletronico'::text)
                          Buffers: shared read=11
                    ->  Bitmap Index Scan on tenders_status_idx  (cost=0.00..222.59 rows=20040 width=0) (actual time=1.398..1.398 rows=20000 loops=1)
                          Index Cond: (status = 'open'::text)
                          Buffers: shared read=17
Planning:
  Buffers: shared hit=8
Planning Time: 0.121 ms
Execution Time: 3.603 ms
Aggregate  (cost=1385.37..1385.38 rows=1 width=8) (actual time=2.751..2.753 rows=1 loops=1)
  Buffers: shared hit=278
  ->  Bitmap Heap Scan on tenders  (cost=478.69..1385.35 rows=11 width=0) (actual time=2.749..2.750 rows=0 loops=1)
        Recheck Cond: ((state = 'SP'::text) AND (modality = 'pregao_eletronico'::text) AND (status = 'open'::text))
        Filter: ((search_text ~~ '%tecnologia%'::text) AND (published_at >= '2025-01-01 03:00:00+00'::timestamp with time zone))
        Rows Removed by Filter: 241
        Heap Blocks: exact=241
        Buffers: shared hit=278
        ->  BitmapAnd  (cost=478.69..478.69 rows=245 width=0) (actual time=2.293..2.294 rows=0 loops=1)
              Buffers: shared hit=37
              ->  Bitmap Index Scan on tenders_state_idx  (cost=0.00..114.07 rows=9837 width=0) (actual time=0.264..0.264 rows=9678 loops=1)
                    Index Cond: (state = 'SP'::text)
                    Buffers: shared hit=9
              ->  Bitmap Index Scan on tenders_modality_idx  (cost=0.00..141.52 rows=12430 width=0) (actual time=0.576..0.576 rows=12500 loops=1)
                    Index Cond: (modality = 'pregao_eletronico'::text)
                    Buffers: shared hit=11
              ->  Bitmap Index Scan on tenders_status_idx  (cost=0.00..222.59 rows=20040 width=0) (actual time=1.264..1.264 rows=20000 loops=1)
                    Index Cond: (status = 'open'::text)
                    Buffers: shared hit=17
Planning Time: 0.086 ms
Execution Time: 2.912 ms
```

### pagina-profunda

```text
Limit  (cost=26808.65..26810.98 rows=20 width=22) (actual time=48.210..49.976 rows=20 loops=1)
  Buffers: shared hit=16152 read=7272
  ->  Gather Merge  (cost=26227.61..31049.08 rows=41324 width=22) (actual time=46.827..49.878 rows=5000 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16152 read=7272
        ->  Sort  (cost=25227.59..25279.24 rows=20662 width=22) (actual time=45.247..45.320 rows=2450 loops=3)
              Sort Key: published_at DESC NULLS LAST, id
              Sort Method: top-N heapsort  Memory: 981kB
              Buffers: shared hit=16152 read=7272
              Worker 0:  Sort Method: top-N heapsort  Memory: 984kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 965kB
              ->  Parallel Seq Scan on tenders  (cost=0.00..23854.83 rows=20662 width=22) (actual time=0.027..36.954 rows=16667 loops=3)
                    Filter: (search_text ~~ '%contratacao%'::text)
                    Rows Removed by Filter: 16667
                    Buffers: shared hit=16062 read=7272
Planning Time: 0.085 ms
Execution Time: 49.987 ms
Aggregate  (cost=24707.97..24707.98 rows=1 width=8) (actual time=72.199..72.199 rows=1 loops=1)
  Buffers: shared hit=16126 read=7208
  ->  Seq Scan on tenders  (cost=0.00..24584.00 rows=49590 width=0) (actual time=0.008..70.870 rows=50000 loops=1)
        Filter: (search_text ~~ '%contratacao%'::text)
        Rows Removed by Filter: 50000
        Buffers: shared hit=16126 read=7208
Planning Time: 0.067 ms
Execution Time: 72.211 ms
```
