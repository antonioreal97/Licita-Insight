# Desempenho das facetas da busca — 09/10/2026

## Problema

`GET /api/v1/tenders/search?q=medicamentos` levou aproximadamente 7,7 s em produção. O índice trigram de `search_text` estava sendo usado, mas a mesma seleção textual era refeita pela contagem principal e por cada bucket/total de faceta. As facetas eram disparadas em paralelo; com mais consultas que o pool de 10 conexões, isso amplificava leitura de heap e contenção de I/O.

## Diagnóstico em produção

Foram executadas somente três consultas `EXPLAIN (ANALYZE, BUFFERS)`, às 08:18 BRT, fora da janela de coleta. Nenhuma consulta de dados, escrita, alteração de índice, `VACUUM` ou configuração foi executada.

| Consulta | Linhas correspondentes | Tempo | Evidência principal |
| --- | ---: | ---: | --- |
| `count(*)` | 11.458 | 232,194 ms | bitmap heap scan; 10.203 heap blocks; 35.105 buffers |
| facet `status` | 11.458 | 229,176 ms | repete o mesmo bitmap heap scan e os mesmos 10.203 heap blocks |
| facet `category` | 11.458 | 143,111 ms | bitmap heap scan paralelo + lateral de JSON; 35.964 buffers |

O plano confirma que `tenders_search_text_trgm_idx` funciona. O gargalo é repetir a materialização do mesmo conjunto aproximadamente 18 vezes, não a ausência de índice.

## Correção

Para buscas textuais com `facets=true` e sem filtros de grupos disjuntivos selecionados:

1. Um CTE `matched AS MATERIALIZED` lê uma vez apenas as colunas necessárias às facetas.
2. Uma única consulta agrega status, modalidade, UF, fonte, município, órgão, categoria, plataforma, valores e novos.
3. O total exato do CTE também alimenta a paginação, eliminando o `count(*)` separado.
4. A página de resultados, as facetas combinadas e `indexUpdatedAt` são carregados em paralelo.

As contagens continuam exatas; não há amostragem nem aproximação. A lista e ordenação dos editais não mudaram. Buscas sem termo, com `facets=false` ou com qualquer filtro disjuntivo (`status`, modalidade, UF, município, órgão, fonte, categoria, plataforma, faixa de valor ou `newOnly`) mantêm o caminho anterior, preservando a regra de ignorar o próprio grupo.

Não há migração nem índice novo. Portanto, o deploy não exige aplicação manual e não bloqueia `tenders`.

## Benchmark sintético

Postgres 16 temporário, isolado, com 80.000 editais sintéticos e 20.000 correspondências para `medicamentos`. Duas rodadas de aquecimento e oito amostras; processo de teste com `nice -n 19 ionice -c3`.

| Implementação | Amostras (ms) | p95 |
| --- | --- | ---: |
| Legada | 365,5; 398,6; 420,1; 422,4; 411,9; 533,4; 524,6; 434,8 | 533,4 ms |
| Combinada | 227,6; 261,4; 261,1; 255,3; 276,0; 238,2; 257,2; 252,7 | 276,0 ms |

Redução de 48,3% no p95 sintético. O teste de integração confirma que total, itens, buckets, totais dos grupos, faixa/histograma e `newCount` permanecem exatos.

## Validação

- `pnpm install --frozen-lockfile`: passou com Node 24.
- `pnpm run typecheck`: passou.
- Teste novo `search-facets.integration.test.ts`: passou contra Postgres temporário.
- Suíte completa da API: 404/408 contadores passaram. Três casos alheios à mudança falharam no `main`: dois schemas isolados de IA não criam as tabelas novas de cupons; o cenário concorrente de calendário nacional PNCP divergiu nas UFs (o runner contabiliza também a suíte-pai, totalizando quatro falhas). O teste novo passou também dentro da suíte completa.
- A medir após deploy: p95 real do endpoint em produção. Pelas regras desta tarefa, não foi feito deploy nem chamada de benchmark contra a API de produção; as únicas medições lá foram os três `EXPLAIN` acima.
