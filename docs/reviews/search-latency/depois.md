# Busca de editais — depois

Data: 15/10/2026. Diagnóstico inicial em [`antes.md`](antes.md); parecer sobre motor de busca em [`motor-de-busca.md`](motor-de-busca.md); procedimento dos índices em [`docs/migrations/0044-search-latency-indexes.md`](../../migrations/0044-search-latency-indexes.md).

## Resumo

Com o mesmo banco sintético, todas as 15 consultas ficam abaixo de 500 ms no p95 dentro do servidor (meta), e as buscas que a interface faz (com `status=open`, padrão "Abertos") ficam entre 12 e 134 ms com facetas. A única acima de 500 ms é a busca sem filtro nenhum sobre todo o histórico (~500 ms a 300 mil editais), que a interface não faz por padrão. As respostas (página, total e todas as facetas) são idênticas às da `main` nas 15 consultas.

## Ambiente

- PostgreSQL 16 (`pgvector/pgvector:pg16`) em container próprio com 1 GB de memória (`shared_buffers` 128 MB, `work_mem` 4 MB, padrão), Mac de 16 GB dividido com outros processos.
- Banco sintético gerado por `artifacts/api-server/scripts/scale-seed.ts`: 300 mil editais, 27 mil abertos (produção: ~26 mil abertos e histórico de 1,5–2 milhões). O histórico completo não coube junto com os demais containers da máquina; a extrapolação está abaixo.
- Medição: `artifacts/api-server/scripts/bench-search.ts` chama `PostgresTenderRepository.search()` (o mesmo caminho da rota) com `pageSize=20` e facetas. "1ª vez" é a primeira chamada logo após reiniciar o Postgres (buffers do Postgres frios; o cache de páginas do sistema continua quente). p50/p95 sobre as chamadas seguintes (6 no antes, 8 no depois; com tão poucas amostras o p95 é praticamente o máximo). "Sem facetas" é a mesma busca com `facets=false` (página + total).
- O "antes" foi medido de novo nas mesmas condições, com o repositório da `main` (`f65913f`) e o banco sem os índices novos.

## Tabela comparativa (ms)

| Consulta | Resultados | Antes 1ª | Antes p50 | Antes p95 | Depois 1ª | Depois p50 | Depois p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `q=limpeza` | 25.000 | 2.578 | 162 | 225 | 654 | 148 | 183 |
| `state=BA` | 9.677 | 668 | 481 | 565 | 59 | 33 | 45 |
| `q=merenda escolar&state=SP` | 2.419 | 517 | 396 | 474 | 114 | 92 | 163 |
| (sem filtros, todos os status) | 300.000 | 695 | 591 | 672 | 581 | 501 | 560 |
| `q=asfalto` | 25.000 | 202 | 167 | 194 | 166 | 149 | 207 |
| `q=pavimentacao&state=MG` | 1.613 | 482 | 388 | 431 | 176 | 84 | 116 |
| `status=open` (abertura da busca) | 27.000 | 125 | 80 | 86 | 65 | 43 | 55 |
| `status=open&q=limpeza` | 2.250 | 158 | 99 | 110 | 74 | 76 | 79 |
| `status=open&state=SP` | 2.613 | 158 | 110 | 130 | 16 | 15 | 17 |
| `status=open&modality=pregao_eletronico` | 3.375 | 117 | 119 | 124 | 20 | 19 | 22 |
| `status=open&category=limpeza-higiene` | 2.250 | 558 | 413 | 483 | 84 | 87 | 134 |
| `status=open&q=merenda&state=SP` | 218 | 238 | 108 | 155 | 23 | 12 | 15 |
| `status=open&sort=deadline_asc` | 27.000 | 328 | 291 | 391 | 55 | 46 | 65 |
| `status=open&sort=value_desc` | 27.000 | 159 | 117 | 137 | 82 | 83 | 88 |
| `status=open&platform=comprasgov` | 4.500 | 218 | 150 | 201 | 24 | 23 | 48 |

Sem facetas (página + total), o p50 depois fica em 1–17 ms em todas as consultas com `status=open`, exceto `sort=value_desc` (50 ms: a ordem "valores suspeitos por último" não tem índice e ordena os 27 mil abertos).

## O que mudou

Código (`artifacts/api-server/src/repositories/postgres-tender-repository.ts`):

