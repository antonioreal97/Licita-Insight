#!/bin/sh
# Import only public tenders and reusable analyses into an empty, migrated beta DB.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
dump="${1:?usage: import-shared.sh /path/to/shared-data.dump --yes}"
[ "${2:-}" = "--yes" ] || { echo "import writes to the beta database; re-run with --yes" >&2; exit 2; }
[ -s "$dump" ] || { echo "dump not found or empty: $dump" >&2; exit 1; }

compose() { docker compose -f "$here/docker-compose.yml" "$@"; }

# An archive with account data is never an acceptable handoff artifact, even though
# pg_restore below explicitly selects tables. pg_dump includes empty TABLE DATA entries.
tables=$(compose exec -T db pg_restore -l < "$dump" | awk '$4 == "TABLE" && $5 == "DATA" { print $7 }' | sort)
expected=$(printf '%s\n' \
  cultural_opportunities ingest_days tender_ai_answers tender_ai_documents \
  tender_ai_indexes tender_ai_passages tender_ai_sheets tender_title_examples tenders | sort)
[ "$tables" = "$expected" ] || {
  echo "archive must contain exactly the nine allowlisted public/shared tables" >&2
  exit 1
}

# Migrations must create the schema first. App and collectors must not have started.
compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
DO $$
DECLARE item record; amount bigint;
BEGIN
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) < 25 THEN
    RAISE EXCEPTION 'run all beta migrations (including 0024) before importing';
  END IF;
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', item.tablename) INTO amount;
    IF amount <> 0 THEN
      RAISE EXCEPTION 'beta table % is not empty (% rows)', item.tablename, amount;
    END IF;
  END LOOP;
END $$;
SQL

# Restore parents before children so foreign keys stay enabled throughout the import.
for table in tenders cultural_opportunities ingest_days tender_ai_indexes tender_ai_documents tender_ai_passages tender_ai_sheets tender_ai_answers tender_title_examples; do
  compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --data-only --no-owner --no-acl --exit-on-error -t "$1"' sh "$table" < "$dump"
done

# The source snapshot can cross new deadlines before import finishes.
compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
UPDATE tenders SET status = 'under_review', updated_at = now()
WHERE source_id = 'pncp' AND status = 'open' AND proposal_deadline < now();
DO $$
DECLARE item record; amount bigint;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
              AND tablename NOT IN (
                'tenders', 'cultural_opportunities', 'ingest_days',
                'tender_ai_indexes', 'tender_ai_documents', 'tender_ai_passages',
                'tender_ai_sheets', 'tender_ai_answers', 'tender_title_examples'
              ) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', item.tablename) INTO amount;
    IF amount <> 0 THEN
      RAISE EXCEPTION 'non-shared table % has % rows', item.tablename, amount;
    END IF;
  END LOOP;
END $$;
SELECT 'tenders' AS item, count(*) FROM tenders
UNION ALL SELECT 'cultural_opportunities', count(*) FROM cultural_opportunities
UNION ALL SELECT 'ingest_days', count(*) FROM ingest_days
UNION ALL SELECT 'tender_ai_indexes', count(*) FROM tender_ai_indexes
UNION ALL SELECT 'tender_ai_documents', count(*) FROM tender_ai_documents
UNION ALL SELECT 'tender_ai_passages', count(*) FROM tender_ai_passages
UNION ALL SELECT 'tender_ai_sheets', count(*) FROM tender_ai_sheets
UNION ALL SELECT 'tender_ai_answers', count(*) FROM tender_ai_answers
UNION ALL SELECT 'tender_title_examples', count(*) FROM tender_title_examples
ORDER BY item;
SQL

echo "shared import complete; non-shared tables are empty"
