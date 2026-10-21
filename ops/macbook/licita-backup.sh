#!/usr/bin/env bash
# Daily custom-format dump of the production database, taken inside the Postgres container.
# Installed as ~/.local/bin/licita-backup and run by licita-backup.timer. Never touches the database files directly.
set -Eeuo pipefail

container=${BACKUP_PG_CONTAINER:-licita-macbook-postgres-1}
backup_dir=${BACKUP_DIR:-$HOME/backups/licita}
retention_days=${BACKUP_RETENTION_DAYS:-14}
keep_min=${BACKUP_KEEP_MIN:-3}
# Optional off-machine copy over SSH, e.g. "abriu-edge:/home/ubuntu/backups/licita". Empty disables it.
copy_target=${BACKUP_COPY_TARGET:-}

if [[ ! "$backup_dir" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  printf 'BACKUP_DIR must be a simple absolute path.\n' >&2
  exit 1
fi
for value in "$retention_days" "$keep_min"; do
  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    printf 'BACKUP_RETENTION_DAYS and BACKUP_KEEP_MIN must be positive integers.\n' >&2
    exit 1
  fi
done
if [[ -n "$copy_target" && ! "$copy_target" =~ ^[A-Za-z0-9._@-]+:/[A-Za-z0-9._/-]+$ ]]; then
  printf 'BACKUP_COPY_TARGET must look like host:/absolute/path.\n' >&2
  exit 1
fi
docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null | grep -qx true || {
  printf 'Container %s is not running.\n' "$container" >&2
  exit 1
}

umask 077
mkdir -p "$backup_dir"
timestamp=$(date +%Y%m%d-%H%M%S)
file="$backup_dir/licita-macbook-$timestamp.dump"
partial="$file.partial"
trap 'rm -f "$partial"' EXIT

printf 'Dumping %s to %s\n' "$container" "$file"
# POSTGRES_USER/POSTGRES_DB come from the container's own environment: no credential lives in this script.
docker exec "$container" sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=6 --no-owner --no-acl' >"$partial"

# A dump that pg_restore cannot list is not a backup.
entries=$(docker exec -i "$container" pg_restore --list <"$partial" | grep -c ' TABLE DATA ' || true)
if [[ "$entries" -lt 1 ]]; then
  printf 'pg_restore --list found no table data in the dump.\n' >&2
  exit 1
fi
mv "$partial" "$file"
trap - EXIT
size=$(wc -c <"$file" | tr -d ' ')
if command -v sha256sum >/dev/null; then sha=$(sha256sum "$file" | cut -d' ' -f1); else sha=$(shasum -a 256 "$file" | cut -d' ' -f1); fi
printf '%s  %s\n' "$sha" "$(basename "$file")" >"$file.sha256"

if [[ -n "$copy_target" ]]; then
  host=${copy_target%%:*}
  remote_dir=${copy_target#*:}
  ssh -o BatchMode=yes "$host" mkdir -p "$remote_dir"
  scp -q -o BatchMode=yes "$file" "$copy_target/.$(basename "$file").partial"
  ssh -o BatchMode=yes "$host" "mv '$remote_dir/.$(basename "$file").partial' '$remote_dir/$(basename "$file")' && find '$remote_dir' -maxdepth 1 -name 'licita-macbook-*.dump' -mtime +$retention_days -delete"
  copied=true
else
  copied=false
fi

# Retention: drop dumps older than the window, but never below the newest $keep_min.
ls -1t "$backup_dir"/licita-macbook-*.dump 2>/dev/null | tail -n +$((keep_min + 1)) | while IFS= read -r old; do
  if [[ -n "$(find "$old" -maxdepth 0 -mtime +"$retention_days")" ]]; then
    rm -f "$old" "$old.sha256"
  fi
done

# Read by licita_monitor.py: a missing or stale file raises the backup:stale anomaly.
cat >"$backup_dir/last-backup.json" <<JSON
{"file": "$(basename "$file")", "at": "$(date +%Y-%m-%dT%H:%M:%S%z)", "bytes": $size, "sha256": "$sha", "table_data_entries": $entries, "copied_off_machine": $copied}
JSON
printf 'OK %s (%s bytes, %s tables with data)\n' "$(basename "$file")" "$size" "$entries"
