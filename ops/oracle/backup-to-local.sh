#!/usr/bin/env bash
set -Eeuo pipefail

required=(pg_dump pg_restore scp ssh)
for command_name in "${required[@]}"; do
  command -v "$command_name" >/dev/null || {
    printf 'Required command not found: %s\n' "$command_name" >&2
    exit 1
  }
done

: "${DATABASE_URL:?DATABASE_URL must point to the Oracle PostgreSQL database}"
: "${BACKUP_HOST:?BACKUP_HOST must be the SSH host or Tailscale IP of the local server}"

backup_dir=${BACKUP_REMOTE_DIR:-/home/ubuntu/backups/licita}
retention_days=${BACKUP_RETENTION_DAYS:-14}
ssh_user=${BACKUP_SSH_USER:-ubuntu}
ssh_target="${ssh_user}@${BACKUP_HOST}"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
filename="licitainsight-${timestamp}.dump"
temporary_dump=$(mktemp "${TMPDIR:-/tmp}/licitainsight-backup.XXXXXX.dump")
trap 'rm -f "$temporary_dump"' EXIT

if [[ ! "$backup_dir" =~ ^/[A-Za-z0-9._/-]+$ ]]; then
  printf 'BACKUP_REMOTE_DIR must be a simple absolute path.\n' >&2
  exit 1
fi
if [[ ! "$retention_days" =~ ^[1-9][0-9]*$ ]]; then
  printf 'BACKUP_RETENTION_DAYS must be a positive integer.\n' >&2
  exit 1
fi

printf 'Creating and checking dump %s\n' "$timestamp"
pg_dump --format=custom --compress=6 --no-owner --no-acl \
  --file "$temporary_dump" "$DATABASE_URL"
pg_restore --list "$temporary_dump" >/dev/null

printf 'Transferring to %s:%s/%s\n' "$ssh_target" "$backup_dir" "$filename"
ssh -o BatchMode=yes "$ssh_target" mkdir -p "$backup_dir"
scp -q -o BatchMode=yes "$temporary_dump" "$ssh_target:$backup_dir/.${filename}.partial"
ssh -o BatchMode=yes "$ssh_target" bash -s -- "$backup_dir" "$filename" "$retention_days" <<'REMOTE_SCRIPT'
set -Eeuo pipefail
backup_dir=$1
filename=$2
retention_days=$3
umask 077
mkdir -p "$backup_dir"
partial="$backup_dir/.${filename}.partial"
trap 'rm -f "$partial"' EXIT
pg_restore --list "$partial" >/dev/null
mv "$partial" "$backup_dir/$filename"
trap - EXIT
find "$backup_dir" -maxdepth 1 -type f -name 'licitainsight-*.dump' -mtime "+$retention_days" -delete
printf '%s\n' "$backup_dir/$filename"
REMOTE_SCRIPT

printf 'Backup transferred and catalog verified with pg_restore --list.\n'
