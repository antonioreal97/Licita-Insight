# Migração 0041 — oportunidades internacionais

`lib/db/migrations/0041_international_opportunities.sql` prepara `cultural_opportunities` para a seção
internacional do hub e cria a preferência do usuário.

O que muda:

- **Colunas novas em `cultural_opportunities`** (todas nulas ou com default constante):
  `scope` (`national` por padrão), `agency`, `country`, `country_name`, `region`, `language`, `title_original`,
  `title_pt`, `translation_source`, `amount_original`, `currency`, `amount_brl_approx`, `fx_rate`, `fx_date`,
  `deadline_time_zone`, `deadline_precision`, `deadline_original`, `brazil_eligibility`,
  `brazil_eligibility_reason`, `brazil_eligibility_rule`, `brazil_funding`, `brazil_funding_reason` e
  `eligibility_checked_at`.
- **Listas de valores ampliadas**: `kind` passa a aceitar `procurement`; `source` passa a aceitar `worldbank` e
  `eu_ft`. Constraints novas limitam `scope`, `brazil_eligibility`, `brazil_funding`, `deadline_precision` e
  `amount_original`.
- **Três índices** em `cultural_opportunities`: `scope`, `brazil_eligibility` e `region`.
- **Coluna nova em `users`**: `show_international_opportunities boolean not null default false`.

**É manual em produção.** Produção não aplica migrações no deploy: um operador roda
`pnpm --filter @workspace/db run migrate` (ou aplica o arquivo SQL) pelo procedimento vigente. No
`deploy/beta-local`, o serviço `migrate` do Compose aplica ao subir; no Compose de desenvolvimento, o `db-setup`
(`push-force`) cria as colunas e as constraints a partir do schema.

**Não destrutiva.** Nenhuma linha é alterada ou removida. Toda linha existente fica com `scope = 'national'` e
as demais colunas nulas, e já satisfaz as listas maiores.

**O que trava.** Cada `ALTER TABLE` pede um lock `ACCESS EXCLUSIVE` breve na tabela que altera:

- `cultural_opportunities`: adicionar as colunas é só metadado no PostgreSQL 11+ (não reescreve a tabela);
  recriar as constraints revalida as linhas e criar os índices as lê uma vez. A tabela tem de centenas a
  poucos milhares de linhas, então o conjunto leva milissegundos. Durante esse instante a busca de
  `/oportunidades` espera; nada mais é afetado.
- `users`: adicionar a coluna com default constante também é só metadado. O lock dura o tempo do comando; se
  houver uma transação longa aberta em `users`, o `ALTER` espera por ela e segura atrás de si os logins que
  chegarem. Aplique fora do pico.
- `tenders` não é lida nem bloqueada.

A segunda execução do migrador não faz nada (`IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS`).

**Ordem obrigatória: migração primeiro, API depois.** Esta versão da API lê as colunas novas em toda consulta
às duas tabelas. Sem a migração aplicada:

- qualquer leitura de `users` falha com `column "show_international_opportunities" does not exist` — isso
  inclui a sessão e o login, ou seja, o app inteiro para quem está logado;
- a busca e o detalhe de `/oportunidades` falham por causa de `scope` e das demais colunas.

A versão anterior da API continua funcionando com a migração já aplicada (ela ignora as colunas novas), então
aplicar antes é sempre seguro. A coleta internacional fica desligada até `INTERNATIONAL_COLLECT=true`.

Conferência:

```sql
select column_name, column_default
from information_schema.columns
where table_name = 'cultural_opportunities' and column_name in ('scope', 'brazil_eligibility', 'fx_date');

select pg_get_constraintdef(oid)
from pg_constraint
where conname in ('cultural_opportunities_source_check', 'cultural_opportunities_kind_check');

select column_default
from information_schema.columns
where table_name = 'users' and column_name = 'show_international_opportunities';
```

Reversão, depois de voltar a API para a versão anterior:

```sql
delete from cultural_opportunities where scope = 'international';
-- recrie cultural_opportunities_kind_check e cultural_opportunities_source_check com as listas antigas
-- (docs/migrations/0040-opportunity-federal-sources.md) e, se quiser, remova as colunas novas:
alter table users drop column if exists show_international_opportunities;
```
