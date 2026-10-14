#!/usr/bin/env bash
# Synthetic, nonproduction API instance only. Output columns are timestamp, route class, HTTP status, latency.
set -Eeuo pipefail
BASE="${REHEARSAL_APP_BASE_URL:?}"
ORIGIN="${REHEARSAL_APP_ORIGIN:-$BASE}"
OUT="${1:?probe output path required}"
COOKIE="$(mktemp "${TMPDIR:-/tmp}/workspaces-probe-cookie.XXXXXX")"
trap 'rm -f "$COOKIE"' EXIT
login_status="$(curl --silent --show-error --max-time 10 -o /dev/null -w '%{http_code}' \
  -c "$COOKIE" -H "Origin: $ORIGIN" -H 'X-Requested-With: licita-insight' \
  -H 'Content-Type: application/json' -X POST \
  --data '{"email":"workspaces-probe@invalid.example","name":"Synthetic probe"}' \
  "$BASE/api/v1/auth/dev-login")"
[[ "$login_status" == 204 ]] || { printf 'Rehearsal dev login failed: HTTP %s.\n' "$login_status" >&2; exit 1; }
while true; do
  stamp="$(date +%s)"
  read_result="$(curl --silent --max-time 5 -o /dev/null -w '%{http_code}\t%{time_total}' \
    "$BASE/api/v1/tenders/search?page=1&pageSize=1" || true)"
  printf '%s\tpublic\t%s\n' "$stamp" "$read_result" >> "$OUT"
  v1_result="$(curl --silent --max-time 5 -o /dev/null -w '%{http_code}\t%{time_total}' \
    -b "$COOKIE" "$BASE/api/v1/me/recommendation-preferences" || true)"
  printf '%s\tv1read\t%s\n' "$stamp" "$v1_result" >> "$OUT"
  write_result="$(curl --silent --max-time 5 -o /dev/null -w '%{http_code}\t%{time_total}' \
    -b "$COOKIE" -H "Origin: $ORIGIN" -H 'X-Requested-With: licita-insight' \
    -H 'Content-Type: application/json' -X PUT \
    --data '{"personalizationEnabled":false,"deleteHistory":false,"showInternationalOpportunities":false}' \
    "$BASE/api/v1/me/recommendation-preferences" || true)"
  printf '%s\tmutation\t%s\n' "$stamp" "$write_result" >> "$OUT"
  sleep 1.5
done
