# Carga after-100k-clean

- Linhas: 100.000
- Duração por amostra: 10s
- Máquina: darwin 25.5.0 arm64, 10 CPUs, 17179869184 bytes de RAM
- PostgreSQL: 16.15 (Debian 16.15-1.pgdg13+2); effective_cache_size=5242888kB, max_connections=100, random_page_cost=4, shared_buffers=163848kB, work_mem=4096kB
- Pico RSS: 503332864 bytes
- Event loop lag p95/máx.: 22.413311/239.861759 ms

| Cenário | Conc. | RPS | p50 ms | p95 ms | p99 ms | erros | não-2xx |
|---|---:|---:|---:|---:|---:|---:|---:|
| busca-comum | 10 | 25.4 | 376 | 521.83925 | 573 | 0 | 0 |
| busca-comum | 50 | 24.7 | 1788 | 2305.390417 | 2436 | 0 | 0 |
| busca-comum | 100 | 20 | 3969 | 4057.111458 | 4802 | 0 | 0 |
| busca-media | 10 | 267.61 | 35 | 50.652875 | 67 | 0 | 0 |
| busca-media | 50 | 266.4 | 182 | 215.276041 | 236 | 0 | 0 |
| busca-media | 100 | 260 | 375 | 404.328875 | 414 | 0 | 0 |
| busca-rara | 10 | 914.9 | 10 | 14.531083 | 19 | 0 | 0 |
| busca-rara | 50 | 978.9 | 49 | 60.175208 | 68 | 0 | 0 |
| busca-rara | 100 | 920.4 | 103 | 133.527958 | 146 | 0 | 0 |
| busca-multitermo | 10 | 168.8 | 57 | 80.695542 | 102 | 0 | 0 |
| busca-multitermo | 50 | 163 | 298 | 345.074792 | 368 | 0 | 0 |
| busca-multitermo | 100 | 159.7 | 603 | 672.468459 | 705 | 0 | 0 |
| filtros | 10 | 495.3 | 18 | 30.162167 | 45 | 0 | 0 |
| filtros | 50 | 489.3 | 96 | 131.58275 | 188 | 0 | 0 |
| filtros | 100 | 495.8 | 195 | 236.642042 | 259 | 0 | 0 |
| pagina-profunda | 10 | 14.4 | 593 | 1066.299458 | 1149 | 0 | 0 |
| pagina-profunda | 50 | 12.3 | 3208 | 4597.472584 | 5204 | 0 | 0 |
| pagina-profunda | 100 | 10 | 5545 | 6381.684583 | 7048 | 0 | 0 |
| sugestoes | 10 | 27.1 | 362 | 429.484584 | 460 | 0 | 0 |
| sugestoes | 50 | 27.9 | 1776 | 1885.145333 | 1909 | 0 | 0 |
| sugestoes | 100 | 27.8 | 3501 | 3604.068083 | 3688 | 0 | 0 |
| detalhe | 10 | 3762.7 | 2 | 4.602917 | 10 | 0 | 0 |
| detalhe | 50 | 3690.6 | 12 | 20.834 | 23 | 0 | 0 |
| detalhe | 100 | 3723.2 | 25 | 35.974417 | 41 | 0 | 0 |

## EXPLAIN (ANALYZE, BUFFERS)

### busca-comum

```text
Limit  (cost=25669.63..25671.96 rows=20 width=26) (actual time=55.059..56.785 rows=20 loops=1)
  Buffers: shared hit=12756 read=10682
  ->  Gather Merge  (cost=25669.63..30531.00 rows=41666 width=26) (actual time=55.058..56.782 rows=20 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=12756 read=10682
        ->  Sort  (cost=24669.60..24721.69 rows=20833 width=26) (actual time=52.449..52.450 rows=16 loops=3)
              Sort Key: (CASE WHEN (title_norm ~~ '%contratacao%'::text) THEN 5 WHEN (object_norm ~~ '%contratacao%'::text) THEN 4 WHEN (items_norm ~~ '%contratacao%'::text) THEN 3 WHEN (organization_norm ~~ '%contratacao%'::text) THEN 2 WHEN (other_norm ~~ '%contratacao%'::text) THEN 1 ELSE 0 END) DESC, published_at DESC NULLS LAST, id
              Sort Method: top-N heapsort  Memory: 27kB
              Buffers: shared hit=12756 read=10682
              Worker 0:  Sort Method: top-N heapsort  Memory: 27kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 27kB
              ->  Parallel Seq Scan on tenders  (cost=0.00..24115.25 rows=20833 width=26) (actual time=0.020..49.966 rows=16667 loops=3)
                    Filter: (search_text ~~ '%contratacao%'::text)
                    Rows Removed by Filter: 16667
                    Buffers: shared hit=12652 read=10682
Planning:
  Buffers: shared hit=95 dirtied=1
Planning Time: 0.885 ms
Execution Time: 56.808 ms
Aggregate  (cost=24709.00..24709.01 rows=1 width=8) (actual time=74.098..74.099 rows=1 loops=1)
  Buffers: shared hit=12740 read=10594 written=14
  ->  Seq Scan on tenders  (cost=0.00..24584.00 rows=50000 width=0) (actual time=0.006..72.754 rows=50000 loops=1)
        Filter: (search_text ~~ '%contratacao%'::text)
        Rows Removed by Filter: 50000
        Buffers: shared hit=12740 read=10594 written=14
Planning:
  Buffers: shared hit=1
Planning Time: 0.101 ms
Execution Time: 74.121 ms
```

