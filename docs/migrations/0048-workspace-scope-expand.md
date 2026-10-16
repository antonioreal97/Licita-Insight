# Migração 0048 — `workspace_id` nas tabelas do escopo (W2)

`lib/db/migrations/0048_workspace_scope_expand.sql` é a W2 do [roadmap do hub adaptativo](../plans/hub-adaptativo-roadmap-v2.md).
Deriva dos rascunhos de ensaio `ops/rehearsal/workspaces/w2_scope_expand.sql` e `w2_scope_expand_indexes.sql`, sem a
guarda `_rehearsal`. Pré-requisito: [0047](./0047-workspaces-foundation.md) aplicada.

> **Ainda não autorizada em produção.** Mesmo gate da 0047. Agentes não aplicam nem acessam o banco.

O que muda:

- **Coluna `workspace_id text` anulável, sem default**, em `company_tender_fits`, `saved_tenders`, `saved_searches`,
  `notifications`, `email_deliveries`, `email_delivery_notifications`, `recommendation_events`,
  `recommendation_dismissals`, `recommendation_interest_profiles`, `user_recommendations` e `ai_jobs`.
  `company_profiles` não recebe a coluna: é convertido para `workspace_profiles` no backfill.
- **FK `workspace_id → workspaces(id)`** em cada uma: `ON DELETE CASCADE`, exceto `email_deliveries` e `ai_jobs`
  (`SET NULL`), porque e-mails só de conta e jobs globais sobrevivem ao Espaço.
- **20 índices** por Espaço, inclusive as unicidades futuras por Espaço (parciais em `workspace_id IS NOT NULL` onde
  a chave legada continua valendo). Lista completa no arquivo SQL.

**Não destrutiva.** Nenhuma linha muda; toda linha fica com `workspace_id` nulo até o backfill (W3). `NOT NULL`, troca
de PK e remoção das unicidades legadas ficam para a W4, fora desta migração.

## Por que há duas variantes

O migrador do Drizzle (`drizzle-orm` 0.45.4, `pg-core/dialect.js`, `migrate()`) executa **todas as migrações
pendentes dentro de uma única transação**, e `CREATE INDEX CONCURRENTLY` não roda dentro de transação. Por isso:

| Variante | Arquivo | Onde | Índices | FK |
| --- | --- | --- | --- | --- |
| versionada | `lib/db/migrations/0048_workspace_scope_expand.sql` | desenvolvimento, testes, `pnpm --filter @workspace/db run migrate` | `CREATE INDEX` comum: lock `SHARE`, escritas na tabela esperam o fim do índice | criada válida, com varredura sob `SHARE ROW EXCLUSIVE` |
| produção | `lib/db/migrations/manual/0048_workspace_scope_expand_concurrently.sql` | servidor, antes da versionada | `CREATE INDEX CONCURRENTLY`: escritas seguem | `NOT VALID` + `VALIDATE` em instruções separadas: escritas seguem durante a varredura |

As duas terminam no mesmo schema: mesmas colunas, mesmas FKs (validadas) e mesmos índices, com os mesmos nomes. O
teste `artifacts/api-server/src/workspaces/workspace-migrations.integration.test.ts` prova isso num PostgreSQL
temporário (aplica 0043 da main + 0047 + variante de produção e compara colunas, constraints e índices com a versionada; depois
confirma que a versionada aplicada por cima não muda nada). A versão manual fica fora do `_journal.json` e o
migrador do Drizzle não a lê.

## Procedimento em produção (o dono executa)

