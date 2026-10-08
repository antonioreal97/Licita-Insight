# Medição — recomendações personalizadas (2026-10-08)

Ambiente: PostgreSQL 16 Alpine em Docker local, sem GPU, sem embeddings e sem LLM. A medição exercitou o mesmo serviço TypeScript e as mesmas queries/migrações da aplicação. É um teste sintético reprodutível, não um SLO de produção.

## Massa

- 100.000 editais abertos com prazo futuro, 500 órgãos, 5 UFs, 5 famílias de termos/categorias e valores variados.
- 50 usuários, cada um com perfil da empresa e 10 editais salvos (3 monitorados).
- 500 candidatos no máximo por usuário; top 50 materializado; leitura de 10 itens.
- `ANALYZE` executado depois da carga.

## Resultado

| Operação                              |              Resultado |
| ------------------------------------- | ---------------------: |
| Rebuild diário completo (50 usuários) |            6.094,79 ms |
| Média por usuário                     |              121,90 ms |
| Recomendações materializadas          | 2.500 (50 por usuário) |
| Leitura, mínimo                       |                1,57 ms |
| Leitura, mediana                      |                2,85 ms |
| Leitura, p95                          |               17,11 ms |
| Leitura, máximo                       |               38,60 ms |

A otimização determinante foi limitar primeiro os candidatos por índice full-text + novidade e só então combinar `ts_rank_cd` com os demais sinais; ordenar todo o universo pelo rank custava segundos por usuário nessa massa.

Comando de medição após a carga sintética:

```sh
DATABASE_URL=postgresql://... \
RECOMMENDATION_BENCHMARK_USERS=50 \
pnpm --filter @workspace/api-server exec tsx scripts/benchmark-recommendations.ts
```

O job real também remove eventos anteriores a 180 dias. Essa exclusão usa `recommendation_events_retention_idx`; a massa de medição não continha eventos vencidos, portanto o custo apresentado representa essencialmente rebuild e materialização.
