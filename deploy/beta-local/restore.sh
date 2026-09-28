#!/bin/sh
# Replaces the beta database with a dump made by backup.sh. Destructive: requires --yes.
# Stops the app first (dropdb refuses while it is connected) and starts it again at the end.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
dump="${1:?usage: restore.sh /path/to/licitai-beta-*.dump --yes}"
[ "${2:-}" = "--yes" ] || { echo "restore replaces the current beta database; re-run with --yes" >&2; exit 2; }
[ -s "$dump" ] || { echo "dump not found or empty: $dump" >&2; exit 1; }

compose() { docker compose -f "$here/docker-compose.yml" "$@"; }

compose stop app
compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --force --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" --no-owner --no-acl -d "$POSTGRES_DB"' < "$dump"
compose start app
echo "restored $dump"
