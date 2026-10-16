# Migração Oracle — etapa 0

Data-base: 16/10/2026. Este plano prepara a migração sem criar recursos, acessar produção ou mover dados. A execução depende do dono nos pontos indicados.

## Arquitetura alvo

```text
clientes/Vercel
      |
      | HTTPS 443
      v
Oracle sa-saopaulo-1 / A1 ARM
  Nginx (única borda pública) -> API -> PostgreSQL 16 + pgvector
                                   \-> worker light
      ^                                  |
      | Tailscale (5432, privado)         | advisory locks no mesmo Postgres
      |
servidor local Ubuntu
  worker heavy -> coletores, documentos/OCR, Ollama, categorizações e backfills
  backup diário recebido da Oracle
```

Na A1 ficam o PostgreSQL, a API, os arquivos estáticos, o proxy HTTPS e os jobs leves que precisam ficar disponíveis continuamente. No servidor local ficam PNCP, Transparência, Cultura, Fomento e fontes internacionais; download/leitura de documentos, OCR, fila de IA, professor/aluno no Ollama, categorização, vocabulário de perfil e backfills. O servidor local também recebe o dump diário. A VM E2 atual permanece apenas durante o ensaio e como retorno rápido; depois da estabilização pode ser desligada para liberar seu boot volume.

A API e o worker leve são processos separados. `APP_ROLE=api` não agenda jobs; `APP_ROLE=worker` com `WORKER_JOBS=light` não serve a API e agenda apenas rotinas leves. O servidor local usa `APP_ROLE=worker` e `WORKER_JOBS=heavy`. O padrão de `WORKER_JOBS` é `all`, preservando o comportamento anterior e a ordem original de inicialização.

## Custo e capacidade

