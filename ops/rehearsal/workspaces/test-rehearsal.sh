#!/usr/bin/env bash
# RASCUNHO DE ENSAIO — NÃO É FERRAMENTA AUTORIZADA PARA PRODUÇÃO.
# Integração destrutiva somente em bancos temporários derivados de PNCP_TEST_DATABASE_URL.

set -Eeuo pipefail

if [[ -z "${PNCP_TEST_DATABASE_URL:-}" ]]; then
  printf 'SKIP: defina PNCP_TEST_DATABASE_URL para criar o banco temporário do ensaio.\n'
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RUN_TOKEN="${BASHPID:-$$}"
TEST_DB="workspaces_${RUN_TOKEN}_rehearsal"
UNSAFE_DB="workspaces_${RUN_TOKEN}_unsafe"
BASE_WITHOUT_QUERY="${PNCP_TEST_DATABASE_URL%%\?*}"
QUERY_SUFFIX="${PNCP_TEST_DATABASE_URL#"$BASE_WITHOUT_QUERY"}"
SERVER_PREFIX="${BASE_WITHOUT_QUERY%/*}"
TEST_URL="${SERVER_PREFIX}/${TEST_DB}${QUERY_SUFFIX}"
UNSAFE_URL="${SERVER_PREFIX}/${UNSAFE_DB}${QUERY_SUFFIX}"
REPORT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/workspaces-rehearsal-reports.XXXXXX")"

drop_database() {
  local name="$1"
  psql "$PNCP_TEST_DATABASE_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 -q -v database_name="$name" <<'SQL' || true
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :'database_name' AND pid <> pg_backend_pid();
SELECT format('DROP DATABASE IF EXISTS %I', :'database_name') \gexec
SQL
}
cleanup() {
  drop_database "$TEST_DB"
  drop_database "$UNSAFE_DB"
  rm -rf "$REPORT_DIR"
}
trap cleanup EXIT INT TERM

create_database() {
  local name="$1"
  psql "$PNCP_TEST_DATABASE_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 -q -v database_name="$name" <<'SQL'
SELECT format('CREATE DATABASE %I', :'database_name') \gexec
SQL
}

create_database "$TEST_DB"
create_database "$UNSAFE_DB"

printf 'Aplicando migrações atuais no banco temporário...\n'
(cd "$REPO_ROOT" && DATABASE_URL="$TEST_URL" pnpm --filter @workspace/db run migrate >/dev/null)
PSQL=(psql "$TEST_URL" -X --no-psqlrc -v ON_ERROR_STOP=1)

"${PSQL[@]}" -q <<'SQL'
INSERT INTO users (id, email, name) VALUES
  ('user_none', 'none@example.invalid', 'Fictício sem perfil'),
  ('user_complete', 'complete@example.invalid', 'Fictício completo'),
  ('user_incomplete', 'incomplete@example.invalid', 'Fictício incompleto'),
  ('user_heavy', 'heavy@example.invalid', 'Fictício volumoso'),
  ('user_anon', 'anon+deleted@example.invalid', 'ANONYMIZED'),
  ('user_deleted', 'deleted@example.invalid', 'Será excluído');
DELETE FROM users WHERE id = 'user_deleted';

INSERT INTO company_profiles (
  user_id, description, offerings, exclusions, selected_categories, selected_keywords,
  excluded_keywords, registered_platforms, coverage_scope, coverage_states,
  coverage_regions, coverage_municipalities, headquarters_municipality_ibge,
  coverage_radius_km, coverage_mode, accepts_remote, value_min, value_max, size, version
) VALUES
  ('user_complete', 'Perfil fictício completo para compras públicas.', '["Manutenção predial"]', '["Armas"]', '["servicos"]', '["Pintura"]', '["bélico"]', '["Compras.gov.br"]', 'custom', '["SP"]', '["southeast"]', '["3550308"]', '3550308', 50, 'strict', true, 100, 10000, 'me_epp', 3),
  ('user_incomplete', 'Perfil fictício incompleto para compras públicas.', '[]', '[]', '[]', '[]', '[]', '[]', 'national', '[]', '[]', '[]', NULL, NULL, 'prioritize', false, NULL, NULL, 'other', 1),
  ('user_heavy', 'Perfil fictício volumoso para compras públicas.', '["Tecnologia"]', '[]', '[]', '["Software"]', '[]', '[]', 'national', '[]', '[]', '[]', NULL, NULL, 'strict', false, NULL, NULL, 'cooperative', 2);

