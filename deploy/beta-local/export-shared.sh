#!/bin/sh
# Consistent, data-only snapshot of the nine public/shared tables from development.
set -eu

out="${1:?usage: export-shared.sh /private/path/shared-data.dump}"
[ ! -e "$out" ] || { echo "refusing to overwrite: $out" >&2; exit 1; }
source_container="${DEV_DB_CONTAINER:-licita-insight-postgres-1}"
partial="$out.partial"
[ ! -e "$partial" ] || { echo "partial file already exists: $partial" >&2; exit 1; }
trap 'rm -f "$partial"' EXIT

docker exec "$source_container" sh -c '
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --data-only --format=custom --no-owner --no-acl \
    -t tenders -t cultural_opportunities -t ingest_days \
    -t tender_ai_indexes -t tender_ai_documents -t tender_ai_passages \
    -t tender_ai_sheets -t tender_ai_answers -t tender_title_examples
' > "$partial"
[ -s "$partial" ] || { echo "export failed: empty archive" >&2; exit 1; }
mv "$partial" "$out"
chmod 600 "$out"
shasum -a 256 "$out"