### busca-media

```text
Limit  (cost=12666.22..12666.27 rows=20 width=22) (actual time=8.852..8.854 rows=20 loops=1)
  Buffers: shared hit=3249 read=1853
  ->  Sort  (cost=12666.22..12678.71 rows=4997 width=22) (actual time=8.852..8.853 rows=20 loops=1)
        Sort Key: published_at DESC NULLS LAST, id
        Sort Method: top-N heapsort  Memory: 27kB
        Buffers: shared hit=3249 read=1853
        ->  Bitmap Heap Scan on tenders  (cost=370.99..12533.25 rows=4997 width=22) (actual time=1.838..8.546 rows=5000 loops=1)
              Recheck Cond: (search_text ~~ '%tecnologia%'::text)
              Heap Blocks: exact=5000
              Buffers: shared hit=3249 read=1853
              ->  Bitmap Index Scan on tenders_search_text_trgm_idx  (cost=0.00..369.74 rows=4997 width=0) (actual time=1.480..1.480 rows=5000 loops=1)
                    Index Cond: (search_text ~~ '%tecnologia%'::text)
                    Buffers: shared hit=46 read=56
Planning:
  Buffers: shared hit=1
Planning Time: 0.083 ms
Execution Time: 8.976 ms
Aggregate  (cost=12545.75..12545.76 rows=1 width=8) (actual time=5.727..5.728 rows=1 loops=1)
  Buffers: shared hit=5102
  ->  Bitmap Heap Scan on tenders  (cost=370.99..12533.25 rows=4997 width=0) (actual time=1.575..5.581 rows=5000 loops=1)
        Recheck Cond: (search_text ~~ '%tecnologia%'::text)
        Heap Blocks: exact=5000
        Buffers: shared hit=5102
        ->  Bitmap Index Scan on tenders_search_text_trgm_idx  (cost=0.00..369.74 rows=4997 width=0) (actual time=1.220..1.220 rows=5000 loops=1)
              Index Cond: (search_text ~~ '%tecnologia%'::text)
              Buffers: shared hit=102
Planning:
  Buffers: shared hit=1
Planning Time: 0.090 ms
Execution Time: 5.817 ms
```

### busca-rara

```text
Limit  (cost=762.71..762.76 rows=20 width=22) (actual time=0.775..0.777 rows=20 loops=1)
  Buffers: shared hit=140 read=29
  ->  Sort  (cost=762.71..763.01 rows=120 width=22) (actual time=0.775..0.776 rows=20 loops=1)
        Sort Key: published_at DESC NULLS LAST, id
        Sort Method: top-N heapsort  Memory: 27kB
        Buffers: shared hit=140 read=29
        ->  Bitmap Heap Scan on tenders  (cost=303.84..759.52 rows=120 width=22) (actual time=0.588..0.758 rows=100 loops=1)
              Recheck Cond: (search_text ~~ '%ultrassom%'::text)
              Heap Blocks: exact=100
              Buffers: shared hit=140 read=29
              ->  Bitmap Index Scan on tenders_search_text_trgm_idx  (cost=0.00..303.81 rows=120 width=0) (actual time=0.575..0.575 rows=100 loops=1)
                    Index Cond: (search_text ~~ '%ultrassom%'::text)
                    Buffers: shared hit=40 read=29
Planning:
  Buffers: shared hit=1
Planning Time: 0.118 ms
Execution Time: 0.788 ms
Aggregate  (cost=759.82..759.83 rows=1 width=8) (actual time=0.337..0.337 rows=1 loops=1)
  Buffers: shared hit=169
  ->  Bitmap Heap Scan on tenders  (cost=303.84..759.52 rows=120 width=0) (actual time=0.272..0.332 rows=100 loops=1)
        Recheck Cond: (search_text ~~ '%ultrassom%'::text)
        Heap Blocks: exact=100
        Buffers: shared hit=169
        ->  Bitmap Index Scan on tenders_search_text_trgm_idx  (cost=0.00..303.81 rows=120 width=0) (actual time=0.264..0.264 rows=100 loops=1)
              Index Cond: (search_text ~~ '%ultrassom%'::text)
              Buffers: shared hit=69
Planning:
  Buffers: shared hit=1
Planning Time: 0.073 ms
Execution Time: 0.346 ms
```

