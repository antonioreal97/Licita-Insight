# Desempenho da Busca de Editais — Diagnóstico Inicial (Antes)

> **Comparação:** a tabela de [`depois.md`](depois.md) usa uma nova medição do "antes", feita nas mesmas condições do "depois" (repositório da `main`, banco sem os índices novos, Postgres reiniciado antes da rodada). Os números desta página são da primeira rodada de diagnóstico e servem para localizar os gargalos. Na seção 2, a coluna "Principal" mediu a consulta sem `ORDER BY` e subestima a página (o custo real da ordenação está na seção 3); o `bench-search.ts` atual mede a busca de ponta a ponta, com e sem facetas, e não reproduz mais essa decomposição.

Data: 15/10/2026  
Ambiente de medição: PostgreSQL 16 (`pgvector/pgvector:pg16`), container isolado (`perf-search-latency-pg`) com limite de memória de 1 GB (`--memory=1g`), Node.js v24.  
Dataset sintético reproduzido em escala realista:
- Total de editais no histórico: 300.000
- Editais abertos (`status = 'open'`): 27.000 (~9% do total, correspondendo aos ~26 mil editais abertos observados em produção)
- Vocabulário PNCP realista: termos de busca comuns (`limpeza`, `merenda escolar`, `pavimentação`, `asfalto`, `medicamentos`, `informática`, etc.)
- Distribuição de modalidades, plataformas (`comprasgov`, `licitanet`, `bll`, `portal-compras-publicas`, etc.), categorias oficiais e UFs representativa do PNCP.

---

## 1. Tabela de Medições (15 Consultas Representativas)

Todas as medições foram executadas pelo script de benchmark (`artifacts/api-server/scripts/bench-search.ts`), aferindo a 1ª execução (fria / sem cache de buffer) e percentis p50 / p95 (5 iterações).

| Consulta | Cenário | Resultados | 1ª vez (fria) | p50 | p95 |
|---|---|---:|---:|---:|---:|
| `q=limpeza&pageSize=20` | Busca textual ampla (sem filtro) | 25.000 | 501,83 ms | 189,54 ms | 501,83 ms |
| `pageSize=20&state=BA` | Filtro por UF (sem texto) | 9.677 | 1.424,65 ms | 807,84 ms | 1.424,65 ms |
| `q=merenda escolar&pageSize=20&state=SP` | Texto + UF | 2.419 | 483,74 ms | 483,74 ms | 569,64 ms |
| `pageSize=20` | Sem filtros (todos os status) | 300.000 | 1.091,83 ms | 1.091,83 ms | 1.539,11 ms |
| `q=asfalto&pageSize=20` | Texto comum (sem filtro) | 25.000 | 349,21 ms | 177,07 ms | 349,21 ms |
| `q=pavimentacao&pageSize=20&state=MG` | Texto + UF MG | 1.613 | 1.755,79 ms | 572,06 ms | 1.755,79 ms |
| `status=open&pageSize=20` | **Padrão da UI Pardal** (abertos) | 27.000 | 167,41 ms | 163,37 ms | 170,06 ms |
| `status=open&q=limpeza&pageSize=20` | Abertos + termo comum | 2.250 | 295,93 ms | 94,33 ms | 295,93 ms |
| `status=open&state=SP&pageSize=20` | Abertos + UF SP | 2.613 | 520,77 ms | 105,29 ms | 520,77 ms |
| `status=open&modality=pregao_eletronico` | Abertos + pregão eletrônico | 3.375 | 108,68 ms | 100,74 ms | 108,68 ms |
| `status=open&category=limpeza-higiene` | Abertos + categoria | 2.250 | 503,43 ms | 535,88 ms | 839,34 ms |
| `status=open&q=merenda&state=SP` | Abertos + texto + UF | 218 | 232,56 ms | 129,30 ms | 417,57 ms |
| `status=open&sort=deadline_asc` | **Abertos ordenados por prazo** | 27.000 | **3.224,95 ms** | 573,64 ms | **3.224,95 ms** |
| `status=open&sort=value_desc` | Abertos ordenados por valor | 27.000 | 250,75 ms | 314,43 ms | 341,11 ms |
| `status=open&platform=comprasgov` | Abertos + plataforma Compras.gov | 4.500 | 637,43 ms | 303,37 ms | 637,43 ms |

---

## 2. Decomposição Interna por Consulta (Principal, Count e Facetas)

Tempos medianos (ms) das operações no banco:

