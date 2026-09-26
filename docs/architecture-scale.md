# Arquitetura para escala e custo por usuário

Data: 26 set 2026. Base: `main` em `524f083`. Números medidos no `licita_cycle4` (8.431 editais) e no código; o que é estimativa está marcado como tal.

## 1. Resposta curta

- **O backend é 100% TypeScript** (Node, Express 5, Drizzle, `pg`, pino): ~17,8 mil linhas em `artifacts/api-server`, ~1 mil em `lib/db`. Fora TS só existem três `.mjs` de build/verificação e um `.sh`. **Não há motivo para trocar de linguagem.** O que limita a escala é a forma como o processo é montado, não o TypeScript.
- **O custo de IA por usuário já tem teto** (seção 4). Os riscos reais de escala e de custo estão em outro lugar: a busca sem índice, os jobs dentro do processo da API, e o limite de taxa do Jev, que é da conta inteira e não de cada usuário.

## 2. Como roda hoje

Um único processo Node faz tudo:

```
cliente ──HTTP──► [ API Express ]──► Postgres (pool padrão do pg, máx. 10)
                   │  + coleta PNCP diária (06:00) e coleta cultural
                   │  + e-mails: digest, imediatos, buscas salvas, retentativas
                   │  + avisos de fim de teste, retenção de perguntas da IA
                   │  + retentativa de documentos (a cada minuto)
                   │  + download e extração de PDF/ZIP (pdfjs, CPU) dentro do request
                   │  + fila do fit e índices em memória (Map)
                   └──► PNCP, Jev (TypeSafe), Resend, Asaas, Google
```

Já é bom: o estado importante fica no Postgres, há travas consultivas (`pg_advisory_xact_lock`) em índices, fichas, fit, cotas e buscas salvas, e os caches caros são **globais por edital** (índice e ficha), não por usuário.

## 3. Diagnóstico

| # | Risco | Evidência | Efeito quando crescer | Correção | Fase |
|---|---|---|---|---|---|
| R1 | **Busca lê a tabela inteira** | Filtro de texto é `LIKE '%termo%'` em `search_text`, sem índice GIN/trigrama em `tenders`. `EXPLAIN` mostra `Seq Scan` com ~10 mil páginas lidas para devolver 7 linhas; 11–21 ms hoje | Custo linear: com ~4,2 mil editais/dia coletados (média medida), 300 mil linhas em ~2,5 meses ≈ 0,75 s por busca de termo raro; 1 milhão ≈ 2,5 s. Poucas dezenas de buscas simultâneas saturam o banco | Índice GIN `pg_trgm` em `search_text` (uma migration, mantém a semântica de substring); depois índices parciais por `status='open'` e paginação por cursor | 1 |
| R2 | **Rotas públicas sem limite nem cache** | Nenhuma rota aplica limite de taxa; só o coletor PNCP trata 429. Sem `Cache-Control` público, ETag, compressão, `helmet` nem `trust proxy`; só existem os middlewares `request-context` e `error-handler`. Busca e detalhe são públicos | Um robô ou pico derruba o banco e nada protege o orçamento; cada busca vai ao Postgres | Limite por IP (anônimo) e por usuário; `Cache-Control: public, max-age=30, stale-while-revalidate` + ETag nas respostas anônimas; CDN na frente | 1 |
| R3 | **Pool de conexões padrão e desligamento abrupto** | `new Pool({ connectionString })`: máx. 10, sem timeouts; sem tratamento de `SIGTERM` (conexões e jobs em curso são cortados no deploy) | Com N réplicas, N×10 conexões estouram o `max_connections` do Postgres (100 por padrão); consulta lenta prende conexão | `DB_POOL_MAX`, `statement_timeout`, `idle_in_transaction_session_timeout`, pooler (PgBouncer ou o do provedor) | 1–2 |
| R4 | **Jobs no mesmo processo da API** | 6 grupos de agendadores sobem em `index.ts`; a coleta, os e-mails e a extração de PDF disputam CPU e o event loop com as requisições | Uma extração pesada aumenta a latência de todos; 2 réplicas da API duplicam todos os agendadores; não dá para escalar API e trabalho separadamente | Papéis por variável (`APP_ROLE=api|worker|all`), mesma imagem; a API só atende HTTP, o worker roda jobs | 1 |
| R5 | **Estado e filas em memória** | `runningIndexes`, `runningFits` (`Map`) e `setInterval`; a fila do fit morre com o processo | Reinício perde trabalho em curso (o banco recupera, mas com atraso); várias réplicas duplicam trabalho | Fila durável no Postgres (`SKIP LOCKED`: pg-boss ou graphile-worker), sem infraestrutura nova; Redis/SQS só quando o Postgres virar gargalo | 2 |
| R6 | **Limite do Jev é da conta, não do usuário** | Jev: 1.200 req/min e 250 mil tokens/s **no total** (`docs.typesafe.ai/models`), e a doc avisa que os limites mudam sem aviso. O fit dispara `Promise.all` em lotes e o alerta diário avalia até 1.000 editais por perfil | Com muitos perfis, o trabalho em lote pode esgotar o limite e travar o "Perguntar ao edital" interativo de todos | Semáforo e token bucket no cliente Jev com duas faixas (interativo reservado, lote com o resto), backoff com jitter e disjuntor de orçamento diário | 1–2 |
| R7 | **Falta observabilidade de custo e de carga** | Só logs pino. Custo de IA está espalhado em 4 tabelas (`ai_ask_requests`, `ai_daily_usage`, `company_tender_fits`, `ai_sheet_daily_usage`); não há métrica de latência nem de fila | Não dá ver o custo por usuário, a margem por plano nem quando o banco está sofrendo | View `ai_usage_ledger` + relatório por usuário/dia/função; métricas (latência p95, fila, tokens/dia); alertas | 1–2 |
| R8 | **Crescimento de armazenamento** | 684 trechos para 3 editais indexados (~0,57 MB por edital). O índice é sob demanda, o que limita, mas não expira | Em 1 ano de uso, dezenas de GB de trechos de editais já encerrados | Retenção: apagar trechos e PDFs em cache de editais encerrados há N dias; partição de `tenders` por `published_at` acima de ~5–10 milhões de linhas | 2–3 |
| R9 | **Sem prova de carga** | Nenhum teste de carga; hoje 8 mil linhas, a produção terá 100× | Descobrir o limite em produção | Harness com 1 milhão de editais sintéticos em banco descartável e cenário de carga com metas de p95, antes e depois de cada correção | 1 |

