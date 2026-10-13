#!/usr/bin/env bash
# RASCUNHO DE ENSAIO — NÃO É FERRAMENTA AUTORIZADA PARA PRODUÇÃO.
# Requer somente bash e psql; não lê .env e nunca imprime a URL do banco.

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLLBACK=false
ABORT_DRILL=false
REPORT_DIR="${REHEARSAL_REPORT_DIR:-}"
BATCH_SIZE="${REHEARSAL_BATCH_SIZE:-500}"
POINT_OF_NO_RETURN_SECONDS="${REHEARSAL_POINT_OF_NO_RETURN_SECONDS:-600}"
EXPECTED_DELTA_ROWS="${REHEARSAL_EXPECTED_DELTA_ROWS:-0}"
PUBLIC_ERROR_PERCENT="${REHEARSAL_PUBLIC_ERROR_PERCENT:-0}"
PUBLIC_P95_RATIO="${REHEARSAL_PUBLIC_P95_RATIO:-1}"
DRAIN_SECONDS="${REHEARSAL_DRAIN_SECONDS:-0}"
SYNTHETIC_RATE="${REHEARSAL_SYNTHETIC_RATE_PER_MINUTE:-0}"

usage() {
  printf '%s\n' \
    'Uso: REHEARSAL_DATABASE_URL=... REHEARSAL_CONFIRM=<banco> run-rehearsal.sh [--rollback] [--abort-drill] --report-dir DIR' \
    'O nome do banco precisa terminar em _rehearsal. A ferramenta nunca lê .env e só escreve em DIR e no diretório temporário.'
}

