# Alertas operacionais — LicitAI

As métricas são expostas somente na porta interna configurada por `METRICS_PORT`, em `GET /metrics`. A porta pública não oferece essa rota. Rótulos são limitados a papel, padrão de rota, classe HTTP, tipo/lane/status/feature e nomes fechados de jobs; ids de usuário, edital e job não são rótulos.

As regras abaixo são documentação de referência; a infraestrutura Prometheus/Alertmanager entra no deploy posterior.

```promql
# Busca p95 acima de 300 ms por 10 minutos
histogram_quantile(0.95, sum by (le) (rate(licitai_http_request_duration_seconds_bucket{route="/v1/tenders/search"}[10m]))) > 0.3

# Pool esperando conexão por 2 minutos
licitai_postgres_pool_connections{state="waiting"} > 0

# Readiness: probe externo da porta pública/health do worker
probe_success{probe="readyz"} == 0

# Fila interativa > 10 min; lote > 60 min
max(licitai_ai_job_oldest_age_seconds{lane="interactive"}) > 600
max(licitai_ai_job_oldest_age_seconds{lane="batch"}) > 3600

# Orçamento em aviso ou pausado
licitai_ai_budget_ratio >= 0.8
licitai_ai_budget_paused == 1

# Mais de 2% de 5xx em cinco minutos
sum(rate(licitai_http_request_duration_seconds_count{status_class="5xx"}[5m]))
/
sum(rate(licitai_http_request_duration_seconds_count[5m])) > 0.02

# Falhas de job nas últimas 24 h
sum(licitai_scheduled_job_results_24h{status="failed"}) > 0
sum(licitai_ai_jobs{status="dead"}) > 0

# Mais de 80% do pool configurado (substituir 10 pelo DB_POOL_MAX efetivo)
licitai_postgres_pool_connections{state="total"} / 10 > 0.8
```

Aplicar `for: 10m` à busca, `for: 2m` ao pool, `for: 5m` à taxa de 5xx e pelo menos `for: 1m` aos demais para filtrar reinícios breves. O alerta de orçamento em 80% é aviso; `paused` é crítico para o lote, mas não indisponibilidade da pergunta ou ficha.