Não são riscos hoje: a correção sob concorrência (as travas consultivas cobrem os pontos críticos) e a exposição a custo de IA (ver seção 4).

## 4. Custo por usuário (estimativa; preços do Jev da doc de 25 set 2026)

Jev cobra US$ 0,042 por milhão de tokens de entrada; a saída é grátis. Tokens por chamada medidos nas sondagens e calibrações deste projeto.

| Função | Tokens | Custo | Quem paga | Teto atual |
|---|---:|---:|---|---|
| Perguntar ao edital | ~9 mil por pergunta (10 trechos) | ≈ US$ 0,0004 | usuário | 30/dia pago → **≤ US$ 0,34/mês** |
| Aderência (fit) | ~1,1 mil por edital | ≈ US$ 0,00005 | usuário × edital | `AI_DAILY_FIT_LIMIT=1000/dia` → **≤ US$ 1,4/mês** |
| Ficha do edital | ~5,6 mil por edital | ≈ US$ 0,00024 | **global** por edital (cache) | `AI_DAILY_SHEET_LIMIT=500/dia` → ≤ US$ 0,12/dia no total, **independe do nº de usuários** |
| Índice de documentos | 0 (CPU, sem Jev) | — | global por edital | retentativa limitada |

- **Pior caso de IA por assinante pago ≈ US$ 1,7/mês** (fit no teto + perguntas no teto). O uso típico deve ficar bem abaixo (estimativa: US$ 0,1–0,4), mas não foi medido com usuários reais.
- Ficha e índice são custo **por edital aberto**, não por usuário: dobrar os usuários não dobra esse custo.
- Não incluí: hospedagem, banco, Resend, Asaas nem imposto (não tenho os preços contratados) e o preço do plano (`BILLING_MONTHLY_BRL` ainda não está definido). Sem isso, a margem por usuário não fecha.
- **Alavancas para baixar mais o fit** (a única função que cresce com usuários × editais):
  1. Filtro lexical antes do Jev: hoje o Jev roda para todo edital que passa área e valor, mesmo sem nenhum termo do perfil no texto (a correspondência lexical só monta o motivo). Exigir pelo menos um termo do perfil deve cortar a maior parte das chamadas (a medir).
  2. Vários perfis por chamada: o Jev lê o `state` uma vez e avalia todas as perguntas em paralelo. Um edital pode ir com N perfis no mesmo `state`, pagando os tokens do edital uma só vez. **Precisa de um experimento de precisão** (contaminação entre perfis) antes de adotar.

