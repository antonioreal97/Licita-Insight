-- One batch of the direct-status backfill (docs/migrations/0046-direct-contracting-status.md).
-- Prefer the Node runner: pnpm --filter @workspace/api-server run backfill:direct-status
-- which commits between batches. Re-run this file until ROW_COUNT is 0 if applying by hand.
-- Idempotent. Does not create notifications (plain UPDATE, not upsertPublications).
-- No schema change: tenders.status is unconstrained text.

WITH picked AS (
  SELECT id
  FROM tenders
  WHERE status = 'open'
    AND modality IN ('dispensa', 'inexigibilidade')
    AND proposal_deadline IS NULL
  ORDER BY id
  LIMIT 8000
  FOR UPDATE SKIP LOCKED
)
UPDATE tenders t
SET status = 'direct', updated_at = now()
FROM picked
WHERE t.id = picked.id;
