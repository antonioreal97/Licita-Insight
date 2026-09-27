import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query(`
    create or replace view ai_usage_ledger as
      select created_at as occurred_at, user_id, 'ask'::text as feature,
             tender_id, response_model as model, input_tokens,
             estimated_cost_usd as cost_usd
      from ai_ask_requests
      where status in ('answered', 'not_found')
      union all
      select checked_at as occurred_at, user_id, 'fit'::text as feature,
             tender_id, response_model as model, input_tokens,
             estimated_cost_usd as cost_usd
      from company_tender_fits
      where status = 'ready' and checked_at is not null
      union all
      select generated_at as occurred_at, null::text as user_id, 'sheet'::text as feature,
             tender_id, response_model as model, input_tokens,
             estimated_cost_usd as cost_usd
      from tender_ai_sheets
      where status = 'ready' and generated_at is not null
  `);
} finally {
  await client.end();
}