O objetivo operacional é custo zero. Na tabela pública da Oracle para contas pagas, os primeiros 3.000 OCPU-h e 18.000 GB-h mensais de A1 são gratuitos; 4 OCPU e 24 GB durante um mês de 31 dias consomem 2.976 OCPU-h e 17.856 GB-h. A franquia e a indicação **Always Free eligible / custo estimado zero** precisam ser conferidas no console imediatamente antes da criação, pois limites e elegibilidade podem mudar. Referências: [OCI Price List](https://www.oracle.com/cloud/price-list/) e [Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

Os 200 GB gratuitos de block/boot volume são compartilhados. Com o boot atual de 45 GB, reservar 50 GB para o boot A1 e 100 GB para o volume de dados soma 195 GB. Não aumentar tamanho, desempenho/VPU, backups de volume ou quantidade de volumes sem conferir que o total permanece gratuito. O banco medido em 2,7 GB cabe com margem no volume de 100 GB; alertar em 70% e 85% de ocupação.

A conversão para PAYG reduz o risco de recolhimento de instâncias gratuitas ociosas e libera a franquia publicada para tenancy paga, mas permite criar recursos cobrados. O orçamento de R$ 1 é um **alerta, não um bloqueio de gastos**. Por isso a defesa é conjunta: orçamento, alertas de gasto real e previsto, conferência de custo estimado zero, limite de volumes e revisão diária de Cost Analysis na primeira semana. A Oracle informa que recursos Always Free ociosos podem ser recuperados; API e banco reais devem produzir uso contínuo, mas backup e rollback continuam obrigatórios. Referência: [OCI Budgets](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm).

## Rede e segurança

- Somente o Nginx da A1 recebe internet em TCP 80/443. A porta 80 apenas redireciona para HTTPS.
- PostgreSQL escuta no endereço Tailscale da A1, com bind explícito `${ORACLE_TAILSCALE_IP}:5432`; não existe regra de Security List ou firewall público para 5432. O usuário do banco do worker local deve ter apenas os privilégios necessários.
- SSH administrativo ocorre por Tailscale. Não abrir TCP 22 para `0.0.0.0/0`.
- Liberar UDP 41641 na Security List e no firewall da A1 para tentar conexão Tailscale direta. Validar com `tailscale ping <servidor-local>`; o resultado desejado é `via <ip>:41641`, não `via DERP(sao)`. Se NAT impedir conexão direta, o corte continua possível, mas a latência do worker e do backup deve ser medida.
- TLS termina no Nginx. Certificados ficam fora do repositório, montados somente para leitura. Segredos ficam em `.env.oracle` com modo `0600`.
- O tráfego entre worker local e banco usa apenas a tailnet. Testar de uma rede externa que `nc -vz <IP_PUBLICO_A1> 5432` falha.

## Grupos de schedulers

`tryRunSingletonJob` abre uma conexão dedicada, usa `pg_try_advisory_lock(hashtextextended(jobKey, 0))`, registra a execução e libera o lock no `finally`. Como os dois workers usam o mesmo PostgreSQL, uma mesma chave não roda simultaneamente entre processos. O agrupamento evita disputa normal; o lock continua como proteção em deploys e transições.

| Scheduler de `startSchedulers()`       | Grupo | Local          | Justificativa                                                                                                                                     |
| -------------------------------------- | ----- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startAiJobWorker`                     | heavy | servidor local | Consome documentos/IA e pode chamar OCR e Ollama.                                                                                                 |
| `startAiDocumentRetentionScheduler`    | light | Oracle         | Limpeza curta no banco, sem modelo ou download.                                                                                                   |
| `startTrialNotificationScheduler`      | light | Oracle         | Cria notificações de expiração; precisa de continuidade.                                                                                          |
| `startEmailNotificationJobs`           | light | Oracle         | E-mail imediato/digest, buscas salvas e alertas de perfil; o cálculo pesado enfileirado continua no AI worker local.                              |
| `startAiRetentionScheduler`            | light | Oracle         | Retenção de perguntas/respostas, operação de banco.                                                                                               |
| `startDocumentRetryJob`                | heavy | servidor local | Reprocessa documentos e depende do pipeline de extração/OCR.                                                                                      |
| `startDailyPncpCollect`                | heavy | servidor local | Coleta volumosa e transferência de dados.                                                                                                         |
| `startDailyTransparencyCollect`        | heavy | servidor local | Coleta externa e normalização em lote.                                                                                                            |
| `startTenderDeadlineReconciliation`    | light | Oracle         | Conciliação frequente e pequena de prazos no banco.                                                                                               |
| `startPlatformBackfillScheduler`       | heavy | servidor local | Varredura/backfill de grande volume.                                                                                                              |
| `startEstimatedValueReviewScheduler`   | heavy | servidor local | Revisão em lote e possível enriquecimento.                                                                                                        |
| `startOpportunityOwnerReviewScheduler` | heavy | servidor local | Revisão em lote de oportunidades.                                                                                                                 |
| `startDailyCultureCollect`             | heavy | servidor local | Coleta Mapas Culturais.                                                                                                                           |
| `startDailyFundingCollect`             | heavy | servidor local | Coleta de fomento.                                                                                                                                |
| `startDailyCultureFederalCollect`      | heavy | servidor local | Coleta de fontes federais de cultura.                                                                                                             |
| `startDailyInternationalCollect`       | heavy | servidor local | Coleta e tradução internacional; pode usar Ollama.                                                                                                |
| `startDailyCategoryClassify`           | heavy | servidor local | Categorização em lote.                                                                                                                            |
| `startNightlyCategoryClassification`   | heavy | servidor local | Professor/aluno e embeddings com Ollama.                                                                                                          |
| `startRecommendationScheduler`         | light | Oracle         | Recomendações materializadas no banco; manter perto dos dados e observar duração. Reclassificar para heavy se passar de 15 min ou pressionar CPU. |
| `startProfileKeywordScheduler`         | heavy | servidor local | Vocabulário/embeddings do perfil e varredura em lote.                                                                                             |
| `startPersonalDataRetentionScheduler`  | light | Oracle         | Retenção LGPD, operação de banco agendada.                                                                                                        |
| `startBillingReconciliationScheduler`  | light | Oracle         | Reconciliação Asaas contínua e de baixo volume.                                                                                                   |

A reconciliação de ingestões interrompidas roda em `heavy` e `all`, nunca no worker leve. Durante a primeira semana, acompanhar duração, memória e linhas processadas por recomendações e alertas de perfil. Se causarem carga sustentada, mover o scheduler inteiro para `heavy`; não dividir uma mesma rotina entre os hosts.

## ARM64

`Dockerfile.prod` deixa o BuildKit selecionar `linux/amd64` ou `linux/arm64`. O workspace preserva os binários glibc ARM64 de esbuild, Rollup, Lightning CSS e Tailwind Oxide no lockfile. O runtime da API é majoritariamente JavaScript; `pdfjs-dist` possui `@napi-rs/canvas-linux-arm64-gnu` opcional no lockfile. Não há dependência direta de `sharp`, `canvas` ou `onnxruntime-node` nos `package.json`; esses nomes aparecem apenas na lista preventiva de módulos externos do bundle.

OCR/Tesseract/Poppler, Ollama e modelos continuam no servidor local e não entram no compose Oracle. Assim, incompatibilidade de imagem/modelo ARM não bloqueia API ou banco. Verificações antes do ensaio:

```bash
docker buildx build --platform linux/arm64 -f Dockerfile.prod --load -t pardal-digital:arm64 .
docker image inspect pardal-digital:arm64 --format '{{.Architecture}}'
ORACLE_PLATFORM=linux/amd64 docker buildx build --platform linux/amd64 -f Dockerfile.prod --load -t pardal-digital:amd64 .
```

Executar um build por vez. O segundo comando é uma verificação de compatibilidade, não requisito para o corte A1.

## Etapas

### 1. Criar a A1 — dono, console Oracle

Concluir o checklist do console abaixo. Instalar Docker Engine, Compose plugin e Tailscale pelo repositório oficial; montar o block volume em `/srv/pardal`; clonar o repositório em `/opt/pardal`; copiar `.env.oracle.example` para `.env.oracle`; usar permissões `0600`. Subir primeiro somente `db`, conferir o schema e depois `api`, `light-worker` e `proxy`. Migrações de produção permanecem manuais, uma a uma e em transação, pois o histórico Drizzle diverge do repositório; o Compose não as aplica. Nenhum dado de produção entra nesta etapa.

### 2. Ensaio com cópia de backup — dono restaura

Gerar uma cópia autorizada do backup, transferir por Tailscale e executar `ops/oracle/restore-rehearsal.sh`. Conferir catálogo, quantidade de tabelas, contagem de editais (~190 mil), extensões, buscas e plano de índices. Depois restaurar em um volume de ensaio persistente e executar a aplicação contra ele. Apagar somente os recursos de ensaio explicitamente identificados depois da aprovação. O ensaio deve medir tempo de dump, transferência, restore e espaço máximo para definir a janela.

### 3. Corte com janela curta

Seguir `ops/oracle/cutover.md`: pausar worker local, bloquear escrita, dump final, validar com `pg_restore --list`, restaurar na A1, comparar contagens, subir API/worker leve, trocar a borda e só então liberar escrita. Ligar o worker local com `WORKER_JOBS=heavy` e `DATABASE_URL` apontando ao IP Tailscale da A1. Manter origem e E2 intactas durante a janela de observação.

### 4. Pós-corte

- Deploy passa a ocorrer por SSH via Tailscale na A1: `git fetch`, checkout do commit aprovado, build ARM64 e `docker compose --env-file .env.oracle -f compose.oracle.yml up -d --build`.
- No servidor local, o mesmo commit atualiza somente worker/OCR/Ollama; reiniciar o worker após a API A1 estar pronta.
- Rodar `ops/oracle/backup-to-local.sh` diariamente na A1 via systemd timer. O script gera `pg_dump -Fc`, valida o catálogo antes e depois da transferência, grava em `/home/ubuntu/backups/licita` no servidor local e aplica retenção (14 dias por padrão).
- Executar restauração mensal do dump mais recente com `restore-rehearsal.sh`; registrar data, arquivo, duração, contagens e responsável. Backup sem restauração testada não conta como recuperável.
- Observar custo, disco, CPU, memória, conexões, erros, jobs travados, frescor das coletas e latência. Após sete dias estáveis, decidir a retirada da E2.

## Métricas e critérios de sucesso

Medir na mesma máquina e rede antes e depois, 30 amostras por rota, fora e dentro do pico. Guardar saídas no registro do corte:

```bash
measure() {
  base=$1
  path=$2
  label=$3
  output="/tmp/${label}.txt"
  : >"$output"
  for _ in $(seq 1 30); do
    curl --fail --silent --show-error --output /dev/null \
      --write-out '%{time_connect} %{time_starttransfer} %{time_total}\n' \
      "${base}${path}" >>"$output"
  done
  awk '{print $3}' "$output" | sort -n | awk '
    {v[NR]=$1} END {
      p50=v[int((NR-1)*0.50)+1]; p95=v[int((NR-1)*0.95)+1];
      printf "n=%d p50=%.3fs p95=%.3fs\n", NR, p50, p95
    }'
}

measure https://api-atual.example.com /api/healthz antes-health
measure https://api-atual.example.com '/api/v1/tenders?page=1&pageSize=20' antes-busca
measure https://api-nova.example.com /api/healthz depois-health
measure https://api-nova.example.com '/api/v1/tenders?page=1&pageSize=20' depois-busca
```

Aceite:

- p95 de busca externa melhora em pelo menos 20% ou fica abaixo de 800 ms; `/healthz` p95 abaixo de 250 ms;
- taxa de 5xx abaixo de 0,5% e nenhum erro de login, sessão, webhook ou busca nas verificações;
- contagens essenciais e máximos de atualização iguais após o restore;
- API, banco, worker leve e proxy saudáveis por 60 minutos;
- coleta/OCR/Ollama funcionam no worker local e nenhum scheduler executa no grupo errado;
- Tailscale direto preferido; com DERP, latência de consulta do worker abaixo de 150 ms p95 e sem timeout;
- dump diário válido no servidor local e ensaio mensal restaurável;
- Cost Analysis permanece R$ 0 e nenhum recurso fora da franquia aparece.

## Riscos e rollback

| Risco                           | Prevenção/gatilho                                                                   | Resposta                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Recurso cobravel em PAYG        | custo estimado diferente de zero, volume/VPU acima da franquia, alerta de orçamento | Não criar ou parar o recurso; revisar Cost Analysis. O alerta não limita gasto.                             |
| A1 indisponível ou recolhida    | PAYG, uso real, backup diário, imagem/compose reproduzíveis                         | Subir capacidade equivalente dentro da franquia ou retornar para API/banco antigos.                         |
| DERP aumenta latência do worker | abrir UDP 41641, `tailscale ping`, medir antes                                      | Corrigir Security List/NAT; reduzir concorrência e manter corte somente se p95 cumprir o aceite.            |
| Incompatibilidade ARM           | buildx e smoke test no ensaio                                                       | Manter módulo incompatível no servidor amd64; API permanece sem OCR/Ollama.                                 |
| Dados divergentes no corte      | congelar escrita e comparar contagens/checkpoints                                   | Antes de liberar escrita, voltar a borda à origem. Depois, preservar ambos e reconciliar delta manualmente. |
| Saturação de banco/disco        | limites do compose, alertas 70/85%, métricas de pool                                | Pausar jobs pesados, ajustar lote/conexões e retornar se persistir.                                         |
| Duplicidade de jobs             | grupos disjuntos + advisory lock compartilhado                                      | Parar worker incorreto, conferir `job_run_audit`, reiniciar com grupo correto.                              |

O rollback rápido exige que a origem não receba descarte ou migração destrutiva. Antes de liberar escrita na A1, basta recolocar a borda na API antiga e religá-la. Depois de escrita na A1, entrar em manutenção, parar workers, voltar a borda, preservar os dois bancos e reconciliar o delta; nunca promover bidirecionalmente.

## Checklist do dono no console Oracle

1. **PAYG:** em Billing/Upgrade, converter a tenancy para Pay As You Go. Confirmar a conclusão e a região principal `sa-saopaulo-1` antes de criar qualquer recurso.
2. **Orçamento:** Billing & Cost Management → Budgets → Create Budget; escopo da tenancy/compartment do Pardal Digital; valor mensal **R$ 1**. Criar alertas de gasto real e previsto para o e-mail do dono (o menor percentual permitido e 100%). Confirmar o e-mail. Lembrar: alerta não bloqueia cobrança.
3. **Franquia:** em Limits/Cost Estimator, confirmar por escrito no registro da mudança que a tenancy PAYG mostra 3.000 OCPU-h, 18.000 GB-h A1 e 200 GB de block/boot sem custo. Se o estimado não for R$ 0, parar.
4. **VCN:** usar subnet pública somente para a borda. Security List de entrada: TCP 80 e 443 de `0.0.0.0/0` e `::/0`; UDP 41641 de `0.0.0.0/0` e `::/0`. Não criar regra TCP 5432. SSH público também fica fechado.
5. **Instância:** Compute → Instances → Create; AD-1, shape `VM.Standard.A1.Flex`, **4 OCPU / 24 GB**, imagem **Ubuntu 24.04 aarch64**, rótulo Always Free eligible, custo estimado R$ 0. Boot volume de 50 GB com desempenho gratuito padrão.
6. **Volume:** criar block volume de 100 GB no mesmo AD, desempenho gratuito padrão, anexar à A1, formatar ext4 e montar por UUID em `/srv/pardal`. Confirmar total: E2 45 + A1 boot 50 + dados 100 = 195 GB.
7. **Firewall do host:** permitir 80/443 TCP e 41641 UDP; permitir 5432 somente em `tailscale0`/CGNAT `100.64.0.0/10`; negar 5432 nas demais interfaces.
8. **Tailscale:** instalar, autenticar, habilitar no boot e aprovar a máquina. Rodar `tailscale ping` nos dois sentidos e registrar se ficou direto ou DERP.
9. **DNS/TLS:** apontar um hostname de ensaio, instalar certificados fora do repositório e testar HTTPS. Não trocar o hostname de produção nesta etapa.
10. **Auditoria de custo:** revisar Cost Analysis após criar, após 24 h e diariamente por sete dias. Qualquer valor previsto acima de R$ 0 bloqueia o avanço.

## Proposta para Albert/monitor

O monitor deve tratar A1 e servidor local como dois alvos, ambos acessados por SSH via Tailscale. Na A1 ele verifica commit implantado, `docker compose ps`, `/api/readyz`, Postgres, disco, certificado, custo registrado e idade do último backup. No servidor local verifica o mesmo commit, worker `heavy`, OCR/Ollama, frescor de cada coleta e presença do dump diário. O deploy deve ser sequencial: migração manual explicitamente aprovada, A1 (API → worker leve → proxy → smoke test) e depois servidor local (worker pesado), com retorno ao commit anterior por host. Albert nunca recebe chave Oracle ampla nem segredo de banco; use usuário SSH restrito, chave própria, `sudo` limitado aos comandos de deploy e variáveis em arquivos locais. Alertas devem distinguir falha de API, falha de job leve, falha de job pesado e backup atrasado, para evitar reiniciar o lado saudável.