1. Conferir que a 0043 da main e a 0047 estão aplicadas (consulta da [0047](./0047-workspaces-foundation.md#procedimento-em-produção-o-dono-executa)).
2. Backup verificado (`pg_dump -Fc`).
3. **Variante concorrente, sem transação.** Rodar
   `lib/db/migrations/manual/0048_workspace_scope_expand_concurrently.sql` com `psql -v ON_ERROR_STOP=1`, **sem `-1`
   e sem `--single-transaction`** (com `-1` o primeiro `CREATE INDEX CONCURRENTLY` falha). No servidor, no mesmo
   formato do procedimento vigente, trocando só a flag: `docker exec -i licita-macbook-postgres-1 psql -U licita -d licita -v ON_ERROR_STOP=1 < arquivo.sql`.
   O próprio arquivo define `lock_timeout = 5s` para os `ALTER TABLE` e o remove antes dos índices. Se parar por
   `lock timeout`, rode de novo: tudo é idempotente.
4. **Índices inválidos.** Um `CONCURRENTLY` interrompido deixa o índice `INVALID`, e o `IF NOT EXISTS` o pularia. A
   consulta tem de voltar vazia:

   ```sql
   select c.relname
   from pg_index x join pg_class c on c.oid = x.indexrelid
   where not x.indisvalid;
   ```

   Para cada nome listado: `drop index concurrently "<nome>";` e repetir o passo 3.
5. **FKs validadas.** Também tem de voltar vazia:

   ```sql
   select conrelid::regclass, conname from pg_constraint
   where contype = 'f' and not convalidated and conname like '%_workspace_id_workspaces_id_fk';
   ```

6. **Versionada pelo procedimento vigente** (`psql -v ON_ERROR_STOP=1 -1`, com `PGOPTIONS='-c lock_timeout=5s'`). Depois
   do passo 3, cada instrução vira no-op (`IF NOT EXISTS`; o bloco das FKs só cria a que faltar). Ela fica aplicada
   como as demais migrações e garante que nada ficou de fora.
7. **Verificação de subida, antes do deploy.** É a mesma que a API faz ao subir; a versão da Fase 1 encerra o processo
   listando o que falta. Tem de voltar vazia:

   ```sql
   select coalesce(required.table_name || '.' || required.column_name, required.table_name) as missing
   from (values
     ('workspaces', null), ('workspace_members', null), ('workspace_profiles', null),
     ('workspace_profile_signals', null), ('user_workspace_preferences', null), ('workspace_cutover_events', null),
     ('company_tender_fits', 'workspace_id'), ('saved_tenders', 'workspace_id'), ('saved_searches', 'workspace_id'),
     ('notifications', 'workspace_id'), ('email_deliveries', 'workspace_id'),
     ('email_delivery_notifications', 'workspace_id'), ('recommendation_events', 'workspace_id'),
     ('recommendation_dismissals', 'workspace_id'), ('recommendation_interest_profiles', 'workspace_id'),
     ('user_recommendations', 'workspace_id'), ('ai_jobs', 'workspace_id')
   ) as required(table_name, column_name)
   where not exists (
     select 1 from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = required.table_name
       and (required.column_name is null or c.column_name = required.column_name)
   );
   ```

**O que trava, na variante de produção.**

- `ADD COLUMN` anulável sem default é só metadado; pede `ACCESS EXCLUSIVE` por milissegundos em cada tabela.
- `ADD CONSTRAINT ... NOT VALID` pede `SHARE ROW EXCLUSIVE` breve na tabela e em `workspaces`, sem varrer.
- `VALIDATE CONSTRAINT` varre a tabela sob `SHARE UPDATE EXCLUSIVE`: leituras e escritas seguem. Com a coluna toda
  nula, só lê.
- `CREATE INDEX CONCURRENTLY` faz duas passadas e espera transações antigas terminarem; leituras e escritas seguem.
  O tempo cresce com `notifications`, `company_tender_fits` e `recommendation_events`, as maiores do escopo. Rode fora
  da coleta das 06:00 e da janela noturna 00:00–05:30.
- `tenders` não é lida nem bloqueada.

Aplicar só a versionada em produção, sem o passo 3, funciona, mas cada `CREATE INDEX` segura as escritas da tabela
(salvar edital, notificações, fila de IA) enquanto o índice é construído, e a validação das FKs varre cada tabela com
escritas bloqueadas. Não é o caminho recomendado.

**Ordem obrigatória: 0043 da main, 0047 e 0048 primeiro, API depois.** O schema Drizzle da Fase 1 declara `workspace_id` nessas
tabelas, e várias consultas usam `select()`/`returning()` sem projeção; sem a 0048, elas falhariam com
`column "workspace_id" does not exist`. Por isso a API verifica na subida e se recusa a iniciar. A versão atual
continua funcionando com a 0048 aplicada: não lê as colunas e grava `workspace_id` nulo.

## Reversão

Só com a API de volta à versão anterior à Fase 1 e antes da W4. Remove índices, FKs e colunas; antes do backfill
nenhum dado se perde (as colunas estão nulas).

```sql
begin;
set local lock_timeout = '5s';
drop index if exists company_tender_fits_workspace_idx, company_tender_fits_workspace_cache_uidx,
  saved_tenders_workspace_saved_idx, saved_tenders_workspace_tender_uidx,
  saved_searches_workspace_updated_idx, saved_searches_workspace_query_active_uidx,
  notifications_workspace_created_idx, notifications_workspace_dedupe_uidx, notifications_id_workspace_uidx,
  email_deliveries_workspace_created_idx, email_deliveries_id_workspace_uidx, email_deliveries_workspace_dedupe_uidx,
  email_delivery_notifications_workspace_idx, recommendation_events_workspace_time_idx,
  recommendation_dismissals_workspace_tender_uidx, recommendation_interest_profiles_workspace_uidx,
  user_recommendations_workspace_tender_uidx, user_recommendations_workspace_rank_idx,
  ai_jobs_workspace_created_idx, ai_jobs_workspace_dedupe_uidx;
alter table company_tender_fits drop column if exists workspace_id;
alter table saved_tenders drop column if exists workspace_id;
alter table saved_searches drop column if exists workspace_id;
alter table notifications drop column if exists workspace_id;
alter table email_deliveries drop column if exists workspace_id;
alter table email_delivery_notifications drop column if exists workspace_id;
alter table recommendation_events drop column if exists workspace_id;
alter table recommendation_dismissals drop column if exists workspace_id;
alter table recommendation_interest_profiles drop column if exists workspace_id;
alter table user_recommendations drop column if exists workspace_id;
alter table ai_jobs drop column if exists workspace_id;
commit;
```

`DROP COLUMN` remove junto a FK da coluna e é só metadado. Depois da W3, reverter perde a atribuição de Espaço das
linhas; o legado continua íntegro enquanto a flag estiver em `legacy`.
