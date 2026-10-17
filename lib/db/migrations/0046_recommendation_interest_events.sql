-- Triage "Interessa" stores extracted expressions as recommendation_events.type = interest.
ALTER TABLE "recommendation_events" DROP CONSTRAINT "recommendation_events_type_check";
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_type_check"
  CHECK ("type" IN ('search', 'tender_view', 'interest'));

ALTER TABLE "recommendation_events" DROP CONSTRAINT "recommendation_events_payload_check";
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_payload_check"
  CHECK (
    ("type" = 'search' AND jsonb_array_length("normalized_terms") > 0 AND "tender_id" IS NULL)
    OR ("type" = 'tender_view' AND "tender_id" IS NOT NULL)
    OR ("type" = 'interest' AND "tender_id" IS NOT NULL AND jsonb_array_length("normalized_terms") > 0)
  );