### busca-multitermo

```text
Limit  (cost=1206.72..1206.75 rows=12 width=22) (actual time=19.793..19.795 rows=20 loops=1)
  Buffers: shared hit=5232 read=141
  ->  Sort  (cost=1206.72..1206.75 rows=12 width=22) (actual time=19.793..19.793 rows=20 loops=1)
        Sort Key: published_at DESC NULLS LAST, id
        Sort Method: top-N heapsort  Memory: 27kB
        Buffers: shared hit=5232 read=141
        ->  Bitmap Heap Scan on tenders  (cost=1159.11..1206.50 rows=12 width=22) (actual time=5.838..19.091 rows=5000 loops=1)
              Recheck Cond: ((search_text ~~ '%tecnologia%'::text) AND (search_text ~~ '%integracao%'::text) AND (search_text ~~ '%especializada%'::text))
              Heap Blocks: exact=5000
              Buffers: shared hit=5232 read=141
              ->  Bitmap Index Scan on tenders_search_text_trgm_idx  (cost=0.00..1159.10 rows=12 width=0) (actual time=5.404..5.405 rows=5000 loops=1)
                    Index Cond: ((search_text ~~ '%tecnologia%'::text) AND (search_text ~~ '%integracao%'::text) AND (search_text ~~ '%especializada%'::text))
                    Buffers: shared hit=232 read=141
Planning:
  Buffers: shared hit=1
Planning Time: 0.341 ms
Execution Time: 19.999 ms
Aggregate  (cost=1206.53..1206.54 rows=1 width=8) (actual time=14.096..14.097 rows=1 loops=1)
  Buffers: shared hit=5373
  ->  Bitmap Heap Scan on tenders  (cost=1159.11..1206.50 rows=12 width=0) (actual time=6.543..13.910 rows=5000 loops=1)
        Recheck Cond: ((search_text ~~ '%tecnologia%'::text) AND (search_text ~~ '%integracao%'::text) AND (search_text ~~ '%especializada%'::text))
        Heap Blocks: exact=5000
        Buffers: shared hit=5373
        ->  Bitmap Index Scan on tenders_search_text_trgm_idx  (cost=0.00..1159.10 rows=12 width=0) (actual time=5.914..5.914 rows=5000 loops=1)
              Index Cond: ((search_text ~~ '%tecnologia%'::text) AND (search_text ~~ '%integracao%'::text) AND (search_text ~~ '%especializada%'::text))
              Buffers: shared hit=373
Planning:
  Buffers: shared hit=1
Planning Time: 0.147 ms
Execution Time: 14.184 ms
```

### filtros