while (($#)); do
  case "$1" in
    --rollback) ROLLBACK=true ;;
    --abort-drill) ABORT_DRILL=true ;;
    --report-dir)
      shift
      (($#)) || { printf 'Falta o diretório de relatório.\n' >&2; exit 64; }
      REPORT_DIR="$1"
      ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Argumento desconhecido: %s\n' "$1" >&2; usage >&2; exit 64 ;;
  esac
  shift
done

[[ -n "${REHEARSAL_DATABASE_URL:-}" ]] || { printf 'REHEARSAL_DATABASE_URL é obrigatório.\n' >&2; exit 64; }
[[ -n "${REHEARSAL_CONFIRM:-}" ]] || { printf 'REHEARSAL_CONFIRM é obrigatório.\n' >&2; exit 64; }
[[ -n "$REPORT_DIR" ]] || { printf -- '--report-dir (ou REHEARSAL_REPORT_DIR) é obrigatório; a pasta dos scripts pode estar montada somente leitura.\n' >&2; exit 64; }
if [[ -n "${DATABASE_URL:-}" && "$REHEARSAL_DATABASE_URL" == "$DATABASE_URL" ]]; then
  printf 'Recusado: REHEARSAL_DATABASE_URL é igual a DATABASE_URL.\n' >&2
  exit 65
fi
[[ "$BATCH_SIZE" =~ ^[1-9][0-9]*$ ]] || { printf 'REHEARSAL_BATCH_SIZE inválido.\n' >&2; exit 64; }
[[ "$POINT_OF_NO_RETURN_SECONDS" =~ ^[1-9][0-9]*$ ]] || { printf 'Ponto de não retorno inválido.\n' >&2; exit 64; }
[[ "$EXPECTED_DELTA_ROWS" =~ ^[0-9]+$ ]] || { printf 'Delta esperado inválido.\n' >&2; exit 64; }
[[ "$DRAIN_SECONDS" =~ ^[0-9]+$ ]] || { printf 'Duração de drenagem inválida.\n' >&2; exit 64; }
[[ "$SYNTHETIC_RATE" =~ ^[0-9]+$ ]] || { printf 'Taxa sintética inválida.\n' >&2; exit 64; }

command -v psql >/dev/null 2>&1 || { printf 'psql não encontrado.\n' >&2; exit 69; }
PSQL=(psql "$REHEARSAL_DATABASE_URL" -X --no-psqlrc -v ON_ERROR_STOP=1)
database_name="$("${PSQL[@]}" -Atqc 'SELECT current_database()')"
[[ "$database_name" == *_rehearsal ]] || { printf 'Recusado: o banco alvo não termina em _rehearsal.\n' >&2; exit 65; }
[[ "$REHEARSAL_CONFIRM" == "$database_name" ]] || { printf 'Recusado: REHEARSAL_CONFIRM não coincide com o banco alvo.\n' >&2; exit 65; }

mkdir -p "$REPORT_DIR"
[[ -w "$REPORT_DIR" ]] || { printf 'Sem permissão de escrita no diretório de relatório: %s\n' "$REPORT_DIR" >&2; exit 73; }
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pardal-workspaces-rehearsal.XXXXXX")"
SYNTH_PID=''
RUN_TOKEN="${BASHPID:-$$}"
cleanup() {
  if [[ -n "$SYNTH_PID" ]]; then
    kill "$SYNTH_PID" 2>/dev/null || true
    wait "$SYNTH_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

set_duration() {
  local stage="$1" value="$2"
  eval "DURATION_${stage}=\$value"
}
get_duration() {
  local stage="$1"
  eval "printf '%s' \"\${DURATION_${stage}:-}\""
}
set_duration drain_observed $((DRAIN_SECONDS * 1000))
now_ms() {
  "${PSQL[@]}" -Atqc "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint"
}
run_sql_file() {
  local stage="$1" file="$2" start finish
  start="$(now_ms)"
  "${PSQL[@]}" -q -f "$file" >"$TMP_DIR/${stage}.log"
  finish="$(now_ms)"
  set_duration "$stage" $((finish - start))
}
capture_metrics() {
  local destination="$1"
  "${PSQL[@]}" -q -f "$SCRIPT_DIR/rehearsal_metrics.sql" >"$destination"
}

printf 'Preflight somente leitura...\n'
preflight_start="$(now_ms)"
capture_metrics "$TMP_DIR/preflight.tsv"
"${PSQL[@]}" -qAt -F $'\t' >"$TMP_DIR/preflight_checks.tsv" <<'SQL'
SELECT 'legacy_orphans',
  (SELECT count(*) FROM company_profiles row LEFT JOIN users u ON u.id = row.user_id WHERE u.id IS NULL) +
  (SELECT count(*) FROM company_tender_fits row LEFT JOIN users u ON u.id = row.user_id WHERE u.id IS NULL) +
  (SELECT count(*) FROM saved_tenders row LEFT JOIN users u ON u.id = row.user_id WHERE u.id IS NULL) +
  (SELECT count(*) FROM saved_searches row LEFT JOIN users u ON u.id = row.user_id WHERE u.id IS NULL) +
  (SELECT count(*) FROM notifications row LEFT JOIN users u ON u.id = row.user_id WHERE u.id IS NULL) +
  (SELECT count(*) FROM email_deliveries row LEFT JOIN users u ON u.id = row.user_id WHERE u.id IS NULL) +
  (SELECT count(*) FROM recommendation_events row LEFT JOIN users u ON u.id = row.user_id WHERE u.id IS NULL) +
  (SELECT count(*) FROM recommendation_dismissals row LEFT JOIN users u ON u.id = row.user_id WHERE u.id IS NULL) +
  (SELECT count(*) FROM recommendation_interest_profiles row LEFT JOIN users u ON u.id = row.user_id WHERE u.id IS NULL) +
  (SELECT count(*) FROM user_recommendations row LEFT JOIN users u ON u.id = row.user_id WHERE u.id IS NULL)
UNION ALL
SELECT 'legacy_duplicates',
  (SELECT count(*) FROM (SELECT user_id, tender_id FROM saved_tenders GROUP BY 1,2 HAVING count(*) > 1) d) +
  (SELECT count(*) FROM (SELECT user_id, query FROM saved_searches WHERE deleted_at IS NULL GROUP BY 1,2 HAVING count(*) > 1) d) +
  (SELECT count(*) FROM (SELECT user_id, dedupe_key FROM notifications GROUP BY 1,2 HAVING count(*) > 1) d);
SQL
PREFLIGHT_FAILURES=0
while IFS=$'\t' read -r check_name failure_count; do
  PREFLIGHT_FAILURES=$((PREFLIGHT_FAILURES + failure_count))
done <"$TMP_DIR/preflight_checks.tsv"
((PREFLIGHT_FAILURES == 0)) || {
  printf 'Preflight reprovado: órfãos ou duplicatas legadas detectados (%s).\n' "$PREFLIGHT_FAILURES" >&2
  exit 70
}
preflight_finish="$(now_ms)"
set_duration preflight $((preflight_finish - preflight_start))

run_sql_file w1 "$SCRIPT_DIR/w1_foundation.sql"
run_sql_file w2 "$SCRIPT_DIR/w2_scope_expand.sql"
run_sql_file w2_indexes "$SCRIPT_DIR/w2_scope_expand_indexes.sql"

synthetic_writer() {
  local sequence=0 pause_seconds
  if ((SYNTHETIC_RATE <= 0)); then return; fi
  pause_seconds=$((60 / SYNTHETIC_RATE))
  ((pause_seconds < 1)) && pause_seconds=1
  while true; do
    sequence=$((sequence + 1))
    "${PSQL[@]}" -q \
      -v synthetic_id="rehearsal_synth_${RUN_TOKEN}_${sequence}" \
      -v synthetic_email="rehearsal+${RUN_TOKEN}-${sequence}@invalid.example" \
      -v synthetic_suffix="${RUN_TOKEN}_${sequence}" >/dev/null <<'SQL'
INSERT INTO users (id, email, name) VALUES (:'synthetic_id', :'synthetic_email', 'REHEARSAL SYNTHETIC')
ON CONFLICT (id) DO NOTHING;
INSERT INTO saved_searches (id, user_id, name, query)
VALUES ('rehearsal_search_' || :'synthetic_suffix', :'synthetic_id', 'REHEARSAL SYNTHETIC', 'REHEARSAL SYNTHETIC')
ON CONFLICT (id) DO NOTHING;
INSERT INTO notifications (id, user_id, type, dedupe_key)
VALUES ('rehearsal_notification_' || :'synthetic_suffix', :'synthetic_id', 'rehearsal_synthetic', 'rehearsal:' || :'synthetic_suffix')
ON CONFLICT (id) DO NOTHING;
SQL
    sleep "$pause_seconds"
  done
}

if ((SYNTHETIC_RATE > 0)); then
  synthetic_writer &
  SYNTH_PID=$!
fi

printf 'W3 lote por faixas de %s usuários...\n' "$BATCH_SIZE"
batch_start="$(now_ms)"
last_user=''
while true; do
  next_user="$("${PSQL[@]}" -v previous="$last_user" -v batch_size="$BATCH_SIZE" -Atq <<'SQL'
SELECT COALESCE(max(id), '')
FROM (SELECT id FROM users WHERE (:'previous' = '' OR id > :'previous') ORDER BY id LIMIT :batch_size) batch;
SQL
)"
  [[ -n "$next_user" ]] || break
  "${PSQL[@]}" -q \
    -v w3_phase=batch -v w3_from_user_id="$last_user" -v w3_to_user_id="$next_user" \
    -f "$SCRIPT_DIR/w3_backfill.sql" >"$TMP_DIR/w3_batch.log"
  last_user="$next_user"
done
batch_finish="$(now_ms)"
set_duration w3_batch $((batch_finish - batch_start))

if [[ -n "$SYNTH_PID" ]]; then
  kill "$SYNTH_PID" 2>/dev/null || true
  wait "$SYNTH_PID" 2>/dev/null || true
  SYNTH_PID=''
fi

capture_metrics "$TMP_DIR/cut_baseline.tsv"

cut_start="$(now_ms)"
if $ABORT_DRILL; then
  printf 'Exercitando aborto antes da troca...\n'
  if ! "${PSQL[@]}" -qAt -F '|' >"$TMP_DIR/cut.log" <<SQL
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE rehearsal_cut_timing AS
  SELECT clock_timestamp() AS cut_started, NULL::timestamptz AS lock_acquired,
    NULL::timestamptz AS delta_started, NULL::timestamptz AS delta_finished,
    NULL::timestamptz AS w4_started, NULL::timestamptz AS w4_finished,
    0::bigint AS delta_rows;
LOCK TABLE users, company_profiles, company_tender_fits, saved_tenders, saved_searches,
  notifications, email_deliveries, email_delivery_notifications, recommendation_events,
  recommendation_dismissals, recommendation_interest_profiles, user_recommendations, ai_jobs
  IN SHARE ROW EXCLUSIVE MODE;
UPDATE rehearsal_cut_timing SET lock_acquired = clock_timestamp();
ROLLBACK;
SQL
  then
    printf 'Abort drill falhou ao adquirir/soltar locks.\n' >&2
    exit 70
  fi
  CUT_STATUS='aborted_expected'
  set_duration w3_delta 0
  set_duration w4 0
  DELTA_ROWS=0
  LOCK_WAIT_MS=$(( $(now_ms) - cut_start ))
else
  printf 'Corte simulado: locks, delta, invariantes, gate e W4...\n'
  if ! "${PSQL[@]}" -qAt -F '|' >"$TMP_DIR/cut.log" <<SQL
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT set_config('rehearsal.point_of_no_return_seconds', '$POINT_OF_NO_RETURN_SECONDS', true);
SELECT set_config('rehearsal.expected_delta_rows', '$EXPECTED_DELTA_ROWS', true);
SELECT set_config('rehearsal.public_error_percent', '$PUBLIC_ERROR_PERCENT', true);
SELECT set_config('rehearsal.public_p95_ratio', '$PUBLIC_P95_RATIO', true);
SELECT set_config('rehearsal.drain_seconds', '$DRAIN_SECONDS', true);
CREATE TEMP TABLE rehearsal_cut_timing AS
  SELECT clock_timestamp() AS cut_started, NULL::timestamptz AS lock_acquired,
    NULL::timestamptz AS delta_started, NULL::timestamptz AS delta_finished,
    NULL::timestamptz AS w4_started, NULL::timestamptz AS w4_finished,
    ((SELECT count(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_user_id = u.id AND w.is_default)) +
     (SELECT count(*) FROM company_tender_fits WHERE workspace_id IS NULL) +
     (SELECT count(*) FROM saved_tenders WHERE workspace_id IS NULL) +
     (SELECT count(*) FROM saved_searches WHERE workspace_id IS NULL) +
     (SELECT count(*) FROM notifications WHERE workspace_id IS NULL) +
     (SELECT count(*) FROM recommendation_events WHERE workspace_id IS NULL) +
     (SELECT count(*) FROM recommendation_dismissals WHERE workspace_id IS NULL) +
     (SELECT count(*) FROM recommendation_interest_profiles WHERE workspace_id IS NULL) +
     (SELECT count(*) FROM user_recommendations WHERE workspace_id IS NULL) +
     (SELECT count(*) FROM ai_jobs WHERE kind = 'fit' AND workspace_id IS NULL))::bigint AS delta_rows;
LOCK TABLE users, company_profiles, company_tender_fits, saved_tenders, saved_searches,
  notifications, email_deliveries, email_delivery_notifications, recommendation_events,
  recommendation_dismissals, recommendation_interest_profiles, user_recommendations, ai_jobs
  IN SHARE ROW EXCLUSIVE MODE;
UPDATE rehearsal_cut_timing SET lock_acquired = clock_timestamp();
UPDATE rehearsal_cut_timing SET delta_started = clock_timestamp();
\set w3_phase delta
\set w3_from_user_id ''
\set w3_to_user_id ''
\set w3_manage_transaction false
\ir $SCRIPT_DIR/w3_backfill.sql
UPDATE rehearsal_cut_timing SET delta_finished = clock_timestamp();
\set invariant_output false
\ir $SCRIPT_DIR/rehearsal_invariants.sql
\ir $SCRIPT_DIR/rehearsal_cut_gate.sql
UPDATE rehearsal_cut_timing SET w4_started = clock_timestamp();
\set w4_manage_transaction false
\ir $SCRIPT_DIR/w4_enforce.sql
UPDATE rehearsal_cut_timing SET w4_finished = clock_timestamp();
SELECT 'CUT_METRICS',
  floor(extract(epoch FROM (lock_acquired - cut_started)) * 1000)::bigint,
  delta_rows,
  floor(extract(epoch FROM (delta_finished - delta_started)) * 1000)::bigint,
  floor(extract(epoch FROM (w4_finished - w4_started)) * 1000)::bigint
FROM rehearsal_cut_timing;
COMMIT;
SQL
  then
    printf 'Corte abortado por lock, gate ou invariantes; nenhuma troca foi confirmada.\n' >&2
    exit 70
  fi
  CUT_STATUS='completed'
  cut_metrics=''
  while IFS= read -r line; do
    [[ "$line" == CUT_METRICS* ]] && cut_metrics="$line"
  done <"$TMP_DIR/cut.log"
  IFS='|' read -r _ LOCK_WAIT_MS DELTA_ROWS W3_DELTA_MS W4_MS <<<"$cut_metrics"
  LOCK_WAIT_MS="${LOCK_WAIT_MS:-0}"
  DELTA_ROWS="${DELTA_ROWS:-0}"
  set_duration w3_delta "${W3_DELTA_MS:-0}"
  set_duration w4 "${W4_MS:-0}"
fi
cut_finish="$(now_ms)"
set_duration cut $((cut_finish - cut_start))

if ! $ABORT_DRILL; then
  capture_metrics "$TMP_DIR/post.tsv"
  "${PSQL[@]}" -q -v invariant_output=true -f "$SCRIPT_DIR/rehearsal_invariants.sql" >"$TMP_DIR/invariants.tsv"
else
  cp "$TMP_DIR/cut_baseline.tsv" "$TMP_DIR/post.tsv"
  printf 'abort_before_switch\ttrue\t0\n' >"$TMP_DIR/invariants.tsv"
fi

RECONCILIATION_FAILURES=0
while IFS=$'\t' read -r baseline_table baseline_count baseline_bytes baseline_checksum; do
  found=false
  while IFS=$'\t' read -r post_table post_count post_bytes post_checksum; do
    [[ "$post_table" == "$baseline_table" ]] || continue
    found=true
    if [[ "$baseline_count" != "$post_count" || "$baseline_checksum" != "$post_checksum" ]]; then
      RECONCILIATION_FAILURES=$((RECONCILIATION_FAILURES + 1))
    fi
    break
  done <"$TMP_DIR/post.tsv"
  if ! $found; then
    RECONCILIATION_FAILURES=$((RECONCILIATION_FAILURES + 1))
  fi
done <"$TMP_DIR/cut_baseline.tsv"
((RECONCILIATION_FAILURES == 0)) || { printf 'Reconciliação de contagem/checksum falhou.\n' >&2; exit 70; }

ROLLBACK_PERFORMED=false
if $ROLLBACK; then
  printf 'Medindo rollback...\n'
  if ! $ABORT_DRILL; then run_sql_file rollback_w4 "$SCRIPT_DIR/w4_enforce_rollback.sql"; fi
  run_sql_file rollback_w3 "$SCRIPT_DIR/w3_backfill_rollback.sql"
  run_sql_file rollback_w2 "$SCRIPT_DIR/w2_scope_expand_rollback.sql"
  run_sql_file rollback_w1 "$SCRIPT_DIR/w1_foundation_rollback.sql"
  if ((SYNTHETIC_RATE > 0)); then
    "${PSQL[@]}" -q -v prefix="rehearsal_synth_${RUN_TOKEN}_%" -c "DELETE FROM users WHERE id LIKE :'prefix'" >/dev/null
  fi
  ROLLBACK_PERFORMED=true
fi

REPORT_JSON="$REPORT_DIR/rehearsal-${RUN_TOKEN}.json"
REPORT_MD="$REPORT_DIR/rehearsal-${RUN_TOKEN}.md"

{
  printf '{\n'
  printf '  "status": "%s",\n' "$CUT_STATUS"
  printf '  "abort_drill": %s,\n' "$ABORT_DRILL"
  printf '  "rollback_performed": %s,\n' "$ROLLBACK_PERFORMED"
  printf '  "lock_wait_ms": %s,\n' "$LOCK_WAIT_MS"
  printf '  "delta_rows": %s,\n' "$DELTA_ROWS"
  printf '  "reconciliation_failures": %s,\n' "$RECONCILIATION_FAILURES"
  printf '  "durations_ms": {\n'
  first=true
  for stage in drain_observed preflight w1 w2 w2_indexes w3_batch w3_delta w4 cut rollback_w4 rollback_w3 rollback_w2 rollback_w1; do
    duration="$(get_duration "$stage")"
    [[ -n "$duration" ]] || continue
    $first || printf ',\n'; first=false
    printf '    "%s": %s' "$stage" "$duration"
  done
  printf '\n  },\n  "tables": [\n'
  first=true
  while IFS=$'\t' read -r table count bytes checksum; do
    $first || printf ',\n'; first=false
    printf '    {"table": "%s", "rows": %s, "bytes": %s}' "$table" "$count" "$bytes"
  done <"$TMP_DIR/preflight.tsv"
  printf '\n  ],\n  "invariants": [\n'
  first=true
  while IFS=$'\t' read -r invariant passed failures; do
    $first || printf ',\n'; first=false
    printf '    {"name": "%s", "passed": %s, "failures": %s}' "$invariant" "$passed" "$failures"
  done <"$TMP_DIR/invariants.tsv"
  printf '\n  ]\n}\n'
} >"$REPORT_JSON"

{
  printf '# Relatório do ensaio de Espaços\n\n'
  printf -- '- Resultado: `%s`\n' "$CUT_STATUS"
  printf -- '- Abort drill: `%s`\n' "$ABORT_DRILL"
  printf -- '- Rollback medido: `%s`\n' "$ROLLBACK_PERFORMED"
  printf -- '- Espera total por locks: `%s ms`\n' "$LOCK_WAIT_MS"
  printf -- '- Tamanho do delta: `%s linhas`\n' "$DELTA_ROWS"
  printf -- '- Falhas de reconciliação: `%s`\n\n' "$RECONCILIATION_FAILURES"
  printf '## Durações\n\n| etapa | ms |\n|---|---:|\n'
  for stage in drain_observed preflight w1 w2 w2_indexes w3_batch w3_delta w4 cut rollback_w4 rollback_w3 rollback_w2 rollback_w1; do
    duration="$(get_duration "$stage")"
    [[ -n "$duration" ]] && printf '| %s | %s |\n' "$stage" "$duration"
  done
  printf '\n## Volume inicial\n\n| tabela | linhas | bytes |\n|---|---:|---:|\n'
  while IFS=$'\t' read -r table count bytes checksum; do printf '| %s | %s | %s |\n' "$table" "$count" "$bytes"; done <"$TMP_DIR/preflight.tsv"
  printf '\n## Invariantes\n\n| invariante | passou | falhas |\n|---|---|---:|\n'
  while IFS=$'\t' read -r invariant passed failures; do printf '| %s | %s | %s |\n' "$invariant" "$passed" "$failures"; done <"$TMP_DIR/invariants.tsv"
} >"$REPORT_MD"

printf 'Relatórios sem dados de linha: %s e %s\n' "$REPORT_MD" "$REPORT_JSON"