| Consulta | Principal (p50) | Count (p50) | Status Facet | Modality Facet | State Facet | Cat Facet | Plat Facet | Values Scan | Soma Facetas |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `q=limpeza` | 1,81 ms | 61,07 ms | 65,92 ms | 80,95 ms | 73,92 ms | 71,86 ms | 87,88 ms | 166,03 ms | 564,21 ms |
| `state=BA` | 1,01 ms | 53,98 ms | 49,02 ms | 53,37 ms | 54,12 ms | 55,71 ms | 51,37 ms | 60,61 ms | 329,94 ms |
| `q=merenda...&state=SP` | 14,75 ms | 477,49 ms | 393,65 ms | 345,61 ms | 277,52 ms | 109,48 ms | 108,51 ms | 118,13 ms | 1.516,04 ms |
| `pageSize=20` (vazio) | 1,15 ms | 47,28 ms | 58,67 ms | 56,14 ms | 67,75 ms | 134,96 ms | 89,82 ms | 211,49 ms | 623,50 ms |
| `q=asfalto` | 1,64 ms | 99,80 ms | 76,93 ms | 77,06 ms | 89,06 ms | 111,57 ms | 107,94 ms | 112,40 ms | 595,28 ms |
| `q=pavimentacao...` | 10,10 ms | 57,90 ms | 58,55 ms | 59,13 ms | 58,10 ms | 61,24 ms | 61,24 ms | 61,30 ms | 438,38 ms |
| `status=open` | 0,91 ms | 1,36 ms | 16,47 ms | 20,89 ms | 3,29 ms | 29,55 ms | 11,34 ms | 9,20 ms | 102,39 ms |
| `status=open&cat=limpeza` | 0,53 ms | 15,47 ms | **285,50 ms** | 15,66 ms | 16,41 ms | 24,35 ms | 19,92 ms | 19,92 ms | 427,14 ms |
| `status=open&platform=comprasgov` | 1,87 ms | 16,76 ms | **274,68 ms** | 36,02 ms | 16,81 ms | 29,68 ms | 40,78 ms | 14,64 ms | 438,39 ms |
| `status=open&sort=deadline_asc` | **7,87 ms** | 4,25 ms | 43,90 ms | 21,53 ms | 5,48 ms | 54,03 ms | 20,29 ms | 65,77 ms | 226,87 ms |

---

## 3. Diagnóstico dos Planos de Execução (`EXPLAIN (ANALYZE, BUFFERS)`)

### 3.1. Ordenação de Abertos por Prazo (`status=open&sort=deadline_asc`)
O plano revela um gargalo gravíssimo ao ordenar por `proposal_deadline ASC`:
```
-> Index Scan using tenders_proposal_deadline_idx on tenders (cost=0.30..294149.21 rows=25130 width=1975) (actual time=443.271..447.004 rows=901 loops=1)
     Filter: (status = 'open'::text)
     Rows Removed by Filter: 273000
     Buffers: shared hit=205135 read=69069
Execution Time: 447.583 ms (3.224 ms a frio)
```
**Causa:** `tenders_proposal_deadline_idx` não é parcial. Para encontrar os 20 primeiros editais abertos por prazo, o PostgreSQL é obrigado a ler **273.000 tuplas fechadas do heap**, descartando todas elas e consumindo **274.204 buffers** (~2,1 GB de dados inspecionados). Em produção com 1,5–2 milhões de editais, essa leitura do heap satura a I/O do disco.

### 3.2. Ordenação de Abertos por Publicação (`status=open&sort=published_desc`)
```
Limit (cost=52767.52..52767.57 rows=20 width=1975) (actual time=56.364..56.366 rows=20 loops=1)
  -> Sort (Sort Key: published_at DESC NULLS LAST, id; Memory: 91kB)
       -> Bitmap Heap Scan on tenders (Recheck Cond: status = 'open'; rows=27000)
            Heap Blocks: exact=6750
            -> Bitmap Index Scan on tenders_status_idx (rows=27000)
```
**Causa:** Não há índice composto ou parcial cobrindo `(published_at DESC, id ASC) WHERE status = 'open'`. O PostgreSQL precisa coletar todas as 27.000 linhas abertas na memória e executar um heapsort para pegar apenas 20 linhas.

### 3.3. Filtro de Categoria e Faceta Disjuntiva de Status
Ao buscar com `category=limpeza-higiene`, a faceta de status levou mais de 285 ms. O `EXPLAIN` revelou:
```
-> Seq Scan on tenders (cost=0.00..528750.00 rows=150000 width=7) (actual time=133.213..496.726 rows=25000 loops=1)
     Filter: (SubPlan 1)
     Rows Removed by Filter: 275000
     SubPlan 1
       -> Function Scan on jsonb_array_elements cat (Filter: value->>'slug' = 'limpeza-higiene')
          loops=300000
Execution Time: 532.772 ms
```
**Causa:** O código gerava `EXISTS (SELECT 1 FROM jsonb_array_elements(categories) as cat WHERE cat->>'slug' IN (...))`. O índice existente `tenders_categories_gin_idx` utiliza `jsonb_path_ops`, que **suporta apenas o operador de contenção `@>`**, e não subplanos com `jsonb_array_elements`. Logo, o banco executava uma varredura sequencial em toda a tabela, chamando a função JSONB 300.000 vezes. Substituindo por `categories @> '[{"slug":"limpeza-higiene"}]'::jsonb`, o tempo cai instantaneamente de 532 ms para 31 ms (redução de 94%).

### 3.4. Bypass de `canUseCombinedFacets` e Concorrência de Conexões
A função `canUseCombinedFacets` foi projetada apenas para buscas textuais **sem nenhum filtro selecionado**.
Como o frontend do Pardal injeta `status=open` por padrão, 100% das navegações reais caem no fluxo legado `this.facets()`, que dispara **19 consultas individuais simultâneas** via `Promise.all` em um pool de 10 conexões. Isso provoca fila de conexões no backend, repetição desnecessária de leituras de heap e transferência massiva de dados pela rede (como na faceta de valores, que transferia todas as linhas de `estimatedValue` para o Node.js).
