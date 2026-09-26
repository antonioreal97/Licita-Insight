CREATE OR REPLACE VIEW ai_usage_ledger AS
  SELECT created_at AS occurred_at, user_id, 'ask'::text AS feature,
         tender_id, response_model AS model, input_tokens,
         estimated_cost_usd AS cost_usd
  FROM ai_ask_requests
  WHERE status IN ('answered', 'not_found')
  UNION ALL
  SELECT checked_at AS occurred_at, user_id, 'fit'::text AS feature,
         tender_id, response_model AS model, input_tokens,
         estimated_cost_usd AS cost_usd
  FROM company_tender_fits
  WHERE status = 'ready' AND checked_at IS NOT NULL
  UNION ALL
  SELECT generated_at AS occurred_at, NULL::text AS user_id, 'sheet'::text AS feature,
         tender_id, response_model AS model, input_tokens,
         estimated_cost_usd AS cost_usd
  FROM tender_ai_sheets
  WHERE status = 'ready' AND generated_at IS NOT NULL;
