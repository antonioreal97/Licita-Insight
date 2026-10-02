CREATE TABLE ai_title_usage (
  id bigserial PRIMARY KEY NOT NULL,
  tender_id text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL,
  output_tokens integer NOT NULL,
  estimated_cost_usd numeric(14, 8) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX ai_title_usage_created_idx ON ai_title_usage USING btree (created_at);
--> statement-breakpoint
DROP VIEW ai_usage_ledger;
--> statement-breakpoint
CREATE VIEW ai_usage_ledger AS
  SELECT created_at AS occurred_at, user_id, 'ask'::text AS feature,
         tender_id, response_model AS model, input_tokens,
         0::integer AS output_tokens, estimated_cost_usd AS cost_usd
  FROM ai_ask_requests
  WHERE status IN ('answered', 'not_found')
  UNION ALL
  SELECT created_at AS occurred_at, user_id, 'ask_summary'::text AS feature,
         tender_id, summary_response_model AS model, summary_input_tokens AS input_tokens,
         summary_output_tokens AS output_tokens, summary_estimated_cost_usd AS cost_usd
  FROM ai_ask_requests
  WHERE summary_input_tokens > 0 OR summary_output_tokens > 0 OR summary_estimated_cost_usd > 0
  UNION ALL
  SELECT checked_at AS occurred_at, user_id, 'fit'::text AS feature,
         tender_id, response_model AS model, input_tokens,
         0::integer AS output_tokens, estimated_cost_usd AS cost_usd
  FROM company_tender_fits
  WHERE status = 'ready' AND checked_at IS NOT NULL
  UNION ALL
  SELECT generated_at AS occurred_at, NULL::text AS user_id, 'sheet'::text AS feature,
         tender_id, response_model AS model, input_tokens,
         0::integer AS output_tokens, estimated_cost_usd AS cost_usd
  FROM tender_ai_sheets
  WHERE status = 'ready' AND generated_at IS NOT NULL
  UNION ALL
  SELECT summary_generated_at AS occurred_at, NULL::text AS user_id, 'sheet_summary'::text AS feature,
         tender_id, summary_response_model AS model, summary_input_tokens AS input_tokens,
         summary_output_tokens AS output_tokens, summary_estimated_cost_usd AS cost_usd
  FROM tender_ai_sheets
  WHERE summary_generated_at IS NOT NULL
    AND (summary_input_tokens > 0 OR summary_output_tokens > 0 OR summary_estimated_cost_usd > 0)
  UNION ALL
  SELECT created_at AS occurred_at, NULL::text AS user_id, 'title'::text AS feature,
         tender_id, model, input_tokens, output_tokens, estimated_cost_usd AS cost_usd
  FROM ai_title_usage;
