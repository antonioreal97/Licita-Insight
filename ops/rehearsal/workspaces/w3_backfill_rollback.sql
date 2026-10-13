-- RASCUNHO DE ENSAIO — NÃO É MIGRAÇÃO APROVADA PARA PRODUÇÃO.
-- Objetivo: remover somente associações e linhas determinísticas criadas por W3; o legado nunca é apagado nem recalculado.
-- Pré-condições: W4 revertido; W2 ainda aplicado.
-- Transação: sim.
-- Desfazer o rollback: reaplicar w3_backfill.sql em lote e delta.

BEGIN;

UPDATE company_tender_fits row SET workspace_id = NULL
FROM users u WHERE row.user_id = u.id AND row.workspace_id = 'ws_' || md5('pardal-digital:procurement:' || u.id);
UPDATE saved_tenders row SET workspace_id = NULL
FROM users u WHERE row.user_id = u.id AND row.workspace_id = 'ws_' || md5('pardal-digital:procurement:' || u.id);
UPDATE saved_searches row SET workspace_id = NULL
FROM users u WHERE row.user_id = u.id AND row.workspace_id = 'ws_' || md5('pardal-digital:procurement:' || u.id);
UPDATE notifications row SET workspace_id = NULL
FROM users u WHERE row.user_id = u.id AND row.workspace_id = 'ws_' || md5('pardal-digital:procurement:' || u.id);
UPDATE recommendation_events row SET workspace_id = NULL
FROM users u WHERE row.user_id = u.id AND row.workspace_id = 'ws_' || md5('pardal-digital:procurement:' || u.id);
UPDATE recommendation_dismissals row SET workspace_id = NULL
FROM users u WHERE row.user_id = u.id AND row.workspace_id = 'ws_' || md5('pardal-digital:procurement:' || u.id);
UPDATE recommendation_interest_profiles row SET workspace_id = NULL
FROM users u WHERE row.user_id = u.id AND row.workspace_id = 'ws_' || md5('pardal-digital:procurement:' || u.id);
UPDATE user_recommendations row SET workspace_id = NULL
FROM users u WHERE row.user_id = u.id AND row.workspace_id = 'ws_' || md5('pardal-digital:procurement:' || u.id);
UPDATE ai_jobs row SET workspace_id = NULL
FROM users u WHERE row.user_id = u.id AND row.kind = 'fit'
  AND row.workspace_id = 'ws_' || md5('pardal-digital:procurement:' || u.id);

UPDATE email_delivery_notifications link SET workspace_id = NULL
FROM notifications notification
WHERE link.notification_id = notification.id
  AND link.workspace_id = notification.workspace_id;
UPDATE email_deliveries delivery SET workspace_id = NULL
WHERE EXISTS (
  SELECT 1 FROM users u
  WHERE delivery.user_id = u.id
    AND delivery.workspace_id = 'ws_' || md5('pardal-digital:procurement:' || u.id)
);

DELETE FROM user_workspace_preferences preference
USING users u
WHERE preference.user_id = u.id
  AND preference.active_workspace_id = 'ws_' || md5('pardal-digital:procurement:' || u.id);

DELETE FROM workspaces workspace
USING users u
WHERE workspace.owner_user_id = u.id
  AND workspace.id = 'ws_' || md5('pardal-digital:procurement:' || u.id)
  AND workspace.type = 'procurement'
  AND workspace.limit_slot = 1
  AND workspace.is_default;

DELETE FROM workspace_rehearsal_checkpoints WHERE phase IN ('baseline', 'batch', 'delta');

COMMIT;
