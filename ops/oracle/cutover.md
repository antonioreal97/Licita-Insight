# Roteiro de corte para a Oracle A1

Pré-condições: o ensaio de restauração passou; `compose.oracle.yml` está saudável; a A1 tem Tailscale; o servidor local alcança `${ORACLE_TAILSCALE_IP}:5432`; 5432 não responde pela internet; e o TTL do DNS foi reduzido com antecedência. Substitua os exemplos, não registre segredos no shell history e mantenha o banco atual intacto durante toda a janela.

## 1. Abrir a janela e congelar escrita de jobs

1. Registrar horário, responsável, commit implantado e contagens de referência (`tenders`, `users`, `cultural_opportunities`).
2. Parar apenas o worker no servidor local: `docker compose stop worker`. Confirmar que não há coleta/IA em execução consultando `job_run_audit` e `ingest_runs`.
3. Colocar a API atual em manutenção ou somente leitura para impedir escritas após o dump final. O tráfego de leitura pode continuar até a troca.

## 2. Dump e restauração finais

No host do banco atual:

```bash
umask 077
pg_dump --format=custom --compress=6 --no-owner --no-acl \
  "$DATABASE_URL" > /var/tmp/licitainsight-cutover.dump
pg_restore --list /var/tmp/licitainsight-cutover.dump >/dev/null
```

Copiar o arquivo para a A1 somente pela rede Tailscale e restaurar no volume novo:

```bash
scp /var/tmp/licitainsight-cutover.dump oracle-a1:/var/tmp/
ssh oracle-a1 'cd /opt/pardal && ops/oracle/restore-rehearsal.sh /var/tmp/licitainsight-cutover.dump'
```

Depois do ensaio final, restaurar no banco de destino vazio com `pg_restore --exit-on-error --clean --if-exists --no-owner --no-acl`. Este é o único passo destrutivo e deve usar a `DATABASE_URL` da A1 já conferida, nunca a origem. O histórico Drizzle de produção diverge do repositório, portanto migrações continuam manuais, uma a uma e em transação, conforme `docs/migrations/`; o Compose não as aplica. Depois de conferir o schema, subir a stack:

```bash
docker compose --env-file .env.oracle -f compose.oracle.yml up -d --build
docker compose --env-file .env.oracle -f compose.oracle.yml ps
```

## 3. Conferir e trocar o tráfego

1. Comparar contagens e máximos de `created_at` entre origem e destino. Conferir login Google, busca, detalhe, oportunidades, cobrança e `/api/readyz` pela A1.
2. Apontar a borda/DNS para o proxy HTTPS da A1. A borda antiga pode permanecer disponível como fallback, sem receber escrita.
3. Acompanhar por 15 minutos: erros HTTP, latência p50/p95, conexões e CPU/memória do Postgres.
4. Encerrar o modo manutenção somente depois das conferências.

## 4. Religar o processamento pesado local

No servidor local, ajustar sem publicar credenciais:

```dotenv
APP_ROLE=worker
WORKER_JOBS=heavy
DATABASE_URL=postgresql://...@<IP_TAILSCALE_DA_A1>:5432/licitainsight?sslmode=disable
OLLAMA_BASE_URL=http://ollama:11434
```

Recriar apenas o worker e observar o primeiro ciclo. `tryRunSingletonJob` usa advisory lock no PostgreSQL compartilhado, portanto dois processos não executam simultaneamente a mesma chave; o agrupamento evita também que os dois lados disputem os mesmos schedulers.

## 5. Conferências finais

- Criar uma busca salva de teste e confirmar avaliação/notificação pelo worker leve da A1.
- Confirmar uma coleta pequena e um documento/OCR pelo worker pesado local.
- Rodar `ops/oracle/backup-to-local.sh`, conferir o arquivo no servidor local e executar `pg_restore --list` nele.
- Guardar métricas, contagens, logs e o dump final. Remover `/var/tmp/licitainsight-cutover.dump` dos dois hosts após a retenção acordada.

## Rollback

Se houver corrupção, erro funcional grave ou p95 acima do limite por 15 minutos: ativar manutenção, parar os dois workers, apontar a borda para a API antiga e reabrir a origem. Não tente mesclar escritas automaticamente. Exporte as escritas ocorridas na A1 após o corte, preserve ambos os bancos e reconcilie-as em uma nova janela. O ponto de retorno simples termina quando a API nova volta a aceitar escrita; por isso a validação deve acontecer antes dessa abertura.
