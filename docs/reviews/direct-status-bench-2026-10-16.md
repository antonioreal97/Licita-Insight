# Bench: status `direct` fora de Abertos

Banco sintético `licita_scale` (150 000 linhas), Postgres Docker 512 MB, Mac local.
Seed: `--open-count 24000 --direct-count 90000` (proporção próxima da produção: ~24 k com prazo vs ~91 k dispensa/inexig sem prazo).

## Cardinalidade

| Momento | `status=open` | `status=direct` |
| --- | ---: | ---: |
| Antes (`--direct-as-open`) | 114 000 | 0 |
| Depois do backfill | 24 000 | 90 000 |

## Latência `status=open` (facetas)

| Momento | Resultados | p50 c/ facetas | p50 s/ facetas |
| --- | ---: | ---: | ---: |
| Antes | 114 000 | 220 ms | 42 ms |
| Depois (2ª rodada, pós-`ANALYZE`) | 24 000 | ~170–440 ms (ruído no container 512 MB) | **2 ms** |

Em produção o coordenador mediu ~1,6–1,8 s nas facetas com 115 k `open` (lista ~7 ms). O ganho esperado acompanha a queda de cardinalidade nas facetas de status (~115 k → ~24 k). Sem facetas, o sintético já mostrou 42 ms → 2 ms.

Reproduzir:

```zsh
SCALE_ADMIN_DATABASE_URL=postgres://licita:licita@127.0.0.1:55432/postgres \
  pnpm --filter @workspace/api-server run scale:seed -- \
  --rows 150000 --open-count 24000 --direct-count 90000 --direct-as-open
DATABASE_URL=postgres://licita:licita@127.0.0.1:55432/licita_scale \
  pnpm --filter @workspace/api-server run bench:search
DATABASE_URL=… pnpm --filter @workspace/api-server run backfill:direct-status -- --i-understand-this-writes
DATABASE_URL=… pnpm --filter @workspace/api-server run bench:search
```
