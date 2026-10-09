"""Panel definitions: (section, title, type, SQL/PromQL, options)."""

TZ = "America/Sao_Paulo"

# Paying = Asaas status active. "Pago até o fim do período" = canceled with current_period_end still ahead
# (the app keeps access for them: billing-access.ts hasSubscriptionEntitlement).
PAYING = "s.status = 'active'"

DAYS_30 = f"""generate_series(
      date_trunc('day', now() at time zone '{TZ}') - interval '29 days',
      date_trunc('day', now() at time zone '{TZ}'),
      interval '1 day') as d(day)"""

PANELS = [
    # ---------------------------------------------------------------- Usuários
    ("Usuários", "Usuários cadastrados", "stat", "select count(*) as \"Usuários\" from users", {}),
    ("Usuários", "Ativos (último acesso)", "stat", """
select
  count(distinct user_id) filter (where last_seen_at > now() - interval '24 hours') as "24 h",
  count(distinct user_id) filter (where last_seen_at > now() - interval '7 days') as "7 dias",
  count(distinct user_id) filter (where last_seen_at > now() - interval '30 days') as "30 dias"
from sessions""", {}),
    ("Usuários", "Em trial agora", "stat", f"""
select count(*) as "Em trial"
from users u left join subscriptions s on s.user_id = u.id
where u.trial_ends_at > now()
  and not coalesce({PAYING} or (s.status = 'canceled' and s.current_period_end > now()), false)""", {}),
    ("Usuários", "Novos usuários por dia (30 dias)", "timeseries", f"""
select (d.day at time zone '{TZ}') as time, count(u.id) as "Novos usuários"
from {DAYS_30}
left join users u on date_trunc('day', u.created_at at time zone '{TZ}') = d.day
group by d.day order by d.day""", {"bars": True}),
    # ---------------------------------------------------------------- Receita
    ("Receita", "Pagantes (Asaas active)", "stat",
     f"select count(*) as \"Pagantes\" from subscriptions s where {PAYING}", {}),
    ("Receita", "MRR estimado (R$)", "stat",
     f"select count(*) * cast(${{monthly_brl:sqlstring}} as numeric) as \"MRR (R$)\" from subscriptions s where {PAYING}", {"unit": "currencyBRL"}),
    ("Receita", "Conversão trial → pagante", "stat", f"""
select coalesce(round(100.0 * count(*) filter (where {PAYING}) / nullif(count(*), 0), 1), 0) as "Conversão (%)"
from users u left join subscriptions s on s.user_id = u.id
where u.trial_ends_at is not null""", {"unit": "percent"}),
    ("Receita", "Assinaturas por status", "table", f"""
select coalesce(s.status, 'sem assinatura') as "Status",
       count(*) as "Usuários",
       count(*) filter (where s.status = 'canceled' and s.current_period_end > now()) as "Pago até o fim do período"
from users u left join subscriptions s on s.user_id = u.id
group by 1 order by 2 desc""", {}),
    # ---------------------------------------------------------------- Engajamento
    ("Engajamento", "Buscas salvas", "stat", """
select count(*) as "Buscas salvas", count(*) filter (where alerts_enabled) as "Com alerta"
from saved_searches where deleted_at is null""", {}),
    ("Engajamento", "Editais salvos", "stat", """
select count(*) as "Editais salvos", count(*) filter (where monitored) as "Monitorados",
       count(distinct user_id) as "Usuários"
from saved_tenders""", {}),
    ("Engajamento", "Notificações", "stat", """
select count(*) as "Total", count(*) filter (where created_at > now() - interval '7 days') as "7 dias",
       count(*) filter (where read_at is null) as "Não lidas"
from notifications""", {}),
    # ---------------------------------------------------------------- IA
    ("IA", "Custo OpenAI no mês (US$)", "stat", f"""
select coalesce(sum(cost_usd), 0) as "OpenAI (mês)"
from ai_usage_ledger
where feature in ('title', 'ask_summary', 'sheet_summary')
  and occurred_at >= date_trunc('month', now() at time zone '{TZ}') at time zone '{TZ}'""", {"unit": "currencyUSD", "decimals": 4}),
    ("IA", "Custo Jev no mês (US$)", "stat", f"""
select coalesce(sum(cost_usd), 0) as "Jev (mês)"
from ai_usage_ledger
where feature in ('ask', 'sheet', 'fit')
  and occurred_at >= date_trunc('month', now() at time zone '{TZ}') at time zone '{TZ}'""", {"unit": "currencyUSD", "decimals": 4}),
    ("IA", "Custo OpenAI por dia (US$, 30 dias)", "timeseries", f"""
select (d.day at time zone '{TZ}') as time,
       coalesce(sum(l.cost_usd) filter (where l.feature = 'title'), 0) as "Títulos",
       coalesce(sum(l.cost_usd) filter (where l.feature = 'ask_summary'), 0) as "Resumo de perguntas",
       coalesce(sum(l.cost_usd) filter (where l.feature = 'sheet_summary'), 0) as "Resumo de fichas"
from {DAYS_30}
left join ai_usage_ledger l
  on l.feature in ('title', 'ask_summary', 'sheet_summary')
 and date_trunc('day', l.occurred_at at time zone '{TZ}') = d.day
group by d.day order by d.day""", {"bars": True, "stack": True, "unit": "currencyUSD", "decimals": 4}),
    ("IA", "Perguntas e fichas por dia (30 dias)", "timeseries", f"""
select (d.day at time zone '{TZ}') as time,
       (select count(*) from ai_ask_requests a
         where a.cache_hit = false and date_trunc('day', a.created_at at time zone '{TZ}') = d.day) as "Perguntas novas",
       (select count(*) from ai_ask_requests a
         where a.cache_hit = true and date_trunc('day', a.created_at at time zone '{TZ}') = d.day) as "Perguntas em cache",
       (select count(*) from tender_ai_sheets t
         where t.generated_at is not null and date_trunc('day', t.generated_at at time zone '{TZ}') = d.day) as "Fichas geradas"
from {DAYS_30}
order by d.day""", {"bars": True}),
    ("IA", "Cota de processos por usuário e dia (30 dias)", "table", f"""
select q.quota_day as "Dia", coalesce(u.name, '') as "Nome", u.email as "E-mail",
       count(*) as "Processos consultados", cast(${{daily_process_limit:sqlstring}} as integer) as "Limite"
from ai_daily_tenders q join users u on u.id = q.user_id
where q.quota_day >= (now() at time zone '{TZ}')::date - 29
group by q.quota_day, u.name, u.email
order by q.quota_day desc, 4 desc""", {}),
    # ---------------------------------------------------------------- Coletas e base
    ("Coletas e base", "Editais na base", "stat", "select count(*) as \"Editais\" from tenders", {}),
    ("Coletas e base", "Contratos PNCP na base", "stat", "select count(*) as \"Contratos\" from pncp_contracts", {}),
    ("Coletas e base", "Última execução por fonte", "table", """
select distinct on (source) source as "Fonte", status as "Status", started_at as "Início",
       finished_at as "Fim", heartbeat_at as "Último sinal", upserted as "Gravados",
       left(coalesce(error, ''), 160) as "Erro"
from ingest_runs order by source, started_at desc""", {}),
    ("Coletas e base", "Editais novos por dia (30 dias)", "timeseries", f"""
with since as (select date_trunc('day', now() at time zone '{TZ}') - interval '29 days' as day),
created as (
  select date_trunc('day', created_at at time zone '{TZ}') as day, count(*) as n from tenders
  where created_at >= (select day from since) at time zone '{TZ}' group by 1),
published as (
  select date_trunc('day', published_at at time zone '{TZ}') as day, count(*) as n from tenders
  where published_at >= (select day from since) at time zone '{TZ}' group by 1)
select (d.day at time zone '{TZ}') as time,
       coalesce(c.n, 0) as "Entraram na base", coalesce(p.n, 0) as "Publicados no PNCP"
from {DAYS_30}
left join created c on c.day = d.day
left join published p on p.day = d.day
order by d.day""", {"bars": True}),
    # ---------------------------------------------------------------- Usuários recentes
    ("Usuários recentes (dados pessoais, uso interno)", "Usuários recentes", "table", """
select u.name as "Nome", u.email as "E-mail", u.created_at as "Criado em",
       (select max(se.last_seen_at) from sessions se where se.user_id = u.id) as "Último acesso",
       u.trial_ends_at as "Trial até",
       coalesce(s.status, 'sem assinatura') as "Assinatura",
       case
         when s.status = 'active' then 'Pagante'
         when s.status = 'canceled' and s.current_period_end > now() then 'Pago até o fim do período'
         when u.trial_ends_at > now() then 'Em trial'
         else 'Sem acesso'
       end as "Situação"
from users u left join subscriptions s on s.user_id = u.id
order by u.created_at desc
limit 50""", {}),

    # ---------------------------------------------------------------- Servidor
    ("Servidor", "CPU por núcleo", "timeseries", """
100 - avg by (cpu) (rate(node_cpu_seconds_total{job="node-exporter",mode="idle"}[$__rate_interval])) * 100
""", {"datasource": "prometheus", "unit": "percent", "legend": "CPU {{cpu}}"}),
    ("Servidor", "Load average", "timeseries", [
        {"expr": "node_load1{job=\"node-exporter\"}", "legend": "1 min"},
        {"expr": "node_load5{job=\"node-exporter\"}", "legend": "5 min"},
        {"expr": "node_load15{job=\"node-exporter\"}", "legend": "15 min"},
    ], {"datasource": "prometheus"}),
    ("Servidor", "RAM usada", "stat", """
100 * (1 - node_memory_MemAvailable_bytes{job="node-exporter"} / node_memory_MemTotal_bytes{job="node-exporter"})
""", {"datasource": "prometheus", "unit": "percent", "decimals": 1}),
    ("Servidor", "Swap usada", "stat", """
100 * (1 - node_memory_SwapFree_bytes{job="node-exporter"} / clamp_min(node_memory_SwapTotal_bytes{job="node-exporter"}, 1))
""", {"datasource": "prometheus", "unit": "percent", "decimals": 1}),
    ("Servidor", "Disco usado por filesystem", "timeseries", """
100 * (1 - node_filesystem_avail_bytes{job="node-exporter",fstype!~"tmpfs|devtmpfs|overlay|squashfs|nsfs|ramfs"}
  / node_filesystem_size_bytes{job="node-exporter",fstype!~"tmpfs|devtmpfs|overlay|squashfs|nsfs|ramfs"})
""", {"datasource": "prometheus", "unit": "percent", "legend": "{{mountpoint}} ({{device}})"}),
    ("Servidor", "Rede do servidor", "timeseries", [
        {"expr": "sum by (device) (rate(node_network_receive_bytes_total{job=\"node-exporter\",device!~\"lo|veth.*|docker.*|br-.*\"}[$__rate_interval]))", "legend": "{{device}} recebido"},
        {"expr": "-sum by (device) (rate(node_network_transmit_bytes_total{job=\"node-exporter\",device!~\"lo|veth.*|docker.*|br-.*\"}[$__rate_interval]))", "legend": "{{device}} enviado"},
    ], {"datasource": "prometheus", "unit": "Bps"}),
    ("Servidor", "Temperatura", "timeseries", """
node_hwmon_temp_celsius{job="node-exporter"}
""", {"datasource": "prometheus", "unit": "celsius", "legend": "{{chip}} {{sensor}}"}),
    ("Servidor", "Bateria", "stat", """
node_power_supply_capacity{job="node-exporter"}
""", {"datasource": "prometheus", "unit": "percent", "legend": "{{power_supply}}", "description": "Aparece somente se o host expuser uma bateria em /sys/class/power_supply."}),

    # ---------------------------------------------------------------- Containers
    ("Containers", "CPU por container", "timeseries", """
sum by (container_label_com_docker_compose_service) (
  rate(container_cpu_usage_seconds_total{job="cadvisor",image!="",container_label_com_docker_compose_service=~"$container"}[$__rate_interval])
) * 100
""", {"datasource": "prometheus", "unit": "percent", "legend": "{{container_label_com_docker_compose_service}}"}),
    ("Containers", "Memória usada vs limite", "timeseries", [
        {"expr": "sum by (container_label_com_docker_compose_service) (container_memory_working_set_bytes{job=\"cadvisor\",image!=\"\",container_label_com_docker_compose_service=~\"$container\"})", "legend": "{{container_label_com_docker_compose_service}} usada"},
        {"expr": "sum by (container_label_com_docker_compose_service) (container_spec_memory_limit_bytes{job=\"cadvisor\",image!=\"\",container_label_com_docker_compose_service=~\"$container\"} < 1e15)", "legend": "{{container_label_com_docker_compose_service}} limite"},
    ], {"datasource": "prometheus", "unit": "bytes"}),
    ("Containers", "Memória do limite", "timeseries", """
100 * sum by (container_label_com_docker_compose_service) (
  container_memory_working_set_bytes{job="cadvisor",image!="",container_label_com_docker_compose_service=~"$container"}
) / sum by (container_label_com_docker_compose_service) (
  container_spec_memory_limit_bytes{job="cadvisor",image!="",container_label_com_docker_compose_service=~"$container"} < 1e15
)
""", {"datasource": "prometheus", "unit": "percent", "legend": "{{container_label_com_docker_compose_service}}", "description": "Containers sem mem_limit não aparecem neste painel."}),
    ("Containers", "Reinícios no período", "stat", """
changes((max by (container_label_com_docker_compose_service) (
  container_start_time_seconds{job="cadvisor",image!="",container_label_com_docker_compose_service=~"$container"}
))[$__range:])
""", {"datasource": "prometheus", "legend": "{{container_label_com_docker_compose_service}}", "decimals": 0}),
    ("Containers", "Rede por container", "timeseries", [
        {"expr": "sum by (container_label_com_docker_compose_service) (rate(container_network_receive_bytes_total{job=\"cadvisor\",image!=\"\",container_label_com_docker_compose_service=~\"$container\"}[$__rate_interval]))", "legend": "{{container_label_com_docker_compose_service}} recebido"},
        {"expr": "-sum by (container_label_com_docker_compose_service) (rate(container_network_transmit_bytes_total{job=\"cadvisor\",image!=\"\",container_label_com_docker_compose_service=~\"$container\"}[$__rate_interval]))", "legend": "{{container_label_com_docker_compose_service}} enviado"},
    ], {"datasource": "prometheus", "unit": "Bps"}),
    ("Containers", "I/O de disco por container", "timeseries", [
        {"expr": "sum by (container_label_com_docker_compose_service) (rate(container_fs_reads_bytes_total{job=\"cadvisor\",image!=\"\",container_label_com_docker_compose_service=~\"$container\"}[$__rate_interval]))", "legend": "{{container_label_com_docker_compose_service}} leitura"},
        {"expr": "sum by (container_label_com_docker_compose_service) (rate(container_fs_writes_bytes_total{job=\"cadvisor\",image!=\"\",container_label_com_docker_compose_service=~\"$container\"}[$__rate_interval]))", "legend": "{{container_label_com_docker_compose_service}} escrita"},
    ], {"datasource": "prometheus", "unit": "Bps"}),

    # ---------------------------------------------------------------- API
    ("API", "Requisições por segundo", "timeseries", """
sum(rate(licitai_http_request_duration_seconds_count{job="pardal-api"}[$__rate_interval]))
""", {"datasource": "prometheus", "unit": "reqps", "legend": "req/s"}),
    ("API", "Latência p95", "timeseries", """
histogram_quantile(0.95, sum by (le) (rate(licitai_http_request_duration_seconds_bucket{job="pardal-api"}[$__rate_interval])))
""", {"datasource": "prometheus", "unit": "s", "legend": "p95"}),
    ("API", "Erros 5xx por segundo", "stat", """
sum(rate(licitai_http_request_duration_seconds_count{job="pardal-api",status_class="5xx"}[$__rate_interval])) or vector(0)
""", {"datasource": "prometheus", "unit": "reqps", "decimals": 3}),
    ("API", "Fila de IA durável", "timeseries", """
sum by (status) (licitai_ai_jobs{job="pardal-api",status=~"queued|running"})
""", {"datasource": "prometheus", "legend": "{{status}}"}),
    ("API", "Fila Jev", "timeseries", """
sum by (lane) (licitai_jev_queue_depth{job="pardal-api"})
""", {"datasource": "prometheus", "legend": "{{lane}}"}),
]
