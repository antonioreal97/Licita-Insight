# 0043 — Onde se inscrever nas oportunidades

Migração aditiva em `cultural_opportunities`: onze colunas novas, todas nulas e sem default, e duas restrições `CHECK` sobre colunas ainda vazias. Nenhuma linha muda; o PostgreSQL adiciona as colunas só nos metadados, sem reescrever a tabela.

| Coluna | Conteúdo |
| --- | --- |
| `application_url`, `application_platform`, `application_label` | Link de inscrição, slug e nome da plataforma |
| `application_source`, `application_document_title` | Origem (`source_page` ou `document`) e título do documento |
| `application_checked_at`, `application_input_hash` | Última leitura e o que ela leu (cache) |
| `notice_registration_from`, `notice_registration_to` | Período lido do edital, quando a fonte não traz datas |
| `notice_dates_source`, `notice_dates_document_title` | Origem e documento das datas |

> **Numeração:** a branch `feat/workspaces-phase-1` também criou arquivos `0043`/`0044`. Esta migração entra antes; ao sincronizar com a `main`, a Fase 1 será renumerada para depois dela.

## Produção (aplicação manual pelo dono)

Produção **nunca** roda `migrate`: o histórico do Drizzle no banco de produção diverge do repositório, então cada migração é aplicada à mão, uma por vez, em transação única, depois do merge e **antes** do deploy.

1. Com o PR mergeado na `main`, rodar no Mac do dono o script de apoio, que faz o backup `pg_dump -Fc` em `~/backups/licita/` no servidor e aplica só este arquivo com `psql -v ON_ERROR_STOP=1 -1`:

   ```zsh
   zsh ~/orca/workspaces/Licita-Insight/aplicar-migracao.sh 0043_opportunity_application
   ```

   A saída termina em `0043 ok`.
2. Conferir as onze colunas e as restrições `cultural_opportunities_application_source_check` e `cultural_opportunities_notice_dates_source_check` em `cultural_opportunities` (`\d cultural_opportunities`). Todas as linhas ficam com as colunas novas nulas.
3. Só então publicar a branch do servidor para subir a API nova (a API nova lê as colunas em toda busca de oportunidades e falha sem elas).
4. Preenchimento: não há backfill manual. Na primeira coleta de cada fonte depois do deploy, as chamadas do Mapas, do Transferegov e do Funding & Tenders recebem o link por regra, de uma vez e sem requisição; CAPES, CNPq, MinC, Salic e Funarte são lidas até 20 por coleta, as nunca lidas primeiro, e completam em poucos dias da agenda normal. Para adiantar uma fonte, os comandos manuais de sempre já fazem a leitura no fim: `pnpm --filter @workspace/api-server run collect:funding` e `collect:culture-federal` (ou os mesmos `.mjs` no container).
5. Reverter: o código antigo ignora as colunas, então basta voltar a API; para removê-las, restaurar o backup (um `DROP COLUMN` perde as leituras, que a coleta refaria).

Em ambiente de teste, `pnpm --filter @workspace/db run verify:migrations` compara o resultado de `migrate` com o schema Drizzle aplicado por `push-force`.
