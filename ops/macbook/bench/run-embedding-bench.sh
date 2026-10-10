#!/usr/bin/env bash
# Benchmark noturno dos modelos de embedding no hardware do servidor (isolado do app).
# Uso: run-embedding-bench.sh [N_AMOSTRA]   — resultado em ~/licita-monitor/reports/bench-embeddings-<data>.md
set -uo pipefail
N=${1:-1500}
STAMP=$(date +%Y%m%d-%H%M)
WORK=$(mktemp -d /tmp/embed-bench-XXXX)
OUT=~/licita-monitor/reports/bench-embeddings-$STAMP.md
PG=licita-macbook-postgres-1
q(){ docker exec $PG psql -U licita -d licita -Atc "$1"; }
log(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$WORK/log.txt"; }
cleanup(){ docker rm -f ollama-bench >/dev/null 2>&1; docker network rm embed-bench >/dev/null 2>&1; }
trap cleanup EXIT

# Não disputa CPU com a coleta: espera até 45 min se houver coleta ativa com heartbeat recente.
for i in $(seq 1 45); do
  active=$(q "select count(*) from ingest_runs where status='running' and coalesce(heartbeat_at, started_at) > now() - interval '15 minutes'" 2>/dev/null || echo 0)
  [ "${active:-0}" = "0" ] && break; log "coleta ativa ($active); aguardando"; sleep 60
done

log "exportando amostra de $N exemplos rotulados (somente leitura)"
q "select coalesce(json_agg(json_build_object('text', source_text, 'categories', categories)),'[]') from (select source_text, categories from tender_title_examples where array_length(categories,1) > 0 order by md5(text_hash) limit $N) s" > "$WORK/sample.json"
cp "$(dirname "$0")/embedding_bench.py" "$WORK/"

docker network create embed-bench >/dev/null
docker run -d --name ollama-bench --network embed-bench --cpus 2 --memory 2g -e OLLAMA_KEEP_ALIVE=5m -v ollama-bench:/root/.ollama ollama/ollama >/dev/null
sleep 5
for m in bge-m3 embeddinggemma:300m qwen3-embedding:0.6b; do log "pull $m"; docker exec ollama-bench ollama pull "$m" >/dev/null 2>&1 || log "falha no pull de $m"; done

log "medindo (ollama limitado a 2 CPUs / 2 GB)"
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' ollama-bench >> "$WORK/log.txt"
docker run --rm --network embed-bench --cpus 1 --memory 768m -e OLLAMA_URL=http://ollama-bench:11434 -v "$WORK":/work python:3.12-slim \
  sh -c "pip -q install --no-cache-dir numpy >/dev/null 2>&1 && python /work/embedding_bench.py" 2>&1 | tee -a "$WORK/log.txt"
readyz=$(curl -s -o /dev/null -w '%{http_code} %{time_total}s' localhost:24252/api/readyz)

{
  echo "### Benchmark de embeddings no servidor — $(date '+%d/%m/%Y %H:%M')"
  echo "Amostra: $N exemplos rotulados (split 80/20 fixo por hash). Ollama isolado: 2 CPUs, 2 GB. readyz do app durante/depois: $readyz."
  echo; cat "$WORK/report.md" 2>/dev/null || echo "(sem relatório — ver log)"
  echo; echo '<details><summary>log</summary>'; echo; echo '```'; tail -n 40 "$WORK/log.txt"; echo '```'; echo '</details>'
} > "$OUT"
chmod 600 "$OUT"; log "relatório em $OUT"
