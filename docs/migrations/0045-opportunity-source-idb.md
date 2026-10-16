# 0045 — Fonte `idb` (BID) nas oportunidades

Migração só de restrição em `cultural_opportunities`: a `CHECK` `cultural_opportunities_source_check` passa a aceitar `idb`, a fonte dos avisos de aquisição do BID ([`docs/contracts/opportunities-v1.md`](../contracts/opportunities-v1.md)). Nenhuma coluna nova e nenhuma linha muda: os avisos do BID usam as colunas internacionais da [`0041`](0041-international-opportunities.md) (`scope`, `agency`, `brazil_eligibility`…), como Banco Mundial e União Europeia.

Sem ela, a coleta internacional grava Banco Mundial e UE normalmente e a fonte `idb` falha no `INSERT` com violação da restrição, registrada no `error` da execução em `ingest_runs`.

> **Numeração:** a branch `feat/workspaces-phase-1` também criou um arquivo `0045`. Esta migração entra antes; ao sincronizar com a `main`, a Fase 1 será renumerada para depois dela.

## Produção (aplicação manual pelo dono)

Produção **nunca** roda `migrate`: cada migração é aplicada à mão, uma por vez, em transação única, depois do merge e **antes** do deploy.

1. Com o PR mergeado na `main`, rodar no Mac do dono o script de apoio (backup `pg_dump -Fc` em `~/backups/licita/` no servidor e aplicação com `psql -v ON_ERROR_STOP=1 -1`):

   ```zsh
   zsh ~/orca/workspaces/Licita-Insight/aplicar-migracao.sh 0045_opportunity_source_idb
   ```

   A saída termina em `0045 ok`.
2. Conferir a restrição: `\d cultural_opportunities` lista `cultural_opportunities_source_check` com `'idb'`.
3. Só então publicar a branch do servidor. A coleta internacional continua desligada por padrão (`INTERNATIONAL_COLLECT`); ligada, o BID entra na mesma execução diária, depois do PNCP.
4. Reverter: voltar a API e, se preciso, apagar as linhas `source = 'idb'` antes de recriar a restrição sem `idb`.

Em ambiente de teste, `pnpm --filter @workspace/db run verify:migrations` compara o resultado de `migrate` com o schema Drizzle aplicado por `push-force`.
