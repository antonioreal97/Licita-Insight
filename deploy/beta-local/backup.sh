#!/bin/sh
# Nightly logical backup of the beta database. Safe to run from launchd (any working directory).
# Writes to a .partial file first, so a failed dump never looks like a valid backup.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
: "${BETA_BACKUP_DIR:?set BETA_BACKUP_DIR to a private folder (ideally one synced off this Mac)}"
retention="${BETA_BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BETA_BACKUP_DIR"
chmod 700 "$BETA_BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="$BETA_BACKUP_DIR/licitai-beta-$stamp.dump"
partial="$out.partial"
trap 'rm -f "$partial"' EXIT

docker compose -f "$here/docker-compose.yml" exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" --format=custom --no-owner --no-acl "$POSTGRES_DB"' > "$partial"
[ -s "$partial" ] || { echo "backup failed: empty dump" >&2; exit 1; }
mv "$partial" "$out"
chmod 600 "$out"

find "$BETA_BACKUP_DIR" -name 'licitai-beta-*.dump' -mtime "+$retention" -delete
echo "backup created: $out"