INSERT INTO tenders (
  id, pncp_control_number, title, organization_id, organization_name, modality,
  modality_label, status, estimated_value_status, source_id, source_name,
  search_text, title_norm, object_norm, items_norm, organization_norm,
  other_norm, raw_payload, fetched_at
)
SELECT
  'tender_' || n, 'pncp-ficticio-' || n, 'Edital fictício ' || n,
  'org_ficticia', 'Órgão fictício', 'pregao', 'Pregão', 'open', 'unknown',
  'fonte_ficticia_' || n, 'Fonte fictícia', 'conteúdo fictício', 'edital ficticio',
  '', '', 'orgao ficticio', '', '{}'::jsonb, now()
FROM generate_series(1, 25) n;

INSERT INTO saved_tenders (user_id, tender_id, monitored, protocol, next_action)
SELECT 'user_heavy', 'tender_' || n, n % 2 = 0, 'PROTOCOLO FICTÍCIO', 'AÇÃO FICTÍCIA'
FROM generate_series(1, 20) n;
INSERT INTO saved_searches (id, user_id, name, query, alerts_enabled, new_matches_count)
SELECT 'search_' || n, 'user_heavy', 'Busca fictícia ' || n, 'termo fictício ' || n, true, n
FROM generate_series(1, 20) n;
INSERT INTO notifications (id, user_id, type, dedupe_key, saved_search_query)
SELECT 'notification_' || n, 'user_heavy', 'saved_search_matches', 'dedupe-ficticio-' || n, 'termo secreto fictício ' || n
FROM generate_series(1, 20) n;
INSERT INTO email_deliveries (
  id, user_id, mode, dedupe_key, recipient_email, subject, html_body, text_body
) VALUES (
  'delivery_1', 'user_heavy', 'digest', 'delivery-ficticio-1', 'recipient-secret@example.invalid',
  'Assunto fictício sigiloso', '<p>corpo fictício</p>', 'corpo fictício'
);
INSERT INTO email_delivery_notifications (delivery_id, notification_id)
VALUES ('delivery_1', 'notification_1');
INSERT INTO recommendation_events (user_id, type, normalized_terms)
VALUES ('user_heavy', 'search', '["termo-ultrassecreto"]');
INSERT INTO recommendation_dismissals (user_id, tender_id) VALUES ('user_heavy', 'tender_1');
INSERT INTO recommendation_interest_profiles (user_id, profile)
VALUES ('user_heavy', '{"terms":[{"value":"legado","weight":1}],"legacy":true}');
INSERT INTO user_recommendations (user_id, tender_id, rank, score)
VALUES ('user_heavy', 'tender_2', 1, 0.8);
INSERT INTO ai_jobs (id, kind, dedupe_key, tender_id, user_id, lane)
VALUES ('fit_job_1', 'fit', 'fit-ficticio-1', 'tender_1', 'user_heavy', 'batch');
SQL

assert_sql() {
  local expected="$1" query="$2" actual
  actual="$("${PSQL[@]}" -Atqc "$query")"
  [[ "$actual" == "$expected" ]] || {
    printf 'ASSERT falhou: esperado=%s obtido=%s query=%s\n' "$expected" "$actual" "$query" >&2
    exit 1
  }
}

printf 'Aplicando W1–W3 com usuário e escrita entre lote e delta...\n'
"${PSQL[@]}" -q -f "$SCRIPT_DIR/w1_foundation.sql" >/dev/null
"${PSQL[@]}" -q -f "$SCRIPT_DIR/w2_scope_expand.sql" >/dev/null
"${PSQL[@]}" -q -f "$SCRIPT_DIR/w2_scope_expand_indexes.sql" >/dev/null
"${PSQL[@]}" -q -v w3_phase=batch -f "$SCRIPT_DIR/w3_backfill.sql" >/dev/null

