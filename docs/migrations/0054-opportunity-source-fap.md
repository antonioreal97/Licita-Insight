# 0054 — Fonte `fap` (FAPs estaduais) nas oportunidades

Migração só de restrição em `cultural_opportunities`. A `CHECK` `cultural_opportunities_source_check` passa a aceitar `fap`, a fonte das chamadas das Fundações de Amparo à Pesquisa estaduais ([`docs/contracts/opportunities-v1.md`](../contracts/opportunities-v1.md)). Nenhuma coluna nova é criada e nenhuma linha muda.

Todas as FAPs compartilham a fonte `fap`. Cada uma é identificada pelo `installation_id` (`fap-df`, `fap-sp`…), e o `state` recebe a UF da fundação. Assim, a região declarada no perfil vale também para elas.

Sem esta migração, a coleta de fomento grava CAPES e CNPq normalmente, mas as FAPs falham no `INSERT` com violação da restrição. O erro fica registrado no `error` da execução em `ingest_runs`.

## Produção (aplicação manual pelo dono)

1. Com o PR mergeado na `main`, rodar no Mac do dono:

   ```zsh
   zsh ~/orca/workspaces/Licita-Insight/aplicar-migracao.sh 0054_opportunity_source_fap
   ```

   A saída termina em `0054 ok`.
2. Só então publicar a branch do servidor.
3. Para reverter: voltar a API e, se preciso, apagar as linhas com `source = 'fap'` antes de recriar a restrição sem `fap`.
