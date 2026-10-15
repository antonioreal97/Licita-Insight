# Ensaio definitivo do corte de Espaços

A ferramenta executável está em [`ops/workspaces/`](../../workspaces/). Esta pasta mede **o mesmo W3 lote, W3 delta, cópia reversa e W4** da ferramenta definitiva. Os arquivos `w1_*`, `w2_*`, `w3_backfill.sql`, `w4_enforce.sql` e seus rollbacks nesta pasta são rascunhos históricos; `run-rehearsal.sh` não os executa. Nenhuma migração foi autorizada em produção.

O dono restaura um backup verificado num banco descartável com sufixo `_rehearsal`, aplica 0043 da `main`, W1 0044 e W2 0045 conforme os [procedimentos](../../../docs/migrations/0044-workspaces-foundation.md) e [W2](../../../docs/migrations/0045-workspace-scope-expand.md), e só então roda o ensaio. Não se usa o banco da aplicação nem uma réplica que receba tráfego. Faça dois restores independentes e compare o pior tempo.

## Medição

`run-rehearsal.sh` exige uma instância **nova** da API apontada apenas à cópia. A instância usa `APP_ROLE=api`, `NODE_ENV=development`, `AUTH_DEV_LOGIN=true`, `BILLING_DEV_ENTITLED=true`, sem chaves de Asaas, IA ou e-mail e com as agendas de PNCP, cultura e transparência desligadas. A porta só executa consultas e mutações sintéticas. O script faz:

1. login sintético e sondas de busca pública, leitura v1 e mutação de preferência;
2. W3 lote fora da janela, depois `pause` → drenagem → W3 delta/invariantes → `cut` → leitura v1 → `resume`;
3. `rollback` com cópia reversa, e uma segunda virada completa;
4. opcionalmente uma **segunda janela** `pause` → W4 → `resume` na cópia; a exceção ao relógio de 7 dias só funciona com nome terminado em `_rehearsal`;
5. relatório `timings.tsv` e `invariants.tsv` com nomes de etapas, contagens e tempos. Arquivos de sonda, cookie e logs SQL são temporários e apagados. Nenhum e-mail, termo, nome, id de conta ou texto de perfil entra no relatório.

A sonda falha se a busca pública superar 1% de erro ou 2× o p95 medido antes da pausa, se a leitura v1 não responder depois da troca, ou se não houver uma mutação bem sucedida depois da retomada. `cutover.sh` aplica ainda o limite de 3 minutos de drenagem, 5 segundos de lock por tabela, delta de 3× a taxa esperada e ponto de não retorno T+10 min. A sonda registra `503 MAINTENANCE_IN_PROGRESS` no total e por minuto, p95 público, p95 das mutações antes e depois da pausa, e o intervalo até a primeira mutação no modelo novo. O intervalo da sonda tem precisão de um segundo; a duração do SQL é medida em milissegundos.

## Servidor com Docker Compose: comandos do dono

Os nomes abaixo seguem o servidor descrito no runbook atual. O dono confere `docker ps -a` e os nomes reais antes de executar. Os agentes não entram no servidor nem no banco. O restore compartilha disco com produção: confira espaço livre maior que 3× o tamanho do banco e execute fora das coletas.

```zsh
# No checkout que contém este PR, após o backup/restore validado pelo dono:
export CUTOVER_REPO_ROOT="$PWD"
export CUTOVER_POSTGRES_CONTAINER=licita-macbook-postgres-1
export REHEARSAL_CONFIRM=licita_spaces_01_rehearsal
export REHEARSAL_DATABASE_URL="postgresql://licita@localhost:5432/$REHEARSAL_CONFIRM"
export CUTOVER_DATABASE_URL="$REHEARSAL_DATABASE_URL"
export CUTOVER_CONFIRM_DB="$REHEARSAL_CONFIRM"
export CUTOVER_PSQL_BIN="$PWD/ops/rehearsal/workspaces/psql-docker.sh"
read -rs 'CUTOVER_PGPASSWORD?Senha do PostgreSQL: '; echo
export CUTOVER_PGPASSWORD

# Cópia isolada, criada pelo dono depois de conferir disco e backup:
docker exec "$CUTOVER_POSTGRES_CONTAINER" createdb -U licita "$REHEARSAL_CONFIRM"
docker exec -i "$CUTOVER_POSTGRES_CONTAINER" pg_restore -U licita -d "$REHEARSAL_CONFIRM" \
  --no-owner --exit-on-error < /caminho/backup-validado.dump

# Aplicar 0044/0045 na cópia conforme docs/migrations; conferir W1/W2:
ops/workspaces/cutover.sh status
```

A imagem da API deve ser a do checkout da Fase 1. No servidor que usa outro arquivo Compose, passe o `-f` correspondente nos dois comandos `docker compose`. Para a instância de sonda, obtenha imagem e rede do Compose e crie um contêiner independente, sem montar `.env`:

```zsh
docker compose build api
API_IMAGE="$(docker compose images -q api)"
DB_NETWORK="$(docker inspect "$CUTOVER_POSTGRES_CONTAINER" --format '{{range $name, $net := .NetworkSettings.Networks}}{{$name}}{{end}}')"
export REHEARSAL_APP_BASE_URL=http://localhost:3031
export REHEARSAL_APP_ORIGIN="$REHEARSAL_APP_BASE_URL"
export REHEARSAL_SESSION_SECRET="$(openssl rand -hex 32)"
export DATABASE_URL="postgresql://licita:$CUTOVER_PGPASSWORD@postgres:5432/$REHEARSAL_CONFIRM"
docker run -d --name licita-spaces-rehearsal-api --network "$DB_NETWORK" -p 3031:3031 \
  -e DATABASE_URL -e REHEARSAL_SESSION_SECRET \
  -e APP_ROLE=api -e NODE_ENV=development -e PORT=3031 \
  -e PUBLIC_APP_ORIGIN="$REHEARSAL_APP_ORIGIN" -e AUTH_DEV_LOGIN=true \
  -e BILLING_DEV_ENTITLED=true -e PNCP_DAILY_COLLECT=false \
  -e CULTURE_DAILY_COLLECT=false -e TRANSPARENCY_DAILY_COLLECT=false \
  "$API_IMAGE" sh -c 'SESSION_SECRET="$REHEARSAL_SESSION_SECRET" pnpm --filter @workspace/api-server run dev'

export REHEARSAL_EXPECTED_DELTA_ROWS=100  # substituir pela taxa observada no horário
export REHEARSAL_MEASURE_W4=true
ops/rehearsal/workspaces/run-rehearsal.sh --report-dir "$PWD/reports/workspaces-copy-01"
```

No `docker run`, a senha está numa variável de ambiente, sem entrar nos argumentos da linha de comando. A URL não é registrada nos relatórios. O valor de `REHEARSAL_EXPECTED_DELTA_ROWS` acima é **exemplo**, não parâmetro aprovado; o dono substitui pelo cálculo da taxa local. Não rode o ensaio se a busca pública receber `429`: reduza a taxa da sonda e repita em novo restore.

Depois do ensaio, o dono para e remove só a instância de sonda, remove a cópia isolada após guardar relatórios sanitizados, e limpa as variáveis:

```zsh
docker rm -f licita-spaces-rehearsal-api
unset DATABASE_URL CUTOVER_PGPASSWORD REHEARSAL_SESSION_SECRET
```

O segundo restore tem outro nome `_rehearsal` e diretório de relatório. W4 de produção continua [bloqueada por sete dias de observação e aprovação própria](../../../docs/migrations/workspace-w3-w4-production.md).
