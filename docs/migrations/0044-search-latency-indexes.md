# 0044 — Índices da busca de editais

Migração aditiva em `tenders`: cinco índices btree, nenhuma coluna nem linha muda. Motivo e medições em [`docs/reviews/search-latency/depois.md`](../reviews/search-latency/depois.md).

| Índice | Serve |
| --- | --- |
| `tenders_open_published_at_idx` (parcial, abertos) | 1ª página dos abertos na ordem padrão (mais recentes), sem ordenar os ~26 mil abertos |
| `tenders_open_deadline_idx` (parcial, abertos) | 1ª página dos abertos por prazo; antes o plano lia o histórico inteiro pelo índice de prazo |
| `tenders_upper_state_status_idx` | Faceta de status com filtro de UF, lida só do índice (o `state` no fim é o que permite isso num índice de expressão) |
| `tenders_modality_status_idx` | Faceta de status com filtro de modalidade, lida só do índice |
| `tenders_platform_status_idx` | Faceta de status com filtro de plataforma, lida só do índice |

> **Numeração:** a branch `feat/workspaces-phase-1` também usa `0044`/`0045`. Esta migração entra antes; ao sincronizar com a `main`, a Fase 1 será renumerada para `0045`/`0046`.

## Produção (aplicação manual pelo dono)

Produção **nunca** roda `migrate`. Aqui o `aplicar-migracao.sh` **não** serve: ele aplica o arquivo em transação única (`-1`), e `CREATE INDEX CONCURRENTLY` não roda dentro de transação. Use a variante manual, que cria os índices sem bloquear a coleta.

A API nova funciona com ou sem os índices (só fica mais lenta sem eles), então a ordem em relação ao deploy não importa; o recomendado é criar os índices antes.

1. Com o PR mergeado na `main`, no Mac do dono (sem `-1`):

   ```zsh
   REPO=~/orca/workspaces/Licita-Insight/main
   git -C "$REPO" fetch -q origin
   git -C "$REPO" show origin/main:lib/db/migrations/manual/0044_search_latency_indexes.sql \
     | ssh licita-worker 'docker exec -i licita-macbook-postgres-1 psql -U licita -d licita -v ON_ERROR_STOP=1'
   ```

   A saída mostra cinco `CREATE INDEX` e um `ANALYZE`. Backup não é necessário: nenhum dado muda, e reverter é remover os índices.
2. Conferir que os cinco estão válidos (`indisvalid = t`):

   ```zsh
   ssh licita-worker "docker exec licita-macbook-postgres-1 psql -U licita -d licita -c \"select c.relname, i.indisvalid, pg_size_pretty(pg_relation_size(c.oid)) from pg_index i join pg_class c on c.oid = i.indexrelid where c.relname in ('tenders_open_published_at_idx','tenders_open_deadline_idx','tenders_upper_state_status_idx','tenders_modality_status_idx','tenders_platform_status_idx')\""
   ```

3. Se algum ficar `indisvalid = f` (falha no meio, por exemplo `lock_timeout`), removê-lo com `DROP INDEX CONCURRENTLY <nome>;` e repetir o passo 1: `IF NOT EXISTS` pula os que já estão prontos.
4. Reverter: `DROP INDEX CONCURRENTLY` de cada um. O código continua correto sem eles.

### Tempo e impacto com a API no ar

- `CONCURRENTLY` não bloqueia leituras nem a coleta do PNCP; cada índice lê a tabela duas vezes e espera as transações abertas no início terminarem. O arquivo fixa `lock_timeout = 5s` para não ficar na fila atrás de um `VACUUM` manual ou outra DDL.
- No banco sintético (300 mil editais, heap de 586 MB, Mac M-series), cada índice levou 0,2–0,6 s. Com ~1,5–2 milhões de editais, a estimativa é de segundos a poucos minutos por índice, conforme o disco do servidor; o arquivo inteiro deve terminar em menos de 10 minutos.
- Tamanho: os dois parciais acompanham o número de abertos (~1 MB cada); os três completos ficam em ~2 MB a cada 300 mil editais (~15 MB cada com 2 milhões).
- Escrita: cada edital inserido ou atualizado grava em mais cinco btrees pequenos. As colunas indexadas (`status`, `state`, `modality`, `platform`, `published_at`, `proposal_deadline`) já tinham índice, então nenhuma atualização que antes era HOT deixa de ser.

Em ambiente de teste, `pnpm --filter @workspace/db run migrate` aplica `0044_search_latency_indexes.sql` (`CREATE INDEX IF NOT EXISTS`, sem `CONCURRENTLY`), e `pnpm --filter @workspace/db run verify:migrations` compara o resultado de `migrate` com o schema Drizzle aplicado por `push-force`.