1. **Filtro de categoria com `@>`.** O filtro era `exists (select … from jsonb_array_elements(categories) …)`, que o índice GIN `jsonb_path_ops` existente não atende: cada consulta com categoria (e a faceta de status, que ignora o filtro de status) percorria a tabela inteira chamando a função para cada linha. Agora é `categories @> '[{"slug": …}]'` (um `or` por categoria), que usa o GIN. Mesmo resultado: as duas formas casam um elemento do array com aquele `slug`.
2. **Facetas: uma consulta por grupo selecionado, e não por grupo.** Na contagem disjuntiva, só um grupo com seleção (ex.: status, quando `status=open`) precisa contar o conjunto sem o próprio filtro. Os grupos sem seleção contam exatamente o conjunto filtrado, e o total deles é o total da busca. Antes, toda busca com algum filtro disparava 20 consultas (8 de facetas, 7 `count` por grupo, valores, novos, total, página e data de atualização) num pool de 10 conexões; agora:
   - com texto: uma consulta materializa o conjunto filtrado uma vez e devolve total e todas as facetas dos grupos sem seleção (o caminho combinado que já existia, antes restrito a texto sem nenhum filtro), mais uma consulta de facetas e uma de `count` por grupo selecionado;
   - sem texto: uma agregação por grupo, como antes, mas sem os `count` repetidos dos grupos sem seleção. Sem texto, encontrar o conjunto é barato e as agregações separadas em paralelo saíram mais rápidas do que materializá-lo (sem filtros: 1.445 ms materializando contra 501 ms separadas).
3. **Página, total e facetas em paralelo.** Antes o `count` rodava, depois a página, e só então as facetas.

Índices (migração `0044`, ver [`docs/migrations/0044-search-latency-indexes.md`](../../migrations/0044-search-latency-indexes.md)): `tenders_open_published_at_idx` e `tenders_open_deadline_idx` (parciais, abertos), `tenders_upper_state_status_idx`, `tenders_modality_status_idx` e `tenders_platform_status_idx`.

Avaliados e descartados (sem ganho medido além do ruído, e cada índice custa escrita na coleta): `(upper(state), published_at) where open`, `(modality, published_at) where open` e trigrama parcial de `search_text` só dos abertos. Com `status=open` + texto, o plano já combina `tenders_status_idx` e o trigrama geral (`BitmapAnd`) e só lê do heap os abertos que casam (2.250 blocos para `limpeza`, 60 ms a frio).

Não mudou: contrato da API (contagens continuam exatas, `totalIsEstimate` continua `false`), frontend e cache. O frontend já faz uma requisição por busca (React Query, `staleTime` de 30 s; as sondas de relaxamento só disparam com resultado vazio), e a rota já responde com `Cache-Control: public, max-age=30, stale-while-revalidate=120` para quem não tem sessão. Um cache em memória das facetas não foi necessário para a meta; ele traria facetas defasadas logo após a coleta e mais código para invalidar.

## Planos que explicam os ganhos

Página dos abertos por prazo (antes: o plano andava pelo índice de prazo de todo o histórico e descartava 273 mil linhas fechadas):

```
Limit (actual time=0.058..0.060 rows=20 loops=1)
  Buffers: shared hit=3
  ->  Index Only Scan using tenders_open_deadline_idx on tenders (rows=20)
Execution Time: 0.099 ms
```

Página padrão dos abertos (antes: bitmap dos 27 mil abertos e ordenação, ~56 ms):

```
Limit (actual time=0.030..0.032 rows=20 loops=1)
  ->  Index Only Scan using tenders_open_published_at_idx on tenders (rows=20)
Execution Time: 0.038 ms
```

Faceta de status com UF (com só `(upper(state), status)`, o PostgreSQL não faz leitura só do índice de expressão e ia ao heap: 181 ms e 11 mil blocos lidos):

```
GroupAggregate (actual time=0.246..2.371 rows=5 loops=1)
  Buffers: shared hit=12 read=28
  ->  Index Only Scan using tenders_upper_state_status_idx on tenders (rows=29031)
        Index Cond: ((upper(state)) = 'SP'::text)
        Heap Fetches: 0
Execution Time: 2.394 ms
```

Faceta de status com modalidade, a frio: 482 ms e 37.532 blocos de heap pelo `tenders_modality_idx`; com `tenders_modality_status_idx`, `Index Only Scan`, `Heap Fetches: 0`, 41 blocos e 4 ms, também a frio (a de plataforma, com `tenders_platform_status_idx`, fica igual: 4 ms, 52 blocos).

Faceta de status com categoria (antes: varredura sequencial com `jsonb_array_elements` em 300 mil linhas, ~530 ms):

```
HashAggregate (actual time=159.673..159.674 rows=3 loops=1)
  ->  Bitmap Heap Scan on tenders (rows=25000)
        Recheck Cond: (categories @> '[{"slug": "limpeza-higiene"}]'::jsonb)
        ->  Bitmap Index Scan on tenders_categories_gin_idx (rows=25000)
Execution Time: 159.879 ms   (a frio; morno ~20 ms)
```

## Equivalência

`bench-search.ts --compare <repositório da main>` executa as 15 consultas nas duas versões e compara página (`data`), `pagination` e `facets` com igualdade estrita: "Same page, total and facets in all 15 cases" em todas as rodadas (sem índices novos, com os sete candidatos e com os cinco finais). O teste de integração `search-facets.integration.test.ts` passou a cobrir também texto com status + UF selecionados e busca sem texto com status + categoria (contagens disjuntivas e `groupTotals`).