"${PSQL[@]}" -q <<'SQL'
INSERT INTO users (id, email, name) VALUES ('user_delta', 'delta@example.invalid', 'Fictício no delta');
INSERT INTO saved_searches (id, user_id, name, query)
VALUES ('search_delta', 'user_delta', 'Busca criada no delta', 'termo criado no delta');
SQL
"${PSQL[@]}" -q -v w3_phase=delta -f "$SCRIPT_DIR/w3_backfill.sql" >/dev/null

assert_sql complete "SELECT onboarding_status FROM workspaces WHERE owner_user_id = 'user_complete'"
assert_sql in_progress "SELECT onboarding_status FROM workspaces WHERE owner_user_id = 'user_incomplete'"
assert_sql not_started "SELECT onboarding_status FROM workspaces WHERE owner_user_id = 'user_none'"
assert_sql 6 "SELECT count(*) FROM workspaces WHERE is_default"
assert_sql 6 "SELECT count(*) FROM workspace_members WHERE role = 'owner'"
assert_sql 0 "SELECT count(*) FROM workspaces WHERE owner_user_id = 'user_deleted'"
assert_sql 20 "SELECT count(*) FROM saved_tenders WHERE user_id = 'user_heavy' AND workspace_id IS NOT NULL"
assert_sql 21 "SELECT count(*) FROM saved_searches WHERE workspace_id IS NOT NULL"
assert_sql 20 "SELECT count(*) FROM notifications WHERE workspace_id IS NOT NULL"
assert_sql 1 "SELECT count(*) FROM workspace_profile_signals WHERE kind = 'municipality' AND value = '3550308'"
assert_sql 1 "SELECT count(*) FROM ai_jobs WHERE kind = 'fit' AND workspace_id IS NOT NULL"
assert_sql 1 "SELECT count(*) FROM email_delivery_notifications WHERE workspace_id IS NOT NULL"
assert_sql 1 "SELECT count(*) FROM workspaces WHERE owner_user_id = 'user_anon'"

state_before_second="$("${PSQL[@]}" -Atq <<'SQL'
SELECT md5(string_agg(digest, '' ORDER BY digest)) FROM (
  SELECT md5(to_jsonb(row)::text) digest FROM workspaces row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM workspace_members row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM workspace_profiles row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM workspace_profile_signals row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM saved_tenders row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM saved_searches row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM notifications row
) state;
SQL
)"
"${PSQL[@]}" -q -v w3_phase=delta -f "$SCRIPT_DIR/w3_backfill.sql" >/dev/null
state_after_second="$("${PSQL[@]}" -Atq <<'SQL'
SELECT md5(string_agg(digest, '' ORDER BY digest)) FROM (
  SELECT md5(to_jsonb(row)::text) digest FROM workspaces row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM workspace_members row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM workspace_profiles row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM workspace_profile_signals row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM saved_tenders row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM saved_searches row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM notifications row
) state;
SQL
)"
[[ "$state_before_second" == "$state_after_second" ]] || { printf 'W3 não foi idempotente.\n' >&2; exit 1; }

"${PSQL[@]}" -q -f "$SCRIPT_DIR/w4_enforce.sql" >/dev/null
"${PSQL[@]}" -q -v invariant_output=true -f "$SCRIPT_DIR/rehearsal_invariants.sql" >/dev/null
assert_sql 0 "SELECT count(*) FROM saved_searches WHERE workspace_id IS NULL"
assert_sql 0 "SELECT count(*) FROM pg_constraint WHERE conname IN ('saved_tenders_user_id_tender_id_pk','recommendation_dismissals_user_id_tender_id_pk','recommendation_interest_profiles_pkey','user_recommendations_user_id_tender_id_pk')"

