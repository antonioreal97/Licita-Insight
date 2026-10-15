# Migração 0044 — fundação de Espaços (W1)

`lib/db/migrations/0044_workspaces_foundation.sql` é a W1 do [roadmap do hub adaptativo](../plans/hub-adaptativo-roadmap-v2.md):
cria as tabelas de Espaços vazias e a tabela da flag de corte. Deriva do rascunho de ensaio
`ops/rehearsal/workspaces/w1_foundation.sql`, sem a guarda `_rehearsal` e sem a tabela de checkpoints do ensaio.

> **Ainda não autorizada em produção.** Só existe na branch de integração `feat/workspaces-phase-1`. O dono aplica
> depois do gate de migração do [plano de execução](../plans/hub-adaptativo-fase1-execucao.md#o-que-continua-bloqueado-e-por-quem)
> (SQL aprovado, backup/restore verificado, ensaio com volume real). Agentes não aplicam nem acessam o banco.

O que cria (todas vazias):

- `workspaces` — Espaço, proprietário, `limit_slot` estável, marcador de padrão, onboarding e
  `show_international_opportunities`;
- `workspace_members` — só a associação `owner` (`CHECK role = 'owner'` e FK composta para `workspaces(id, owner_user_id)`);
- `workspace_profiles` e `workspace_profile_signals` — perfil por Espaço (`profile_version`, `revision`, `answers`) e
  sinais derivados;
- `user_workspace_preferences` — Espaço ativo, com `ON DELETE SET NULL`;
- `workspace_cutover_events` — flag de corte, só de inserção, conforme o
  [contrato](../contracts/workspace-cutover-v1.md#onde-o-valor-mora). **Tabela vazia = `legacy` com escritas liberadas**;
  a migração não insere linha.

**Não destrutiva.** Nenhuma tabela existente ganha coluna e nenhuma linha muda.

**O que trava.** Cada FK nova para `users` pede um lock `SHARE ROW EXCLUSIVE` breve em `users` (bloqueia
`INSERT`/`UPDATE`/`DELETE` em `users`, como login e criação de conta, por milissegundos; leituras seguem). Se houver
transação longa aberta em `users`, a migração espera por ela e segura os logins atrás de si: aplique fora do pico e
com `lock_timeout` (abaixo). `tenders` não é lida nem bloqueada.

## Procedimento em produção (o dono executa)

Uma migração por vez, nesta ordem: 0043 da main, 0044, conferência, depois [0045](./0045-workspace-scope-expand.md). A versão da
API que contém a Fase 1 **só sobe com as duas aplicadas**.

1. Backup verificado (`pg_dump -Fc`), como no procedimento vigente.
2. Aplicar o arquivo inteiro numa transação, como as demais migrações (`psql -v ON_ERROR_STOP=1 -1`). Para falhar em
   vez de enfileirar logins atrás de uma transação longa, passe `PGOPTIONS='-c lock_timeout=5s'` ao `psql`
   (no servidor: `docker exec -i -e PGOPTIONS='-c lock_timeout=5s' ...`). Se falhar por `lock timeout`, nada foi
   aplicado: rode de novo em outro momento.
3. Conferência:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in (
  'workspaces', 'workspace_members', 'workspace_profiles', 'workspace_profile_signals',
  'user_workspace_preferences', 'workspace_cutover_events'
) order by table_name;                                   -- 6 linhas

select count(*) from workspace_cutover_events;          -- 0 (= legacy)
```

A segunda execução não faz nada (`IF NOT EXISTS`). A versão atual da API ignora as tabelas novas, então aplicar
antes do deploy é sempre seguro.

## Reversão

Só com a API de volta à versão anterior à Fase 1 e depois de reverter a 0045 (as colunas `workspace_id` referenciam
`workspaces`):

```sql
begin;
drop table if exists workspace_cutover_events;
drop table if exists user_workspace_preferences;
drop table if exists workspace_profile_signals;
drop table if exists workspace_profiles;
drop table if exists workspace_members;
drop table if exists workspaces;
commit;
```

Antes do backfill (W3) as tabelas estão vazias, então a reversão não perde dado. Depois da W3, reverter apaga os
Espaços criados; o legado continua íntegro enquanto a flag estiver em `legacy`.
