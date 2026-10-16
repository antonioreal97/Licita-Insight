-- Reverses 0046_direct_contracting_status.sql one batch at a time (8k rows).
-- Prefer: pnpm --filter @workspace/api-server run backfill:direct-status -- --rollback
-- Re-run until ROW_COUNT is 0. Only restores rows that still match the direct rule
-- (dispensa/inexigibilidade, no proposal_deadline) so later PNCP updates that added a
-- deadline and left status as open/under_review are not overwritten.

WITH picked AS (
  SELECT id
  FROM tenders
  WHERE status = 'direct'
    AND modality IN ('dispensa', 'inexigibilidade')
    AND proposal_deadline IS NULL
  ORDER BY id
  LIMIT 8000
  FOR UPDATE SKIP LOCKED
)
UPDATE tenders t
SET status = 'open', updated_at = now()
FROM picked
WHERE t.id = picked.id;