```text
Limit  (cost=894.57..894.60 rows=10 width=22) (actual time=8.855..8.857 rows=0 loops=1)
  Buffers: shared hit=102 read=37
  ->  Sort  (cost=894.57..894.60 rows=10 width=22) (actual time=8.853..8.855 rows=0 loops=1)
        Sort Key: published_at DESC NULLS LAST, id
        Sort Method: quicksort  Memory: 25kB
        Buffers: shared hit=102 read=37
        ->  Bitmap Heap Scan on tenders  (cost=846.95..894.41 rows=10 width=22) (actual time=8.843..8.844 rows=0 loops=1)
              Recheck Cond: ((state = 'SP'::text) AND (modality = 'pregao_eletronico'::text) AND (status = 'open'::text) AND (search_text ~~ '%tecnologia%'::text))
              Filter: (published_at >= '2025-01-01 03:00:00+00'::timestamp with time zone)
              Buffers: shared hit=102 read=37
              ->  BitmapAnd  (cost=846.95..846.95 rows=12 width=0) (actual time=8.831..8.832 rows=0 loops=1)
                    Buffers: shared hit=102 read=37
                    ->  Bitmap Index Scan on tenders_state_idx  (cost=0.00..112.42 rows=9617 width=0) (actual time=0.959..0.960 rows=9678 loops=1)
                          Index Cond: (state = 'SP'::text)
                          Buffers: shared read=9
                    ->  Bitmap Index Scan on tenders_modality_idx  (cost=0.00..141.04 rows=12367 width=0) (actual time=1.409..1.409 rows=12500 loops=1)
                          Index Cond: (modality = 'pregao_eletronico'::text)
                          Buffers: shared read=11
                    ->  Bitmap Index Scan on tenders_status_idx  (cost=0.00..222.99 rows=20093 width=0) (actual time=3.253..3.254 rows=20000 loops=1)
                          Index Cond: (status = 'open'::text)
                          Buffers: shared read=17
                    ->  Bitmap Index Scan on tenders_search_text_trgm_idx  (cost=0.00..369.74 rows=4997 width=0) (actual time=2.568..2.568 rows=5000 loops=1)
                          Index Cond: (search_text ~~ '%tecnologia%'::text)
                          Buffers: shared hit=102
Planning:
  Buffers: shared hit=9
Planning Time: 0.411 ms
Execution Time: 8.902 ms
Aggregate  (cost=894.43..894.44 rows=1 width=8) (actual time=6.268..6.271 rows=1 loops=1)
  Buffers: shared hit=139
  ->  Bitmap Heap Scan on tenders  (cost=846.95..894.41 rows=10 width=0) (actual time=6.264..6.267 rows=0 loops=1)
        Recheck Cond: ((state = 'SP'::text) AND (modality = 'pregao_eletronico'::text) AND (status = 'open'::text) AND (search_text ~~ '%tecnologia%'::text))
        Filter: (published_at >= '2025-01-01 03:00:00+00'::timestamp with time zone)
        Buffers: shared hit=139
        ->  BitmapAnd  (cost=846.95..846.95 rows=12 width=0) (actual time=6.251..6.253 rows=0 loops=1)
              Buffers: shared hit=139
              ->  Bitmap Index Scan on tenders_state_idx  (cost=0.00..112.42 rows=9617 width=0) (actual time=0.533..0.533 rows=9678 loops=1)
                    Index Cond: (state = 'SP'::text)
                    Buffers: shared hit=9
              ->  Bitmap Index Scan on tenders_modality_idx  (cost=0.00..141.04 rows=12367 width=0) (actual time=0.938..0.938 rows=12500 loops=1)
                    Index Cond: (modality = 'pregao_eletronico'::text)
                    Buffers: shared hit=11
              ->  Bitmap Index Scan on tenders_status_idx  (cost=0.00..222.99 rows=20093 width=0) (actual time=2.014..2.014 rows=20000 loops=1)
                    Index Cond: (status = 'open'::text)
                    Buffers: shared hit=17
              ->  Bitmap Index Scan on tenders_search_text_trgm_idx  (cost=0.00..369.74 rows=4997 width=0) (actual time=2.395..2.395 rows=5000 loops=1)
                    Index Cond: (search_text ~~ '%tecnologia%'::text)
                    Buffers: shared hit=102
Planning:
  Buffers: shared hit=1
Planning Time: 0.169 ms
Execution Time: 6.559 ms
```

### pagina-profunda

```text
Limit  (cost=26820.01..26822.35 rows=20 width=22) (actual time=58.157..59.823 rows=20 loops=1)
  Buffers: shared hit=15879 read=7545
  ->  Gather Merge  (cost=26238.97..31100.34 rows=41666 width=22) (actual time=56.692..59.717 rows=5000 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=15879 read=7545
        ->  Sort  (cost=25238.95..25291.03 rows=20833 width=22) (actual time=55.061..55.165 rows=2383 loops=3)
              Sort Key: published_at DESC NULLS LAST, id
              Sort Method: top-N heapsort  Memory: 980kB
              Buffers: shared hit=15879 read=7545
              Worker 0:  Sort Method: top-N heapsort  Memory: 986kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 971kB
              ->  Parallel Seq Scan on tenders  (cost=0.00..23854.83 rows=20833 width=22) (actual time=0.021..47.998 rows=16667 loops=3)
                    Filter: (search_text ~~ '%contratacao%'::text)
                    Rows Removed by Filter: 16667
                    Buffers: shared hit=15789 read=7545
Planning:
  Buffers: shared hit=1
Planning Time: 0.076 ms
Execution Time: 59.837 ms
Aggregate  (cost=24709.00..24709.01 rows=1 width=8) (actual time=74.202..74.202 rows=1 loops=1)
  Buffers: shared hit=15853 read=7481
  ->  Seq Scan on tenders  (cost=0.00..24584.00 rows=50000 width=0) (actual time=0.004..72.804 rows=50000 loops=1)
        Filter: (search_text ~~ '%contratacao%'::text)
        Rows Removed by Filter: 50000
        Buffers: shared hit=15853 read=7481
Planning:
  Buffers: shared hit=1
Planning Time: 0.086 ms
Execution Time: 74.215 ms
```
