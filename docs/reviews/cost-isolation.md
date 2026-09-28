# Revisão de custo e isolamento — [CODEX_HANDOFF-018](../handoffs/CODEX_HANDOFF-018-cost-isolation.md)

Data: 26 set 2026. Banco principal não recebeu dados sintéticos. As cargas controladas usaram `licita_cost` e `licita_smoke`, ambos apagados ao final; as verificações de schema criam e removem bancos com nome aleatório.

## Segurança dos jobs com duas ou mais réplicas

Cada ciclo protegido usa `pg_try_advisory_lock(hashtextextended('licitai:job:' || job_key, 0))` em um client dedicado do pool. A mesma conexão permanece reservada até o `pg_advisory_unlock`; uma queda do processo fecha a sessão e libera a trava. `job_run_audit` registra `running`, `succeeded`, `failed` e `skipped_locked`.

| Ciclo | Proteção que já existia | Proteção adicionada | Seguro com 2+ workers |
|---|---|---|---|
| reconciliação de ingestões abandonadas | update por estado/heartbeat | `ingest_reconciliation` | sim |
| avisos de fim de teste | dedupe das notificações | `trial_notifications` | sim |
| alerta imediato + retentativa de e-mail | unique `email_deliveries_dedupe_uidx` | `email_immediate` | sim |
| avaliação de buscas salvas | lock transacional por busca e dedupe de notificação | `saved_search_evaluation` | sim |
| aderência + digest diário | locks/cotas do fit e dedupe de notificação/e-mail | `email_digest` | sim |
| retenção de perguntas de IA | delete idempotente | `ai_question_retention` | sim |
| retentativa de documentos | estado/retry por documento; sem claim global | `document_retry` | sim |
| coleta PNCP | unique parcial `ingest_runs_one_running` | `pncp_collect` protege o disparo | sim |
| coleta cultural | unique parcial `ingest_runs_one_running` | `culture_collect` protege o disparo | sim |

Smoke em `licita_smoke`: dois processos `APP_ROLE=worker` (health em 3012/3013) e um `APP_ROLE=api` (3011). Os três endpoints de health/readiness responderam `200`; para `ingest_reconciliation`, `trial_notifications`, `email_immediate`, `saved_search_evaluation`, `ai_question_retention` e `document_retry`, a auditoria mostrou exatamente um `succeeded` e um `skipped_locked`. Os três processos encerraram com graceful shutdown. PNCP e cultura ficaram desligados para o smoke não chamar serviços externos.

## Ledger e exemplo do custo

`ai_usage_ledger` une somente perguntas concluídas (`answered`/`not_found`), fits `ready` e fichas `ready`. Fichas têm `user_id` nulo e ficam separadas como custo da plataforma.

Exemplo real do `report:ai-cost -- --days 30 --json` em `licita_cost`, com duas contas, um edital e corpos compatíveis com as tabelas reais:

```text
total: 4 chamadas, 23.700 tokens, US$ 0,00099540
ask:   2 chamadas, 17.000 tokens, US$ 0,00071400
fit:   1 chamada,   1.100 tokens, US$ 0,00004620
sheet: 1 chamada,   5.600 tokens, US$ 0,00023520 (plataforma)
usuários ativos: 2; média US$ 0,00038010; p50 US$ 0,00033600;
p90/p99/máximo US$ 0,00042420
top: U-COST-1 US$ 0,00042420; U-COST-2 US$ 0,00033600
teto: ask 1/1 user-day; fit 1/1 user-day
projeção mensal simples: US$ 0,00099540
```

Depois do exemplo, `select count(*) from pg_database where datname='licita_cost'` retornou zero.

## Faixas do Jev

Medição com operações assíncronas reais e fetch Jev simulado: 50 chamadas `interactive` + 50 `batch`, concorrência global 10 e participação máxima do lote 0,5.

| Métrica | Resultado |
|---|---:|
| duração total | 33 ms |
| pico global em andamento | 10 |
| pico batch em andamento | 5 |
| espera p95 interactive | 12 ms |
| espera p95 batch | 31 ms |
| pendências ao final | 0 |

Também passaram os cenários de prioridade do interativo com lote saturado, pausa exclusiva do batch após 429/529, e timeout da fila interativa. Os padrões são 16 vagas globais, 50% para batch, 900 RPM, reserva de 300 RPM para interativo, pausa de 30 s e timeout interativo de 5 s.

## Gate lexical

O teste PostgreSQL real confirmou stemming por palavra (`obra` no edital passa para a oferta `obra civil`). `shadow` chamou o Jev e gravou `false`; `on` não chamou o Jev e gravou `ready/low`, score zero e `no_offering_term`; `off` chamou o Jev e deixou a coluna nula. O `licita_cycle4` tem zero avaliações medidas após a migração, portanto `report:fit-gate` retorna recall `null` e não autoriza ativação. A regra segue: pelo menos 500 avaliações e recall ≥97% em alta+média, com decisão manual do owner.

## Verificações

- suíte: 153 testes, zero falhas, incluindo os testes pelo bundle `dist/`;
- `typecheck` e `build`: passaram;
- `verify:ai-ledger`: banco vazio, dado existente, segundo push e SELECT da view passaram;
- `verify:fit-gate`: banco vazio, linha existente, segundo push e coluna booleana passaram;
- dois `push-force` consecutivos em `licita_cycle4`: passaram depois de `prepare-extensions`.
