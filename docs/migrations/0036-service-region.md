# Migração 0036 — região de atuação

Produção **não aplica migrações no deploy**. Antes de liberar a API/UI desta alteração, um operador deve aplicar manualmente `lib/db/migrations/0036_service_region.sql` usando o procedimento operacional vigente e confirmar as novas colunas em `company_profiles`.

A migração é aditiva e atua somente em `company_profiles`. Ela remove/recria um `CHECK` e adiciona seis colunas com defaults; isso obtém um lock breve `ACCESS EXCLUSIVE` nessa tabela pequena. **Não lê, atualiza nem bloqueia `tenders` (~165 mil linhas)** e não cria backfill de edital: `tenders.city_ibge_code` já existe, tem índice e é preenchido pelo coletor a partir de `unidadeOrgao.codigoIbge`.

Compatibilidade: `coverage_states` e `coverage_scope='states'` permanecem intactos. Linhas existentes recebem `coverage_mode='prioritize'`, preservando o comportamento anterior de peso; depois da migração, o default para novos registros passa a `strict`. O teste em banco temporário confirmou que a segunda execução do migrador é idempotente e que `['SP','MG']` permanece inalterado.
