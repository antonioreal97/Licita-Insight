#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s /absolute/path/to/licitainsight.dump\n' "$0" >&2
  exit 2
fi

dump_path=$1
[[ -r "$dump_path" ]] || {
  printf 'Dump is not readable: %s\n' "$dump_path" >&2
  exit 1
}

for command_name in docker; do
  command -v "$command_name" >/dev/null || {
    printf 'Required command not found: %s\n' "$command_name" >&2
    exit 1
  }
done

container_name=${REHEARSAL_CONTAINER_NAME:-pardal-restore-rehearsal}
image=${REHEARSAL_POSTGRES_IMAGE:-pgvector/pgvector:pg16-bookworm}
password=${REHEARSAL_POSTGRES_PASSWORD:-rehearsal-only-not-exposed}
keep=${KEEP_REHEARSAL_CONTAINER:-false}

if docker container inspect "$container_name" >/dev/null 2>&1; then
  printf 'Container already exists: %s\n' "$container_name" >&2
  exit 1
fi

cleanup() {
  if [[ "$keep" != "true" ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker run --detach --name "$container_name" \
  --platform "${ORACLE_PLATFORM:-linux/arm64}" \
  --tmpfs /var/lib/postgresql/data:rw,size=8g \
  --env POSTGRES_DB=licitainsight_rehearsal \
  --env POSTGRES_USER=rehearsal \
  --env "POSTGRES_PASSWORD=$password" \
  "$image" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$container_name" pg_isready -U rehearsal -d licitainsight_rehearsal >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec "$container_name" pg_isready -U rehearsal -d licitainsight_rehearsal >/dev/null

docker cp "$dump_path" "$container_name:/tmp/rehearsal.dump"
docker exec "$container_name" pg_restore --list /tmp/rehearsal.dump >/dev/null
docker exec "$container_name" pg_restore \
  --exit-on-error --no-owner --no-acl \
  --username rehearsal --dbname licitainsight_rehearsal \
  /tmp/rehearsal.dump

table_count=$(docker exec "$container_name" psql -At \
  --username rehearsal --dbname licitainsight_rehearsal \
  --command "select count(*) from pg_catalog.pg_tables where schemaname = 'public';")
tender_count=$(docker exec "$container_name" psql -At \
  --username rehearsal --dbname licitainsight_rehearsal \
  --command "select count(*) from public.tenders;")

printf 'Restore rehearsal succeeded: %s public tables, %s tenders.\n' "$table_count" "$tender_count"
if [[ "$keep" == "true" ]]; then
  printf 'Container retained for inspection: %s\n' "$container_name"
fi
