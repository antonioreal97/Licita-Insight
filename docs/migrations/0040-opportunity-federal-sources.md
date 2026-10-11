# Migração 0040 — fontes federais de cultura

`lib/db/migrations/0040_opportunity_federal_sources.sql` amplia o `CHECK` de `cultural_opportunities.source`
com quatro valores: `transferegov`, `funarte`, `minc` e `salic`.

**É manual em produção.** Produção não aplica migrações no deploy: um operador roda
`pnpm --filter @workspace/db run migrate` (ou aplica o arquivo SQL) pelo procedimento vigente. No
`deploy/beta-local`, o serviço `migrate` do Compose aplica ao subir; no Compose de desenvolvimento, o
`db-setup` (`push-force`) recria o `CHECK` a partir do schema.

Não destrutiva: remove e recria a constraint, sem tocar em nenhuma linha. Toda linha existente já satisfaz a
lista maior. O `DROP`/`ADD` pede um lock `ACCESS EXCLUSIVE` breve e revalida a tabela, que tem centenas de
linhas — é instantâneo. Não lê nem bloqueia `tenders`. A segunda execução do migrador não faz nada.

Ordem: aplique a migração **antes** de ligar `CULTURE_FEDERAL_COLLECT=true` ou de rodar
`collect:culture-federal`. Sem ela, a primeira gravação de uma fonte nova falha em
`cultural_opportunities_source_check` e a coleta termina como `failed`, sem gravar nada das fontes novas. API e
UI desta versão funcionam com ou sem a migração: os filtros novos só não encontram linhas.

Conferência:

```sql
select pg_get_constraintdef(oid)
from pg_constraint
where conname = 'cultural_opportunities_source_check';
```

Reversão, se nenhuma linha das fontes novas tiver sido gravada: recriar a constraint com a lista anterior
(`'mapas', 'finep', 'cnpq', 'capes'`). Com linhas gravadas, apague-as antes
(`delete from cultural_opportunities where source in ('transferegov', 'funarte', 'minc', 'salic')`).
