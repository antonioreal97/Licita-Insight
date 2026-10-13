\set ON_ERROR_STOP on
-- RASCUNHO DE ENSAIO — NÃO É MIGRAÇÃO APROVADA PARA PRODUÇÃO.
-- Objetivo: medir a reversão das estruturas criadas por W1, sem tocar no legado.
-- Pré-condições: W4, W3 e W2 já revertidos; nenhuma aplicação usando as tabelas de ensaio.
-- Transação: sim.
-- Desfazer o rollback: reaplicar w1_foundation.sql.

BEGIN;
DO $guard$
BEGIN
  IF current_database() !~ '_rehearsal$' THEN
    RAISE EXCEPTION 'Recusado: w1_foundation_rollback.sql é rascunho de ensaio e só roda em banco terminado em _rehearsal (banco atual: %).', current_database();
  END IF;
END
$guard$;
DROP TABLE IF EXISTS workspace_rehearsal_checkpoints;
DROP TABLE IF EXISTS user_workspace_preferences;
DROP TABLE IF EXISTS workspace_profile_signals;
DROP TABLE IF EXISTS workspace_profiles;
DROP TABLE IF EXISTS workspace_members;
DROP TABLE IF EXISTS workspaces;
COMMIT;
