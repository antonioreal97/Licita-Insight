#!/usr/bin/env bash
set -euo pipefail

# Publica o frontend compilado deste checkout no projeto Vercel ja vinculado.
# O servidor mantem API_UPSTREAM_ORIGIN; este script nao altera variaveis remotas.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
project_link="${HOME}/abriu-la-vercel/.vercel/project.json"
site_url="https://abriu-la.vercel.app"

if [[ ! -f "$project_link" ]]; then
  printf 'Vinculo Vercel nao encontrado: %s\n' "$project_link" >&2
  exit 1
fi

cd "$repo_root"
pnpm install --frozen-lockfile
PORT=4173 BASE_PATH=/ VITE_API_BASE_URL=/api NODE_ENV=production \
  pnpm --filter @workspace/licitainsight run build

build_dir="$repo_root/artifacts/licitainsight/dist/public"
bundle="$(grep -oE '/assets/index-[^" ]+\.js' "$build_dir/index.html" | sed -n '1p')"
if [[ -z "$bundle" || ! -f "$build_dir${bundle}" ]]; then
  printf 'Bundle do build nao encontrado em %s: %s\n' "$build_dir" "$bundle" >&2
  exit 1
fi

# Isola o upload: somente os arquivos estaticos, middleware, config e IDs do projeto.
deploy_dir="$(mktemp -d)"
trap 'rm -rf "$deploy_dir"' EXIT
cp -R "$build_dir" "$deploy_dir/public"
cp "$repo_root/ops/vercel/middleware.js" "$repo_root/ops/vercel/vercel.json" "$deploy_dir/"
mkdir -p "$deploy_dir/.vercel"
cp "$project_link" "$deploy_dir/.vercel/project.json"

deployment_url="$(cd "$deploy_dir" && npx vercel@latest deploy --prod --yes --scope antonios-projects-a309777c)"
printf 'Deployment: %s\nBundle gerado: %s\n' "$deployment_url" "$bundle"

# Aguarda a atualizacao do alias antes de validar o HTML e a API publica.
for attempt in {1..12}; do
  live_bundle="$(curl -fsS "$site_url/" | grep -oE '/assets/index-[^" ]+\.js' | sed -n '1p')"
  if [[ "$live_bundle" == "$bundle" ]]; then
    break
  fi
  if [[ "$attempt" -eq 12 ]]; then
    printf 'Alias ainda referencia %s; esperado: %s\n' "$live_bundle" "$bundle" >&2
    exit 1
  fi
  sleep 5
done

ready_status="$(curl -sS -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0 Chrome/130' "$site_url/api/readyz")"
transparency_response="$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' "$site_url/transparencia")"
printf 'Alias: %s (%s)\n/api/readyz: %s\n/transparencia: %s\n' \
  "$site_url" "$live_bundle" "$ready_status" "$transparency_response"
if [[ "$ready_status" != 200 || "$transparency_response" != 200\ text/html* ]]; then
  printf 'Validacao HTTP do deploy falhou.\n' >&2
  exit 1
fi
