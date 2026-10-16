# 0046 — Status `direct` (contratação direta sem prazo)

Não há migração de schema: `tenders.status` é `text` sem `CHECK`. Este pacote é só o **backfill** que reclassifica linhas já gravadas como `open`.

> **Numeração:** a branch `feat/workspaces-phase-1` também avança a série de migrações. Esta entrada usa `0046` (próximo livre na `main` em 16/10/2026). Ao sincronizar com a Fase 1, ela será renumerada para **0047/0048** conforme o que já tiver entrado.

## Regra

`status = 'direct'` quando:

- `modality IN ('dispensa', 'inexigibilidade')`
- `proposal_deadline IS NULL`
- situação ainda “viva” na fonte (hoje as linhas afetadas estão como `open`)

Fora da regra (permanecem `open` se a situação PNCP assim mapear):

- dispensa **com** prazo (dispensa eletrônica)
- **credenciamento** sem prazo (chamamento contínuo)
- pregão/outros sem prazo (poucos; olhar depois)

A coleta (`mapPncpStatus`) e a reconciliação de prazos (`status = 'open'` → `under_review` só com prazo vencido) respeitam `direct`: não fecham como vencido e não reabrem como aberto. Se o PNCP passar a publicar prazo, o upsert remapeia normalmente.

## Contagens esperadas (produção, só leitura, 16/10/2026)

| Situação | Approx. |
| --- | ---: |
| `status = 'open'` antes | 115 390 |
| com `proposal_deadline > now()` | 23 574 |
| sem prazo (candidatos a sair de Abertos) | 91 620 |
| … dispensa | 57 500 |
| … inexigibilidade | 33 916 |
| … credenciamento (continua `open`) | 179 |
| … pregão/outros (continua `open`) | ~25 |

Depois do backfill: ~23–24 k `open` reais + ~91 k `direct`. Facetas do padrão Abertos deixam de varrer ~91 k linhas.

## Por que não gera notificação em massa

O backfill é `UPDATE` SQL direto (ou o script Node abaixo). Só o caminho `upsertPublications` → `createTenderChangeNotifications` cria `tender_status_changed`. Além disso, `tenderChanges` ignora transições `open` ↔ `direct` para upserts futuros da mesma reclassificação.

## Produção (dono aplica)

1. Conferir antes:

   ```sql
   select status,
          count(*) filter (where modality in ('dispensa','inexigibilidade') and proposal_deadline is null) as direct_candidates,
          count(*) as total
   from tenders
   group by 1
   order by 1;
   ```

2. Rodar o backfill em lotes (commit a cada 8 k; pausa 50 ms):

   ```zsh
   DATABASE_URL='…' pnpm --filter @workspace/api-server run backfill:direct-status -- --i-understand-this-writes
   ```

   Alternativa manual: repetir `psql -f lib/db/migrations/manual/0046_direct_contracting_status.sql` até `UPDATE 0`.

3. Conferir depois: `select status, count(*) from tenders group by 1 order by 1;` — candidatos `open` com a regra acima devem ser 0; `direct` ≈ soma dispensa+inexig sem prazo.

4. Reverter (só linhas que ainda batem a regra):

   ```zsh
   DATABASE_URL='…' pnpm --filter @workspace/api-server run backfill:direct-status -- --i-understand-this-writes --rollback
   ```

   ou o SQL em `lib/db/migrations/manual/0046_direct_contracting_status_rollback.sql`.

Ordem sugerida: deploy do código que mapeia `direct` → backfill → (opcional) reiniciar API. O código novo já classifica upserts; o backfill cobre o estoque.

## Recomendações e alertas

Queries de recomendação e alertas de perfil usam `status = 'open'`. Com `direct` fora de `open`, contratação sem disputa não entra nessas superfícies — comportamento desejado.
