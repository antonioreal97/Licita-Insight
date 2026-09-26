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
- Margem por assinante com hospedagem, Asaas, Resend e preço do plano: seção 7, decisão 3. Imposto fora da conta.
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
| **1. Proteger e medir** | agora, antes do lançamento | 1 `api` + 1 `worker` e Managed Postgres no Fly.io `gru`; CDN só no gatilho da Fase 2 | R1, R2, R3 (config), R4, R9, R7 (view e relatório), R6 (semáforo) |
| **2. Duas réplicas** | ~500 usuários ativos ou p95 da busca > 300 ms | 2+ `api` atrás de balanceador, pooler, réplica de leitura para busca se preciso | R5 (fila durável), R3 (pooler), R6 (disjuntor), métricas e alertas |
| **3. Volume** | > 5 milhões de editais ou ~5 mil usuários | partição por data, retenção, busca dedicada só se o FTS do Postgres não bastar, Redis para limite e cache | R8 |

Gatilhos são métricas, não datas: p95 de busca, profundidade da fila, tokens/dia, conexões usadas, custo por usuário.

## 7. Decisões (26 set 2026)

Tomadas por delegação do owner. Preços de terceiros conferidos nas páginas públicas em 26 set 2026; câmbio assumido de R$ 5,50/US$.

1. **Hospedagem: Fly.io em São Paulo (`gru`).** `api` e `worker` como máquinas da mesma imagem (o `Dockerfile` já existe) e Managed Postgres no plano Starter (2 vCPU compartilhadas, 2 GB, US$ 72/mês + US$ 0,28/GB), com HA, backup e pooler inclusos, o que fecha o pooler do R3. O frontend estático fica na mesma origem da API, porque o cookie `licita_session` e a checagem de `Origin` dependem disso. **Teto de infraestrutura: US$ 150/mês na Fase 1 e US$ 400/mês na Fase 2.** Sem CDN na Fase 1: o cache HTTP com ETag já existe e a CDN entra no gatilho da Fase 2. Antes de migrar, confirmar `CREATE EXTENSION pg_trgm` no cluster (é extensão contrib; a doc do Managed Postgres só restringe extensões de terceiros).
2. **Metas: 100 pagantes em 6 meses e 500 em 12 meses.** Dimensionar para 30 buscas por usuário ativo por dia, com pico de 10× a média; tráfego anônimo fica com o limite de taxa. Com ~4,2 mil editais por dia e sem apagar `tenders` (decisão 5), a base chega a ~1,5 milhão de editais em 12 meses: o harness de carga precisa subir de 300 mil para 1,5 milhão de linhas.
3. **Preço: R$ 49,90/mês** (`BILLING_MONTHLY_BRL=49.90`), plano único, teste de 7 dias mantido. O owner quer um preço bem atrativo frente à concorrência: Siga Pregão cobra R$ 397/mês (ou R$ 2.800/ano), cerca de 8× mais; o plano mais barato do ConLicitação sai a R$ 1.586 por 6 meses (≈ R$ 264/mês), cerca de 5× mais. Margem por assinante com 100 pagantes:

   | Custo | Pior caso | Típico |
   |---|---:|---:|
   | Asaas, cartão (R$ 0,49 + 2,99%); Pix/boleto é R$ 1,99 | R$ 1,98 | R$ 1,98 |
   | IA (seção 4: US$ 1,7 no teto; US$ 0,1–0,4 típico) | R$ 9,35 | R$ 2,20 |
   | Infra (US$ 150 ÷ 100) | R$ 8,25 | R$ 8,25 |
   | Resend Pro (US$ 20 para 50 mil e-mails ÷ 100) | R$ 1,10 | R$ 1,10 |
   | **Sobra antes de imposto** | **R$ 29,22 (59%)** | **R$ 36,37 (73%)** |

   Com 500 pagantes e o teto da Fase 2, infra e Resend caem para ~R$ 4,60 por assinante. A taxa promocional do Asaas nos 3 primeiros meses melhora a conta, mas não entra nela. **Reajuste:** revisar o preço se o custo medido por assinante (ledger da Fase 1b + fatura de infra) passar de R$ 25, metade do preço.
4. **No limite de orçamento de IA, pausar só o lote.** Lote = fila da aderência (inclusive o selo na busca, que fica pendente) e alerta diário do perfil. Continuam: "Perguntar ao edital" (cota por usuário) e ficha (teto global próprio, custo que não cresce com usuários). **Disjuntor: US$ 10/dia de gasto total no Jev** (`AI_DAILY_BUDGET_USD`, a criar na Fase 2), ≈ 1,5× o uso típico alto na meta de 12 meses; revisar com os números do ledger da Fase 1b. **O alerta diário de aderência continua ligado por padrão** (`profile_alerts` já nasce `true`) e só roda para quem preencheu o perfil, que já é opt-in.
5. **Retenção: 90 dias após `proposal_deadline`** para trechos (`tender_ai_passages`), documentos extraídos (`tender_ai_documents`) e o índice (`tender_ai_indexes`), exceto edital salvo por algum usuário. `tenders` não expira: é a base da inteligência de mercado da Onda 5. Perguntas continuam com 90 dias (`purgeExpiredAiQuestions`).

## 8. Plano de execução

| Handoff | Escopo | Estado |
|---|---|---|
| **CODEX_HANDOFF-017** (Fase 1a: proteger e medir) | harness de carga; índice trigrama na busca; pool, timeouts e desligamento limpo; `/readyz`; limite de taxa e de concorrência; cache HTTP público | entregue (PR #9) |
| **CODEX_HANDOFF-018** (Fase 1b: custo e isolamento) | papéis `APP_ROLE=all|api|worker`; jobs seguros com várias réplicas (`pg_try_advisory_lock`); view `ai_usage_ledger` + `report:ai-cost`; faixas interativo/lote no cliente Jev (concorrência, taxa e pausa em 429); filtro lexical do fit em modo sombra + `report:fit-gate` | em execução |
| CODEX_HANDOFF-019 (Fase 2) | fila durável no Postgres para extração de documentos, fit e ficha (tira esse trabalho do processo da API e o move para o worker); disjuntor de orçamento; métricas e alertas | 018 (o ledger calibra o teto do disjuntor); decisões da seção 7 tomadas |

**Fronteira do 018:** os papéis separam apenas os agendadores. O trabalho disparado por uma requisição (download e extração de PDF, fila do fit, geração da ficha) continua no processo da API até o 019. Filtro lexical do fit: um filtro rígido cortaria 61% das chamadas de nível baixo, mas perderia 3 de 19 editais alta/média (recall 84%) na calibração do ciclo 5; por isso ele nasce em modo sombra e só liga com recall medido (≥ 97% em ≥ 500 avaliações).

`APP_ROLE=all` preserva o processo único de desenvolvimento; `api` serve somente HTTP e `worker` inicia somente os agendadores. O worker pode expor apenas `/api/healthz` e `/api/readyz` quando `WORKER_HEALTH_PORT` estiver definido. O profile `scale` do Compose adiciona o worker sem alterar a topologia padrão.
