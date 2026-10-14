# Corte de Espaços

Esta é a ferramenta definitiva de W3 e W4. A ordem de produção, os limites da janela, o procedimento do dono e os critérios de desvirada estão em [workspace-w3-w4-production.md](../../docs/migrations/workspace-w3-w4-production.md). O [ensaio](../rehearsal/workspaces/README.md) usa estes mesmos arquivos SQL.

`cutover.sh` aceita `status`, `batch`, `pause`, `cut`, `resume`, `abort`, `rollback` e `w4`. Exige `CUTOVER_DATABASE_URL` explícita sem senha, `CUTOVER_CONFIRM_DB` com o nome exato do banco e senha via `CUTOVER_PGPASSWORD` ou prompt. Não lê `.env`. `batch` roda fora da janela; `cut` contém W3 delta e a troca; `w4` exige uma segunda janela depois de sete dias de observação.

Para validar em um PostgreSQL 16 temporário:

```sh
PNCP_TEST_DATABASE_URL=postgresql://test:test@localhost:5432/test ops/workspaces/test-cutover.sh
node ops/workspaces/verify-drain.mjs
```

O teste cria e remove um banco de nome único com sufixo `_rehearsal` na instância indicada. Use somente uma instância descartável para esse comando.