Para repetir:

```zsh
git show f65913f:artifacts/api-server/src/repositories/postgres-tender-repository.ts \
  > artifacts/api-server/src/repositories/baseline-tender-repository.ts
cd artifacts/api-server
DATABASE_URL=postgres://…/licita_scale pnpm exec tsx scripts/bench-search.ts --compare src/repositories/baseline-tender-repository.ts
rm src/repositories/baseline-tender-repository.ts
```

## Extrapolação para produção

- Buscas com `status=open` (todas as da interface por padrão): o conjunto de abertos do banco sintético tem o tamanho do de produção, então página, `count` e facetas sobre ele devem se repetir. O que cresce com o histórico é a faceta de status (que ignora o filtro de status): com UF, modalidade e plataforma ela agora é lida só de índices pequenos (~2 MB a cada 300 mil editais); sem outro filtro, vem do `tenders_status_idx` (18 ms a 300 mil, ~120 ms estimados a 2 milhões). Com categoria, ainda vai ao heap dos editais daquela categoria em todo o histórico: ~20 ms morno e ~160 ms a frio aqui, possivelmente ~1 s a frio com 2 milhões. É o ponto a observar nos números de produção.
- Buscas sem `status` (todo o histórico): escalam com o histórico. Sem filtro nenhum, ~500 ms a 300 mil sugerem 3–4 s com 2 milhões (as facetas de órgão e município percorrem o heap todo; a de órgão sozinha leva ~420 ms a 300 mil). Texto sem status: ~150 ms a 300 mil, ~1 s estimado. A interface só faz essas buscas se a pessoa remover o filtro "Abertos"; quem não tem sessão recebe a resposta do cache HTTP público por 30 s (+120 s `stale-while-revalidate`).

## Para medir em produção (somente leitura)

Rodar antes de criar os índices e de novo depois do deploy, e colar a saída no PR.

1. Tempo da API sem rede (como na medição de 15/10), dentro do container da API:

   ```zsh
   for q in 'status=open&pageSize=20' 'status=open&q=limpeza&pageSize=20' 'status=open&state=BA&pageSize=20' 'status=open&category=limpeza-higiene&pageSize=20' 'status=open&sort=deadline_asc&pageSize=20' 'q=limpeza&pageSize=20'; do
     curl -s -o /dev/null -w "%{time_total}s $q\n" "http://localhost:3001/api/v1/tenders/search?$q"
   done
   ```

2. `pg_stat_statements` (precisa de `shared_preload_libraries`, ou seja, reiniciar o Postgres; alguns segundos fora do ar):

   ```sql
   show shared_preload_libraries;  -- se já contiver pg_stat_statements, pular para o create extension
   ```

   Se não contiver, no serviço `postgres` do compose do servidor acrescentar `command: postgres -c shared_preload_libraries=pg_stat_statements -c pg_stat_statements.track=top`, recriar só esse serviço e então:

   ```sql
   create extension if not exists pg_stat_statements;
   select pg_stat_statements_reset();
   -- depois de algumas horas de uso real:
   select calls, round(mean_exec_time::numeric, 1) as mean_ms, round(max_exec_time::numeric, 1) as max_ms,
          round(total_exec_time::numeric) as total_ms, left(regexp_replace(query, '\s+', ' ', 'g'), 160) as query
   from pg_stat_statements
   where query ilike '%"tenders"%'
   order by total_exec_time desc
   limit 20;
   ```

3. Planos das consultas reais (cada `EXPLAIN ANALYZE` executa a consulta, que é só leitura):

   ```sql
   -- página padrão dos abertos
   explain (analyze, buffers) select * from tenders where status in ('open')
     order by published_at desc nulls last, id asc limit 20;
   -- abertos por prazo
   explain (analyze, buffers) select * from tenders where status in ('open')
     order by proposal_deadline asc nulls last, id asc limit 20;
   -- faceta de status com UF (ignora o filtro de status)
   explain (analyze, buffers) select status, count(*)::int from tenders
     where upper(state) in ('BA') group by status order by count(*) desc, status asc;
   -- faceta de status com categoria
   explain (analyze, buffers) select status, count(*)::int from tenders
     where (categories @> '[{"slug":"limpeza-higiene"}]'::jsonb) group by status order by count(*) desc, status asc;
   ```

   Esperado depois dos índices: `Index Only Scan using tenders_open_published_at_idx`, `… tenders_open_deadline_idx` e `… tenders_upper_state_status_idx` com `Heap Fetches` perto de zero (se vier alto, o mapa de visibilidade está desatualizado e um `vacuum (analyze) tenders` resolve), e `Bitmap Index Scan on tenders_categories_gin_idx` na última.
