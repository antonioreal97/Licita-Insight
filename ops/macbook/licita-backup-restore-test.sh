#!/usr/bin/env bash
# Restores the newest (or the given) dump into a throwaway Postgres container and compares row counts with
# production. Read-only on production; the throwaway container has no volume and no published port.
set -Eeuo pipefail

prod=${BACKUP_PG_CONTAINER:-licita-macbook-postgres-1}
backup_dir=${BACKUP_DIR:-$HOME/backups/licita}
dump=${1:-$(ls -1t "$backup_dir"/licita-macbook-*.dump 2>/dev/null | head -1)}
[[ -n "$dump" && -f "$dump" ]] || { printf 'No dump found in %s.\n' "$backup_dir" >&2; exit 1; }
if [[ -f "$dump.sha256" ]]; then
  if command -v sha256sum >/dev/null; then (cd "$(dirname "$dump")" && sha256sum --check --quiet "$(basename "$dump").sha256"); else (cd "$(dirname "$dump")" && shasum -a 256 --check --quiet "$(basename "$dump").sha256"); fi
fi

image=$(docker inspect --format '{{.Config.Image}}' "$prod")
scratch="licita-restore-test-$(date +%s)"
trap 'docker rm -f "$scratch" >/dev/null 2>&1 || true' EXIT
docker run -d --rm --name "$scratch" -e POSTGRES_USER=licita -e POSTGRES_PASSWORD=restore-test -e POSTGRES_DB=licita "$image" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$scratch" psql -U licita -d licita -Atc 'select 1' >/dev/null 2>&1 && break
  sleep 1
done
# The image restarts once during initialization; wait until it answers twice in a row.
sleep 3
docker exec "$scratch" psql -U licita -d licita -Atc 'select 1' >/dev/null

printf 'Restoring %s into %s (%s)\n' "$(basename "$dump")" "$scratch" "$image"
docker exec -i "$scratch" pg_restore --exit-on-error --no-owner --no-privileges -U licita -d licita <"$dump"

tables=(tenders pncp_contracts users subscriptions saved_tenders company_profiles company_documents)
status=0
for table in "${tables[@]}"; do
  restored=$(docker exec "$scratch" psql -U licita -d licita -Atc "select count(*) from public.$table")
  current=$(docker exec "$prod" sh -c "exec psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc 'select count(*) from public.$table'")
  # Production keeps changing after the dump; the restore may be behind, never ahead or far behind.
  if [[ "$restored" -gt "$current" || "$restored" -lt $((current * 95 / 100)) ]]; then
    verdict=DIVERGE
    status=1
  else
    verdict=ok
  fi
  printf '%-18s restore=%-8s produção=%-8s %s\n' "$table" "$restored" "$current" "$verdict"
done
exit "$status"
