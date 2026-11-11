# Painel de administração do Pardal Digital

Stack de observabilidade separada (`licita-dashboard`) com Grafana OSS, Prometheus, node-exporter e cAdvisor. O
Grafana lê dados de negócio no PostgreSQL da stack `licita-macbook` com um papel **somente leitura** e métricas de
infraestrutura pelo Prometheus. A API expõe `app:9091/metrics` somente na rede Docker; o Nginx continua devolvendo
`404` para `/metrics` e nenhuma porta nova é publicada no host.

> O painel mostra dados pessoais (nome e e-mail de usuários). É para uso interno; não compartilhe prints nem o acesso.

## Acesso

- **Tailscale:** http://100.76.192.116:8787
- **Túnel SSH:** `ssh -L 8787:localhost:8787 licita-worker` e abra http://localhost:8787
- **No próprio servidor:** http://127.0.0.1:8787

A porta abre só em `127.0.0.1` e no IP do Tailscale (`100.76.192.116`), nunca em `0.0.0.0`; pela rede local
(`192.168.1.13`) a conexão é recusada. Login obrigatório: acesso anônimo e cadastro desligados.

- **Usuário:** `admin`
- **Senha:** `GF_SECURITY_ADMIN_PASSWORD` em `~/licita-monitor/dashboard.env` (0600, fora do git)

O dashboard **Pardal Digital — Admin** abre como página inicial.

## Credenciais

`~/licita-monitor/dashboard.env` (0600) guarda:

| Variável | Uso |
|---|---|
| `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD` | Admin do Grafana. Só vale na **primeira** subida (quando o volume é criado). |
| `LICITA_READONLY_USER`, `LICITA_READONLY_PASSWORD` | Papel `licita_readonly` no Postgres, usado pelo datasource. |

O bind Tailscale usa `DASHBOARD_TAILSCALE_IP` (padrão `100.76.192.116`) e `DASHBOARD_TAILSCALE_PORT` (padrão
`8787`). Só altere essas variáveis se o IP/porta permanente do servidor mudar. `DASHBOARD_ENV_FILE` pode apontar
para outro arquivo em validações locais; em produção, o padrão continua sendo `~/licita-monitor/dashboard.env`.

No Ubuntu, `DOCKER_SOCKET_PATH` usa o padrão `/var/run/docker.sock`. Em Docker Desktop, informe o socket retornado
por `docker context inspect` apenas para validação local (por exemplo, `$HOME/.docker/run/docker.sock`).

O papel `licita_readonly` tem `CONNECT`, `USAGE` no schema `public` e `SELECT` em todas as tabelas e views, inclusive
as futuras (`ALTER DEFAULT PRIVILEGES FOR ROLE licita`). Não tem escrita nem DDL. Também roda com
`default_transaction_read_only = on`, `statement_timeout = 15s` e `CONNECTION LIMIT 5`.

**Trocar a senha do admin** (o `.env` não é relido depois da primeira subida):

```sh
docker exec -it licita-dashboard-grafana-1 grafana cli admin reset-admin-password '<nova senha>'
```

Depois, atualize `GF_SECURITY_ADMIN_PASSWORD` no `dashboard.env`.

**Trocar a senha do papel somente leitura:** gere uma nova senha e grave em `LICITA_READONLY_PASSWORD`. Aplique no
Postgres pelo psql, passando a senha como variável (`ALTER ROLE licita_readonly PASSWORD :'ro_password'`), e
recrie o container com `docker compose -f compose.yml up -d --force-recreate`.

## Painéis

Os gráficos SQL diários continuam usando uma janela fixa de 30 dias no fuso de São Paulo. Os gráficos Prometheus usam
o intervalo selecionado no topo, atualizam a cada 15 s e mantêm 15 dias de histórico, limitado também a 2 GB.

| Seção | Painéis |
|---|---|
| Usuários | cadastrados; ativos em 24 h, 7 e 30 dias (`sessions.last_seen_at`); em trial agora (`users.trial_ends_at`, sem assinatura vigente); novos por dia |
| Receita | pagantes (`subscriptions.status = 'active'`); MRR estimado (pagantes × variável `Mensalidade`); conversão trial → pagante; assinaturas por status, com "pago até o fim do período" (`canceled` com `current_period_end` futuro) |
| Engajamento | buscas salvas (e com alerta); editais salvos (e monitorados); notificações (total, 7 dias, não lidas) |
| IA | custo OpenAI e Jev no mês; custo OpenAI por dia (títulos, resumos de perguntas e de fichas, via view `ai_usage_ledger`, que soma `ai_title_usage`, `ai_ask_requests` e `tender_ai_sheets`); perguntas novas e em cache e fichas por dia; concordância do aluno da classificação noturna com o professor na prova fixa do holdout, e à parte nos exemplos novos (última noite e 30 noites, de `ingest_runs` com `source = 'nightly-category'`); cota de processos por usuário e dia (`ai_daily_tenders`) |
| Coletas e base | editais e contratos PNCP na base; última execução por fonte (`ingest_runs`); editais novos por dia (entrada na base e publicação no PNCP) |
| Usuários recentes | nome, e-mail, criado em, último acesso, trial e assinatura (50 mais recentes) |
| Servidor | CPU por núcleo, load average, RAM, swap, filesystems, rede, temperatura via hwmon e bateria quando exposta pelo kernel |
| Containers | CPU, memória usada/limite, reinícios no período, rede e I/O para app, postgres, proxy, ocr, grafana e prometheus |
| API | req/s, latência p95, 5xx/s, fila durável de IA e fila Jev |

