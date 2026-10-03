CREATE TABLE tender_ai_answers (
  cache_key text PRIMARY KEY NOT NULL,
  evidence_key text NOT NULL,
  tender_id text NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  index_version integer NOT NULL,
  question_hash text NOT NULL,
  requested_model text NOT NULL,
  summary_requested_model text NOT NULL,
  summary_prompt_version integer NOT NULL,
  status text NOT NULL,
  passages jsonb DEFAULT '[]'::jsonb NOT NULL,
  summary jsonb,
  response_model text,
  claim_token text,
  claim_expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tender_ai_answers_status_check CHECK (status IN ('processing', 'answered', 'not_found'))
);
--> statement-breakpoint
CREATE INDEX tender_ai_answers_tender_idx ON tender_ai_answers (tender_id);
--> statement-breakpoint
CREATE INDEX tender_ai_answers_evidence_idx ON tender_ai_answers (evidence_key, updated_at);
--> statement-breakpoint
CREATE INDEX ai_ask_requests_shared_lookup_idx ON ai_ask_requests
  (tender_id, index_version, normalized_question, requested_model, summary_prompt_version, summary_requested_model);
--> statement-breakpoint
DROP VIEW ai_usage_ledger;
--> statement-breakpoint
CREATE VIEW ai_usage_ledger AS
  SELECT created_at AS occurred_at, user_id, 'ask'::text AS feature,
         tender_id, response_model AS model, input_tokens,
         0::integer AS output_tokens, estimated_cost_usd AS cost_usd
  FROM ai_ask_requests
  WHERE status IN ('answered', 'not_found') AND cache_hit = false
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
