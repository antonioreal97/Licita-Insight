CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS tenders_search_text_trgm_idx
  ON tenders USING gin (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS cultural_opportunities_search_text_trgm_idx
  ON cultural_opportunities USING gin (search_text gin_trgm_ops);