O seletor **Limite diário de processos** começa em 10, o padrão de `AI_DAILY_TENDER_LIMIT`. Se essa variável de
ambiente mudar no app, informe o mesmo número no seletor para a coluna “Limite” refletir a configuração real. O filtro
**Containers** controla as séries exibidas nos painéis do cAdvisor. **Mensalidade (R$)** começa em 49,90; ajuste-a
para o mesmo valor de `BILLING_MONTHLY_BRL` quando o preço mudar, pois ela alimenta o MRR estimado.

Status possíveis de assinatura (Asaas): `pending`, `active`, `past_due` e `canceled`.

## Como atualizar

As consultas ficam em `panels.py`; o JSON do dashboard é gerado a partir delas.

1. Edite `panels.py`. Antes de publicar, valide a consulta no banco com o papel somente leitura:
   ```sh
   set -a; . ~/licita-monitor/dashboard.env; set +a
   docker exec -i -e PGPASSWORD="$LICITA_READONLY_PASSWORD" licita-macbook-postgres-1 \
     psql -h 127.0.0.1 -U licita_readonly -d licita -c '<consulta>'
   ```
2. Regenere o JSON com `python3 build_dashboard.py`.
3. Faça commit de `panels.py` e `dashboards/abriu-la-admin.json`. O Grafana relê o arquivo em até 60 s; a edição
   pela interface fica desligada para o arquivo continuar sendo a fonte da verdade.

**Subir ou atualizar a observabilidade** (a partir desta pasta, depois da stack `licita-macbook` criar a rede):

```sh
docker compose -f compose.yml config -q
docker compose -f compose.yml up -d
docker compose -f compose.yml ps
# depois de trocar tags de imagens:
docker compose -f compose.yml pull
docker compose -f compose.yml up -d
```

Nunca use `down -v`: o volume `licita-dashboard_grafana_data` guarda usuários e preferências do Grafana.

Para conferir os alvos sem publicar o Prometheus, abra no Grafana **Connections → Data sources → Prometheus** ou rode
de dentro da rede Docker: `docker exec licita-dashboard-prometheus-1 wget -qO- http://127.0.0.1:9090/api/v1/targets`.

**Desligar sem apagar dados:**

```sh
docker compose -f compose.yml stop
```

`docker compose -f compose.yml down` também preserva os volumes se `-v` não for usado. Para parar apenas a coleta e
manter o Grafana disponível para os painéis SQL: `docker compose -f compose.yml stop prometheus node-exporter cadvisor`.

## Observações

- **Tailscale:** se o Tailscale não estiver no ar quando o Docker subir (por exemplo, no boot), a publicação em
  `100.76.192.116` falha e o container não inicia. Nesse caso, rode `docker compose -f compose.yml up -d` de novo
  depois que o Tailscale conectar.
- **Limites:** Grafana 256 MB; Prometheus 384 MB/0,30 CPU; cAdvisor 192 MB/0,15 CPU; node-exporter 64 MB/0,05 CPU.
  A retenção do Prometheus termina no primeiro limite atingido: 15 dias ou 2 GB.
- **Consumo medido:** 21 amostras em 5 min, scrape de 15 s e dados sintéticos, em Docker Desktop Linux/arm64 com
  8 GB/10 vCPU: Prometheus 34,69 MiB e 0,251% CPU em média (36,59 MiB/3,25% máximos); cAdvisor 19,42 MiB e 0,525%
  (22,13 MiB/4,29%); node-exporter 15,86 MiB e 0,638% (16,75 MiB/5,03%). Total médio: **69,97 MiB e 1,414% de um
  núcleo**. A medição local serve como ordem de grandeza; confirme `docker stats` no Ubuntu após o deploy e ajuste
  apenas se houver OOM ou throttling sustentado.
- **Disco do host:** o node-exporter lê `/proc`, `/sys` e `/` em modo somente leitura. O cAdvisor precisa de acesso
  privilegiado ao runtime do Docker para atribuir CPU, memória, rede e I/O a cada container.
- **Plugins:** a pré-instalação de plugins está desligada (`GF_PLUGINS_PREINSTALL_DISABLED`), assim como a
  checagem de atualizações e a telemetria.
