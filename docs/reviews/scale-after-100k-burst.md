# Carga after-100k-burst

- Linhas: 100.000
- Duração por amostra: 10s
- Máquina: darwin 25.5.0 arm64, 10 CPUs, 17179869184 bytes de RAM
- PostgreSQL: 16.15 (Debian 16.15-1.pgdg13+2); effective_cache_size=5242888kB, max_connections=100, random_page_cost=4, shared_buffers=163848kB, work_mem=4096kB
- Pico RSS: 718815232 bytes
- Event loop lag p95/máx.: 39.714815/69.402623 ms

| Cenário | Conc. | RPS | p50 ms | p95 ms | p99 ms | erros | não-2xx |
|---|---:|---:|---:|---:|---:|---:|---:|
| rajada-cliente-a | 500 | 15549.2 | 27 | 40.487667 | 58 | 0 | 155032 |
| cliente-b-durante-rajada | 10 | 32.21 | 229 | 282.937708 | 2724 | 0 | 0 |

## EXPLAIN (ANALYZE, BUFFERS)

Nenhum plano coletado nesta rodada.
