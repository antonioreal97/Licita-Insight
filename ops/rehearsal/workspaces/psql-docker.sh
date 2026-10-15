#!/usr/bin/env bash
# psql-only client for hosts without libpq. Uses the PostgreSQL container's network namespace.
set -Eeuo pipefail
CONTAINER="${CUTOVER_POSTGRES_CONTAINER:?set CUTOVER_POSTGRES_CONTAINER to the intended PostgreSQL container}"
ROOT="${CUTOVER_REPO_ROOT:?set CUTOVER_REPO_ROOT to the checkout path}"
[[ "$ROOT" == /* && -d "$ROOT/ops/workspaces" ]] || { printf 'Invalid checkout path.\n' >&2; exit 65; }
docker inspect "$CONTAINER" >/dev/null 2>&1
docker run --rm -i --network "container:$CONTAINER" \
  -v "$ROOT:$ROOT:ro" -w "$ROOT" \
  -e PGHOST="${CUTOVER_POSTGRES_HOST:-$PGHOST}" \
  -e PGPORT="${CUTOVER_POSTGRES_INTERNAL_PORT:-$PGPORT}" \
  -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGAPPNAME \
  postgres:16 psql "$@"
