# Carga before-300k-rara

- Linhas: 300.000
- Duração por amostra: 10s
- Máquina: darwin 25.5.0 arm64, 10 CPUs, 17179869184 bytes de RAM
- PostgreSQL: 16.15 (Debian 16.15-1.pgdg13+2); effective_cache_size=5242888kB, max_connections=100, random_page_cost=4, shared_buffers=163848kB, work_mem=4096kB
- Pico RSS: 411877376 bytes
- Event loop lag p95/máx.: 21.381119/24.100863 ms

| Cenário | Conc. | RPS | p50 ms | p95 ms | p99 ms | erros | não-2xx |
|---|---:|---:|---:|---:|---:|---:|---:|
| busca-rara | 10 | 7.7 | 1022 | 2087.220417 | 2316 | 0 | 0 |
| busca-rara | 50 | 5 | 5700 | 8348.791 | 8689 | 0 | 0 |
| busca-rara | 100 | 0 | 0 | 0 | 0 | 0 | 0 |

## EXPLAIN (ANALYZE, BUFFERS)

### busca-rara

```text
Limit  (cost=72564.77..72567.11 rows=20 width=22) (actual time=104.154..105.371 rows=20 loops=1)
  Buffers: shared hit=14073 read=56018 written=25
  ->  Gather Merge  (cost=72564.77..72589.97 rows=216 width=22) (actual time=104.153..105.367 rows=20 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=14073 read=56018 written=25
        ->  Sort  (cost=71564.75..71565.02 rows=108 width=22) (actual time=103.099..103.100 rows=17 loops=3)
              Sort Key: published_at DESC NULLS LAST, id
              Sort Method: top-N heapsort  Memory: 27kB
              Buffers: shared hit=14073 read=56018 written=25
              Worker 0:  Sort Method: top-N heapsort  Memory: 27kB
              Worker 1:  Sort Method: top-N heapsort  Memory: 27kB
              ->  Parallel Seq Scan on tenders  (cost=0.00..71561.88 rows=108 width=22) (actual time=0.990..102.994 rows=100 loops=3)
                    Filter: (search_text ~~ '%ultrassom%'::text)
                    Rows Removed by Filter: 99900
                    Buffers: shared hit=13983 read=56018 written=25
Planning:
  Buffers: shared hit=40 read=4
Planning Time: 0.184 ms
Execution Time: 105.386 ms
Finalize Aggregate  (cost=72562.36..72562.37 rows=1 width=8) (actual time=100.255..101.991 rows=1 loops=1)
  Buffers: shared hit=14030 read=55971 written=59
  ->  Gather  (cost=72562.15..72562.35 rows=2 width=8) (actual time=100.191..101.986 rows=3 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=14030 read=55971 written=59
        ->  Partial Aggregate  (cost=71562.15..71562.15 rows=1 width=8) (actual time=98.821..98.822 rows=1 loops=3)
              Buffers: shared hit=14030 read=55971 written=59
              ->  Parallel Seq Scan on tenders  (cost=0.00..71561.88 rows=108 width=0) (actual time=1.109..98.785 rows=100 loops=3)
                    Filter: (search_text ~~ '%ultrassom%'::text)
                    Rows Removed by Filter: 99900
                    Buffers: shared hit=14030 read=55971 written=59
Planning Time: 0.126 ms
Execution Time: 102.013 ms
```
