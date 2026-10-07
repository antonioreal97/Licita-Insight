# Painel de admin do Abriu lá (Grafana)

Grafana OSS num compose separado (`licita-dashboard`), lendo o PostgreSQL da stack `licita-macbook` com um papel
**somente leitura**. Não altera `compose.macbook.yml` nem o app.

> O painel mostra dados pessoais (nome e e-mail de usuários). É para uso interno; não compartilhe prints nem o acesso.

## Acesso

- **Tailscale:** http://100.76.192.116:8787
- **Túnel SSH:** `ssh -L 8787:localhost:8787 licita-worker` e abra http://localhost:8787
- **No próprio servidor:** http://127.0.0.1:8787

A porta abre só em `127.0.0.1` e no IP do Tailscale (`100.76.192.116`), nunca em `0.0.0.0`; pela rede local
(`192.168.1.13`) a conexão é recusada. Login obrigatório: acesso anônimo e cadastro desligados.

- **Usuário:** `admin`
- **Senha:** `GF_SECURITY_ADMIN_PASSWORD` em `~/licita-monitor/dashboard.env` (0600, fora do git)

O dashboard **Abriu lá — Admin** abre como página inicial.

## Credenciais

`~/licita-monitor/dashboard.env` (0600) guarda:

| Variável | Uso |
|---|---|
| `GF_SECURITY_ADMIN_USER`, `GF_SECURITY_ADMIN_PASSWORD` | Admin do Grafana. Só vale na **primeira** subida (quando o volume é criado). |
| `LICITA_READONLY_USER`, `LICITA_READONLY_PASSWORD` | Papel `licita_readonly` no Postgres, usado pelo datasource. |

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

Todos os gráficos diários usam uma janela fixa dos últimos 30 dias no fuso de São Paulo; o seletor de tempo fica oculto.

| Seção | Painéis |
|---|---|
| Usuários | cadastrados; ativos em 24 h, 7 e 30 dias (`sessions.last_seen_at`); em trial agora (`users.trial_ends_at`, sem assinatura vigente); novos por dia |
| Receita | pagantes (`subscriptions.status = 'active'`); MRR estimado (pagantes × R$ 49,90); conversão trial → pagante; assinaturas por status, com "pago até o fim do período" (`canceled` com `current_period_end` futuro) |
| Engajamento | buscas salvas (e com alerta); editais salvos (e monitorados); notificações (total, 7 dias, não lidas) |
| IA | custo OpenAI e Jev no mês; custo OpenAI por dia (títulos, resumos de perguntas e de fichas, via view `ai_usage_ledger`, que soma `ai_title_usage`, `ai_ask_requests` e `tender_ai_sheets`); perguntas novas e em cache e fichas por dia; cota de processos por usuário e dia (`ai_daily_tenders`, limite 5) |
| Coletas e base | editais e contratos PNCP na base; última execução por fonte (`ingest_runs`); editais novos por dia (entrada na base e publicação no PNCP) |
| Usuários recentes | nome, e-mail, criado em, último acesso, trial e assinatura (50 mais recentes) |

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

**Subir ou atualizar o Grafana** (a partir desta pasta):

```sh
docker compose -f compose.yml up -d            # sobe ou aplica mudanças no compose
docker compose -f compose.yml pull && docker compose -f compose.yml up -d   # depois de trocar a tag da imagem
```

Nunca use `down -v`: o volume `licita-dashboard_grafana_data` guarda usuários e preferências do Grafana.

## Observações

- **Tailscale:** se o Tailscale não estiver no ar quando o Docker subir (por exemplo, no boot), a publicação em
  `100.76.192.116` falha e o container não inicia. Nesse caso, rode `docker compose -f compose.yml up -d` de novo
  depois que o Tailscale conectar.
- **Memória:** o limite é 256 MB. Em repouso, com o dashboard aberto, o Grafana usa cerca de 190 MB. Se aparecer
  `OOMKilled=true` em `docker inspect`, aumente o `mem_limit`.
- **Plugins:** a pré-instalação de plugins está desligada (`GF_PLUGINS_PREINSTALL_DISABLED`), assim como a
  checagem de atualizações e a telemetria.