## 5. Princípios

1. **Continuar em TypeScript, com um pacote e dois papéis.** Mesma imagem: `api` (sem estado, HTTP) e `worker` (jobs). Escalam separadamente.
2. **Postgres primeiro.** Fila durável, cache, busca e ledger no Postgres até haver prova de gargalo. Só então Redis, OpenSearch/Typesense ou partição.
3. **Todo custo tem dono e teto:** por edital (global), por usuário (cota) ou por conta (Jev). Nada de trabalho ilimitado disparado por request público.
4. **Rota pública é barata por construção:** cache na borda, limite de taxa e índice.
5. **Medir antes e depois.** Cada correção entra com número (p95, páginas lidas, tokens).
6. **Falhar degradando:** com o Jev ou o orçamento no limite, a busca continua; só o lote de IA pausa.

## 6. Fases e gatilhos

| Fase | Quando | Topologia | O que entra |
|---|---|---|---|
| **1. Proteger e medir** | agora, antes do lançamento | 1 `api` + 1 `worker`, Postgres gerenciado, CDN na frente | R1, R2, R3 (config), R4, R9, R7 (view e relatório), R6 (semáforo) |
| **2. Duas réplicas** | ~500 usuários ativos ou p95 da busca > 300 ms | 2+ `api` atrás de balanceador, pooler, réplica de leitura para busca se preciso | R5 (fila durável), R3 (pooler), R6 (disjuntor), métricas e alertas |
| **3. Volume** | > 5 milhões de editais ou ~5 mil usuários | partição por data, retenção, busca dedicada só se o FTS do Postgres não bastar, Redis para limite e cache | R8 |

Gatilhos são métricas, não datas: p95 de busca, profundidade da fila, tokens/dia, conexões usadas, custo por usuário.

## 7. Decisões pendentes do owner

1. **Onde hospedar** e faixa de orçamento de infraestrutura (define pooler, CDN e réplicas; sem isso a Fase 2 fica em aberto).
2. **Metas de escala** para dimensionar: usuários pagantes esperados em 6 e 12 meses, requisições de busca por usuário/dia.
3. **Preço do plano** (`BILLING_MONTHLY_BRL`) e taxas do Asaas/Resend, para fechar a margem por usuário.
4. **Comportamento no limite de orçamento de IA:** pausar só o lote (recomendado) ou também a ficha; e se o alerta diário de aderência fica ligado por padrão.
5. **Retenção:** por quanto tempo guardar trechos e documentos de editais encerrados (sugestão: 90 dias após o prazo).

## 8. Plano de execução

| Handoff | Escopo | Estado |
|---|---|---|
| **CODEX_HANDOFF-017** (Fase 1a: proteger e medir) | harness de carga; índice trigrama na busca; pool, timeouts e desligamento limpo; `/readyz`; limite de taxa e de concorrência; cache HTTP público | entregue (PR #9) |
| **CODEX_HANDOFF-018** (Fase 1b: custo e isolamento) | papéis `APP_ROLE=all|api|worker`; jobs seguros com várias réplicas (`pg_try_advisory_lock`); view `ai_usage_ledger` + `report:ai-cost`; faixas interativo/lote no cliente Jev (concorrência, taxa e pausa em 429); filtro lexical do fit em modo sombra + `report:fit-gate` | em execução |
| CODEX_HANDOFF-019 (Fase 2) | fila durável no Postgres para extração de documentos, fit e ficha (tira esse trabalho do processo da API e o move para o worker); disjuntor de orçamento; métricas e alertas | depende das decisões 1, 2 e 4 |

**Fronteira do 018:** os papéis separam apenas os agendadores. O trabalho disparado por uma requisição (download e extração de PDF, fila do fit, geração da ficha) continua no processo da API até o 019. Filtro lexical do fit: um filtro rígido cortaria 61% das chamadas de nível baixo, mas perderia 3 de 19 editais alta/média (recall 84%) na calibração do ciclo 5; por isso ele nasce em modo sombra e só liga com recall medido (≥ 97% em ≥ 500 avaliações).

`APP_ROLE=all` preserva o processo único de desenvolvimento; `api` serve somente HTTP e `worker` inicia somente os agendadores. O worker pode expor apenas `/api/healthz` e `/api/readyz` quando `WORKER_HEALTH_PORT` estiver definido. O profile `scale` do Compose adiciona o worker sem alterar a topologia padrão.
