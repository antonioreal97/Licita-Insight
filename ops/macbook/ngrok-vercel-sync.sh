#!/usr/bin/env bash
# Mantém a Vercel apontando para o túnel atual do servidor: quando a URL pública do ngrok muda,
# atualiza API_UPSTREAM_ORIGIN no projeto Vercel e refaz o deploy de produção.
# Instalação e operação: docs/ops/macbook-worker.md (seção "Sincronização ngrok -> Vercel").
set -euo pipefail

PROJECT=${VERCEL_PROJECT:-abriu-la}
TEAM_ID=${VERCEL_TEAM_ID:-team_8LQSHAOMm1NG8hk56W3xGawt}
PUBLIC_URL=${VERCEL_PUBLIC_URL:-https://abriu-la.vercel.app}
TOKEN_FILE=${VERCEL_TOKEN_FILE:-$HOME/.config/licita/vercel-token}
STATE_DIR=${STATE_DIR:-$HOME/.local/state/licita}
STATE_FILE=$STATE_DIR/ngrok-url
API=https://api.vercel.com

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/ngrok-vercel-sync.lock"
flock -n 9 || exit 0  # uma sincronização por vez; o deploy leva ~1 min

ngrok_url=$(curl -fsS --max-time 5 http://127.0.0.1:4040/api/tunnels \
  | jq -r '[.tunnels[] | select(.proto == "https") | .public_url][0] // empty') || true
if [ -z "$ngrok_url" ]; then
  echo "ngrok sem túnel https ativo; nada a sincronizar"
  exit 0
fi

last=$(cat "$STATE_FILE" 2>/dev/null || true)
if [ "$ngrok_url" = "$last" ] && [ "${FORCE:-0}" != 1 ]; then
  exit 0
fi

# Só publica um túnel que já alcança a API.
if ! curl -fsS --max-time 10 -H 'ngrok-skip-browser-warning: 1' "$ngrok_url/api/readyz" >/dev/null; then
  echo "túnel $ngrok_url ainda não responde /api/readyz; nova tentativa no próximo ciclo"
  exit 1
fi
echo "URL do ngrok mudou: ${last:-<desconhecida>} -> $ngrok_url"

if [ "${DRY_RUN:-0}" = 1 ]; then
  echo "DRY_RUN=1: Vercel não alterada"
  exit 0
fi
if [ ! -r "$TOKEN_FILE" ]; then
  echo "token da Vercel ausente em $TOKEN_FILE"
  exit 1
fi
token=$(<"$TOKEN_FILE")
vercel_api() {
  curl -fsS --max-time 30 -H "Authorization: Bearer $token" -H 'Content-Type: application/json' "$@"
}

vercel_api -X POST "$API/v10/projects/$PROJECT/env?teamId=$TEAM_ID&upsert=true" \
  -d "$(jq -n --arg v "$ngrok_url" \
    '{key: "API_UPSTREAM_ORIGIN", value: $v, type: "plain", target: ["production", "preview"]}')" >/dev/null

current=$(vercel_api "$API/v9/projects/$PROJECT?teamId=$TEAM_ID" | jq -r '.targets.production.id // empty')
if [ -z "$current" ]; then
  echo "deploy de produção atual não encontrado no projeto $PROJECT"
  exit 1
fi
deployment=$(vercel_api -X POST "$API/v13/deployments?teamId=$TEAM_ID&forceNew=1" \
  -d "$(jq -n --arg p "$PROJECT" --arg d "$current" \
    '{name: $p, project: $p, deploymentId: $d, target: "production"}')" | jq -r '.id')
echo "redeploy $deployment a partir de $current"

state=""
for _ in $(seq 1 60); do
  state=$(vercel_api "$API/v13/deployments/$deployment?teamId=$TEAM_ID" | jq -r '.readyState')
  case $state in
    READY) break ;;
    ERROR | CANCELED) echo "deploy $deployment terminou em $state"; exit 1 ;;
  esac
  sleep 5
done
if [ "$state" != READY ]; then
  echo "deploy $deployment não ficou READY em 5 min"
  exit 1
fi

sleep 5
if ! curl -fsS --max-time 15 "$PUBLIC_URL/api/readyz" >/dev/null; then
  echo "$PUBLIC_URL/api/readyz falhou após o deploy $deployment"
  exit 1
fi
printf '%s' "$ngrok_url" >"$STATE_FILE"
echo "Vercel sincronizada: $PUBLIC_URL/api -> $ngrok_url (deploy $deployment)"
