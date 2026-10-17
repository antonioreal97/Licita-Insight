# 0049 — Eventos de interesse da triagem

Migração pequena em `recommendation_events`: recria as duas restrições `CHECK` para aceitar o tipo `interest`, gravado quando o usuário marca **Interessa** na triagem (expressões extraídas do edital, em `normalized_terms`). Nenhuma coluna nova e nenhuma linha alterada; as linhas atuais (`search` e `tender_view`) continuam válidas.

> **Numeração:** a `main` usa 0044 e 0045 no diário e o número 0046 no backfill manual da contratação direta; a branch `feat/workspaces-phase-1` usa 0047/0048. Esta entra como **0049**. A "Prontidão para licitar" usa 0050. A Fase 1 será renumerada para depois delas na próxima sincronização.

## Produção (aplicação manual pelo dono)

Produção **nunca** roda `migrate`. Com o PR mergeado na `main`, no Mac do dono:

```zsh
zsh ~/orca/workspaces/Licita-Insight/aplicar-migracao.sh 0049_recommendation_interest_events
```

O script faz o backup e aplica o arquivo em transação única. A saída termina em `0049 ok`. Os nomes das restrições (`recommendation_events_type_check` e `recommendation_events_payload_check`) foram conferidos em produção em 16/10/2026.

Ordem: aplicar **antes** do deploy da API nova (a API grava `interest` ao marcar Interessa; sem a migração, essa gravação falha).

Depois do deploy, as recomendações são recalculadas com a regra nova pelo job noturno das 03:00 (ou ao vivo, a cada resposta da triagem do próprio usuário). Em desenvolvimento há `pnpm --filter @workspace/api-server run rebuild:recommendations`; ele não faz parte do bundle de produção.

## Reverter

Apagar os eventos `interest` e recriar as restrições sem `interest`:

```sql
begin;
delete from recommendation_events where type = 'interest';
alter table recommendation_events drop constraint recommendation_events_type_check;
alter table recommendation_events add constraint recommendation_events_type_check check (type in ('search', 'tender_view'));
alter table recommendation_events drop constraint recommendation_events_payload_check;
alter table recommendation_events add constraint recommendation_events_payload_check check (
  (type = 'search' and jsonb_array_length(normalized_terms) > 0 and tender_id is null)
  or (type = 'tender_view' and tender_id is not null)
);
commit;
```
