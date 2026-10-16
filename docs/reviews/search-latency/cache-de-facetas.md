# Busca padrão — cache de facetas sem texto

Data: 16/10/2026. Continuação de [`depois.md`](depois.md), após a medição em produção mostrar que a lista leva cerca de 7 ms, mas as facetas exatas ainda mantêm `status=open` em 1,9–2,1 s sob carga.

## Decisão

As facetas e o total exato de buscas públicas sem texto ficam em um cache LRU em memória, por critérios normalizados. A chave inclui todos os filtros que mudam contagens e exclui paginação e ordenação; assim, `status=open`, `status=open&sort=deadline_asc` e outras páginas da mesma busca compartilham a entrada. Buscas com texto, snapshots de notificação e a região particular de uma empresa não entram no cache.

- 256 chaves no máximo, com descarte da menos usada;
- valor fresco por 90 segundos;
- entre 90 e 120 segundos, a resposta anterior é servida enquanto um único recarregamento acontece em segundo plano;
- após 120 segundos, a chamada espera o PostgreSQL; falha de recarga não prolonga o valor vencido;
- chamadas concorrentes para uma chave vazia compartilham a mesma carga;
- cada lote gravado pela coleta PNCP invalida todas as chaves; ao fim da coleta, `status=open` é pré-aquecido quando o processo também serve a API;
- a inicialização da API pré-aquece `status=open` antes de abrir a porta HTTP.

Portanto, uma contagem pode ficar defasada por no máximo 120 segundos no fluxo normal. A invalidação da coleta derruba esse limite: depois que o lote termina, a entrada padrão é refeita antes da próxima resposta HTTP. Não há estimativa: `totalIsEstimate` continua `false`, e toda carga do cache vem das mesmas consultas exatas usadas antes.

Não foi criada migração. A coluna/tabela auxiliar para categorias reduziria o custo de uma carga fria, mas não removeria as outras varreduras apontadas em produção (status, total, modalidade, UF, cidade, órgão, plataforma e valores); o cache medido ataca todas de uma vez e mantém o contrato.

## Medição sintética

PostgreSQL 16 em container limitado a 768 MB e quatro CPUs. O gerador recebeu a distribuição observada em produção: 193.120 linhas, sendo 24.852 `open`, 93.109 `direct`, 73.261 `under_review`, 1.060 `suspended` e 838 `cancelled`. Cinco iterações por caso; p50/p95 ignoram a primeira carga.

| Consulta                                 | Antes p50 | Depois p50 | Depois p95 | Sob carga p50 | Sob carga p95 |
| ---------------------------------------- | --------: | ---------: | ---------: | ------------: | ------------: |
| `status=open`                            |     61 ms |       1 ms |       1 ms |          1 ms |          2 ms |
| `status=open&state=SP`                   |     14 ms |       1 ms |       2 ms |          1 ms |          2 ms |
| `status=open&modality=pregao_eletronico` |     15 ms |       2 ms |       2 ms |          2 ms |          3 ms |
| `status=open&category=limpeza-higiene`   |     24 ms |       1 ms |       1 ms |          2 ms |          3 ms |
| `status=open&platform=comprasgov`        |    519 ms |       1 ms |       2 ms |          2 ms |          3 ms |

Na rodada sob carga, um cliente do `pgbench` repetiu a expansão e agrupamento JSONB de categorias sobre as 193 mil linhas (17,35 consultas/s, latência média 57,6 ms) enquanto o benchmark rodava. A primeira carga de `status=open` ainda ficou em 201 ms nesse ambiente; as seguintes ficaram em 1–2 ms. O benchmark comparou página, paginação e todas as facetas antes e depois de limpar o cache nos 15 cenários e encontrou resultados idênticos.

Reprodução local:

```zsh
docker run -d --name perf-default-search-facets-pg --memory=768m --cpus=4 \
  -e POSTGRES_USER=licita -e POSTGRES_PASSWORD=licita -e POSTGRES_DB=postgres \
  -p 127.0.0.1:55439:5432 postgres:16-alpine \
  -c shared_buffers=192MB -c max_connections=50

SCALE_ADMIN_DATABASE_URL=postgres://licita:licita@localhost:55439/postgres \
  pnpm --filter @workspace/api-server exec tsx scripts/scale-seed.ts \
  --rows 193120 --open-count 24852 --direct-count 93109 \
  --under-review-count 73261 --suspended-count 1060 --cancelled-count 838

DATABASE_URL=postgres://licita:licita@localhost:55439/licita_scale \
  pnpm --filter @workspace/api-server exec tsx scripts/bench-search.ts \
  --iterations 5 --verify-cache
```

## Conferência em produção depois do deploy (somente leitura)

O primeiro comando confirma o pré-aquecimento no log. O segundo faz apenas `GET`: a primeira resposta confirma a chave pronta e as seguintes medem a janela quente. Ajustar apenas o nome do container se o Compose o tiver alterado.

```zsh
docker logs --since 10m licita-macbook-api-1 2>&1 \
  | grep 'Default tender facets warmed' | tail -5

for query in \
  'status=open&pageSize=20' \
  'status=open&state=SP&pageSize=20' \
  'status=open&modality=pregao_eletronico&pageSize=20'; do
  for run in {1..6}; do
    docker exec licita-macbook-api-1 curl -fsS -o /dev/null \
      -w "$query run=$run http=%{http_code} total=%{time_total}s\n" \
      "http://127.0.0.1:3001/api/v1/tenders/search?$query"
  done
done
```

Para observar que as recargas não voltaram a manter várias agregações simultâneas, esta consulta apenas lê `pg_stat_activity`:

```zsh
docker exec licita-macbook-postgres-1 psql -U licita -d licita -x -c \
  "select pid, now() - query_start as age, wait_event_type, wait_event, left(query, 180) as query from pg_stat_activity where datname = current_database() and state = 'active' and query not ilike '%pg_stat_activity%' order by query_start"
```
