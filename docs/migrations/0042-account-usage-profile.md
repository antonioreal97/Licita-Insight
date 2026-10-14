# 0042 — Finalidade de uso na conta

Migração aditiva em `users`: dois arrays de valores estáveis e a dispensa do convite. Defaults vazios preservam o comportamento das contas existentes. As restrições `CHECK` impedem valores fora do vocabulário.

## Produção (aplicação manual pelo dono)

Produção **nunca** roda `migrate`: o histórico do Drizzle no banco de produção diverge do repositório (a base veio de um dump), então cada migração é aplicada à mão, uma por vez, em transação única, depois do merge e **antes** do deploy.

1. Com o PR mergeado na `main`, rodar no Mac do dono o script de apoio, que faz o backup `pg_dump -Fc` em `~/backups/licita/` no servidor e aplica só este arquivo com `psql -v ON_ERROR_STOP=1 -1`:

   ```zsh
   zsh ~/orca/workspaces/Licita-Insight/aplicar-migracao.sh 0042_account_usage_profile
   ```

   A saída termina em `0042 ok`.
2. Conferir as três colunas e as duas restrições em `users`; contas existentes ficam com arrays vazios e `usage_invite_dismissed = false`.
3. Só então publicar a branch do servidor para subir a API nova (a API nova falha nas rotas de perfil de uso sem as colunas).
4. Reverter: restaurar o backup; um `DROP COLUMN` perde as respostas já salvas.

Em ambiente de teste, `pnpm --filter @workspace/db run verify:migrations` compara o resultado de `migrate` com o schema Drizzle aplicado por `push-force`.
