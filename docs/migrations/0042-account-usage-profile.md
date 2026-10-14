# 0042 — Finalidade de uso na conta

Migração aditiva em `users`: dois arrays de valores estáveis e a dispensa do convite. Defaults vazios preservam o comportamento das contas existentes. As restrições `CHECK` impedem valores fora do vocabulário.

## Produção (aplicação manual pelo dono)

1. Fazer backup verificável do banco antes de qualquer mudança, por exemplo `pg_dump --format=custom --file=backup-antes-0042.dump "$DATABASE_URL"` e conferir o arquivo.
2. Na janela de implantação, com `DATABASE_URL` apontando para produção, executar manualmente `pnpm --filter @workspace/db run migrate`. O migrador aplica `0042_account_usage_profile.sql` e registra o hash no journal Drizzle na mesma transação.
3. Conferir as três colunas e duas restrições em `users`, e validar que contas existentes têm arrays vazios e `usage_invite_dismissed = false`.
4. Só então subir a API nova. Se for necessário reverter a aplicação, restaurar o backup; a reversão por `DROP COLUMN` perde respostas já salvas.

Em ambiente de teste, `pnpm --filter @workspace/db run verify:migrations` compara o resultado de `migrate` com o schema Drizzle aplicado por `push-force`.
