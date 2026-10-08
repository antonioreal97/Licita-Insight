# Benchmark — filtros inteligentes do perfil (2026-10-08)

Ambiente: macOS, PostgreSQL 16 em contêiner Docker local, Node.js 24, uma única instância da API. O banco foi criado do zero e recebeu todas as migrations até `0030_profile_smart_filters`.

## Carga

- 100.000 editais sintéticos abertos, com prazo futuro;
- cinco famílias de textos (eventos/sonorização, iluminação cênica, saúde, limpeza e TI);
- títulos, objetos, itens e categorias preenchidos;
- job real `rebuildProfileKeywordVocabulary`, com duas leituras paginadas do PostgreSQL, extração de uni/bi/trigramas, coocorrência e troca transacional da tabela;
- 500 chamadas reais de `suggestProfileKeywords` alternando `som`, `iluminacao`, `painel de led`, `servid` e `limpeza`.

Comando (recusa banco remoto e exige banco local vazio):

```sh
DATABASE_URL=postgresql://... PROFILE_KEYWORD_BENCHMARK=1 \
  PROFILE_KEYWORD_BENCHMARK_TENDERS=100000 \
  pnpm --filter @workspace/api-server run profile-keywords:benchmark
```

## Resultado observado

| Medida                   | Resultado |
| ------------------------ | --------: |
| Seed dos 100 mil editais |  3.360 ms |
| Job diário completo      |  5.270 ms |
| Editais processados      |   100.000 |
| Termos materializados    |       103 |
| Suggest p50              |   0,43 ms |
| Suggest p95              |   0,57 ms |
| Suggest p99              |   1,06 ms |
| Amostras de suggest      |       500 |

O p95 ficou bem abaixo da meta de 50 ms. A cardinalidade de vocabulário (103) é deliberadamente baixa porque os 100 mil registros repetem cinco famílias para tornar a execução reproduzível; o limite de produção é 15 mil termos. A extensão `pg_trgm` já existia no baseline e o plano com `enable_seqscan=off` confirmou o índice GIN `profile_keyword_vocabulary_trgm_idx`; com uma tabela sintética tão pequena, o planner normal prefere corretamente uma leitura sequencial submilissegundo. A inspeção do resultado também confirmou os relacionados esperados para `som`: `caixa de som`, `mesa de som`, `sonorização`, `áudio`, `caixa` e `eventos`.
