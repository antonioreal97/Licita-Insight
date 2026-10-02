import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query(`
    drop view if exists ai_usage_ledger;
    create view ai_usage_ledger as
      select created_at as occurred_at, user_id, 'ask'::text as feature,
             tender_id, response_model as model, input_tokens, 0::integer as output_tokens,
             estimated_cost_usd as cost_usd
      from ai_ask_requests
      where status in ('answered', 'not_found')
      union all
      select created_at as occurred_at, user_id, 'ask_summary'::text as feature,
             tender_id, summary_response_model as model, summary_input_tokens as input_tokens,
             summary_output_tokens as output_tokens, summary_estimated_cost_usd as cost_usd
      from ai_ask_requests
      where summary_input_tokens > 0 or summary_output_tokens > 0 or summary_estimated_cost_usd > 0
      union all
      select checked_at as occurred_at, user_id, 'fit'::text as feature,
             tender_id, response_model as model, input_tokens, 0::integer as output_tokens,
             estimated_cost_usd as cost_usd
      from company_tender_fits
      where status = 'ready' and checked_at is not null
      union all
      select generated_at as occurred_at, null::text as user_id, 'sheet'::text as feature,
             tender_id, response_model as model, input_tokens, 0::integer as output_tokens,
             estimated_cost_usd as cost_usd
      from tender_ai_sheets
      where status = 'ready' and generated_at is not null
      union all
      select summary_generated_at as occurred_at, null::text as user_id, 'sheet_summary'::text as feature,
             tender_id, summary_response_model as model, summary_input_tokens as input_tokens,
             summary_output_tokens as output_tokens, summary_estimated_cost_usd as cost_usd
      from tender_ai_sheets
      where summary_generated_at is not null
        and (summary_input_tokens > 0 or summary_output_tokens > 0 or summary_estimated_cost_usd > 0)
      union all
      select created_at as occurred_at, null::text as user_id, 'title'::text as feature,
             tender_id, model, input_tokens, output_tokens, estimated_cost_usd as cost_usd
      from ai_title_usage
  `);
} finally {
  await client.end();
}