printf 'Validando rollback completo...\n'
"${PSQL[@]}" -q -f "$SCRIPT_DIR/w4_enforce_rollback.sql" >/dev/null
"${PSQL[@]}" -q -f "$SCRIPT_DIR/w3_backfill_rollback.sql" >/dev/null
"${PSQL[@]}" -q -f "$SCRIPT_DIR/w2_scope_expand_rollback.sql" >/dev/null
"${PSQL[@]}" -q -f "$SCRIPT_DIR/w1_foundation_rollback.sql" >/dev/null
assert_sql t "SELECT to_regclass('public.workspaces') IS NULL"
assert_sql 20 "SELECT count(*) FROM saved_tenders WHERE user_id = 'user_heavy'"

printf 'Validando guarda de sufixo...\n'
if REHEARSAL_DATABASE_URL="$UNSAFE_URL" REHEARSAL_CONFIRM="$UNSAFE_DB" "$SCRIPT_DIR/run-rehearsal.sh" --abort-drill >/dev/null 2>&1; then
  printf 'A guarda aceitou banco sem sufixo _rehearsal.\n' >&2
  exit 1
fi

printf 'Validando abort drill, legado intacto e relatório sanitizado...\n'
abort_before="$("${PSQL[@]}" -Atq <<'SQL'
SELECT md5(string_agg(digest, '' ORDER BY digest)) FROM (
  SELECT md5(to_jsonb(row)::text) digest FROM users row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM company_profiles row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM saved_tenders row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM saved_searches row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM notifications row
) legacy;
SQL
)"
REHEARSAL_DATABASE_URL="$TEST_URL" \
REHEARSAL_CONFIRM="$TEST_DB" \
REHEARSAL_REPORT_DIR="$REPORT_DIR" \
"$SCRIPT_DIR/run-rehearsal.sh" --abort-drill --rollback >/dev/null
abort_after="$("${PSQL[@]}" -Atq <<'SQL'
SELECT md5(string_agg(digest, '' ORDER BY digest)) FROM (
  SELECT md5(to_jsonb(row)::text) digest FROM users row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM company_profiles row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM saved_tenders row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM saved_searches row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM notifications row
) legacy;
SQL
)"
[[ "$abort_before" == "$abort_after" ]] || { printf 'Abort drill alterou conteúdo legado.\n' >&2; exit 1; }
assert_sql t "SELECT to_regclass('public.workspaces') IS NULL"

printf 'Validando fluxo completo da ferramenta com rollback...\n'
REHEARSAL_DATABASE_URL="$TEST_URL" \
REHEARSAL_CONFIRM="$TEST_DB" \
REHEARSAL_REPORT_DIR="$REPORT_DIR" \
"$SCRIPT_DIR/run-rehearsal.sh" --rollback >/dev/null
full_after="$("${PSQL[@]}" -Atq <<'SQL'
SELECT md5(string_agg(digest, '' ORDER BY digest)) FROM (
  SELECT md5(to_jsonb(row)::text) digest FROM users row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM company_profiles row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM saved_tenders row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM saved_searches row
  UNION ALL SELECT md5(to_jsonb(row)::text) FROM notifications row
) legacy;
SQL
)"
[[ "$abort_before" == "$full_after" ]] || { printf 'Fluxo completo com rollback alterou conteúdo legado.\n' >&2; exit 1; }
assert_sql t "SELECT to_regclass('public.workspaces') IS NULL"

for report in "$REPORT_DIR"/*.json "$REPORT_DIR"/*.md; do
  content="$(<"$report")"
  [[ ! "$content" =~ [[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,} ]] || { printf 'Relatório contém e-mail.\n' >&2; exit 1; }
  [[ "$content" != *user_heavy* && "$content" != *tender_1* && "$content" != *termo-ultrassecreto* && "$content" != *recipient-secret* ]] || {
    printf 'Relatório contém id ou conteúdo de linha.\n' >&2; exit 1
  }
done

printf 'OK: W1–W4, delta, idempotência, invariantes, abort drill, rollback, guardas e sanitização.\n'
