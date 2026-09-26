# Carga after-300k-rara

- Linhas: 300.000
- Duração por amostra: 10s
- Máquina: darwin 25.5.0 arm64, 10 CPUs, 17179869184 bytes de RAM
- PostgreSQL: 16.15 (Debian 16.15-1.pgdg13+2); effective_cache_size=5242888kB, max_connections=100, random_page_cost=4, shared_buffers=163848kB, work_mem=4096kB
- Pico RSS: 498466816 bytes
- Event loop lag p95/máx.: 23.691263/31.457279 ms

| Cenário | Conc. | RPS | p50 ms | p95 ms | p99 ms | erros | não-2xx |
|---|---:|---:|---:|---:|---:|---:|---:|
| busca-rara | 10 | 648.21 | 14 | 23.048292 | 27 | 0 | 0 |
| busca-rara | 50 | 675 | 73 | 89.608 | 101 | 0 | 0 |
| busca-rara | 100 | 670 | 147 | 165.780292 | 178 | 0 | 0 |

## EXPLAIN (ANALYZE, BUFFERS)

### busca-rara

```text
Limit  (cost=1719.10..1719.15 rows=20 width=22) (actual time=4.475..4.478 rows=20 loops=1)
  Buffers: shared hit=214 read=264
  ->  Sort  (cost=1719.10..1719.73 rows=250 width=22) (actual time=4.474..4.475 rows=20 loops=1)
        Sort Key: published_at DESC NULLS LAST, id
        Sort Method: top-N heapsort  Memory: 27kB
        Buffers: shared hit=214 read=264
        ->  Bitmap Heap Scan on tenders  (cost=754.14..1712.45 rows=250 width=22) (actual time=1.138..4.377 rows=300 loops=1)
              Recheck Cond: (search_text ~~ '%ultrassom%'::text)
              Heap Blocks: exact=300
              Buffers: shared hit=211 read=264
              ->  Bitmap Index Scan on tenders_search_text_trgm_idx  (cost=0.00..754.08 rows=250 width=0) (actual time=1.107..1.107 rows=300 loops=1)
                    Index Cond: (search_text ~~ '%ultrassom%'::text)
                    Buffers: shared hit=175
Planning:
  Buffers: shared hit=59
Planning Time: 0.453 ms
Execution Time: 4.501 ms
Aggregate  (cost=1713.07..1713.08 rows=1 width=8) (actual time=1.027..1.027 rows=1 loops=1)
  Buffers: shared hit=475
  ->  Bitmap Heap Scan on tenders  (cost=754.14..1712.45 rows=250 width=0) (actual time=0.814..1.017 rows=300 loops=1)
        Recheck Cond: (search_text ~~ '%ultrassom%'::text)
        Heap Blocks: exact=300
        Buffers: shared hit=475
        ->  Bitmap Index Scan on tenders_search_text_trgm_idx  (cost=0.00..754.08 rows=250 width=0) (actual time=0.792..0.792 rows=300 loops=1)
              Index Cond: (search_text ~~ '%ultrassom%'::text)
              Buffers: shared hit=175
Planning:
  Buffers: shared hit=1
Planning Time: 0.096 ms
Execution Time: 1.038 ms
```
