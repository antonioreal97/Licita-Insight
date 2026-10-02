# Contrato interno — fila durável de IA v1

`ai_jobs` é a fonte de verdade para os trabalhos de índice (`index`), aderência (`fit`), ficha (`sheet`), resumo de ficha (`sheet_summary`) e reescrita de título pelo professor local (`title_rewrite`). A API grava o estado de domínio, insere o job e responde; somente um papel que executa jobs (`worker` ou `all`) faz download, extração ou chamada aos modelos.

Uma ficha nova pode produzir o resumo OpenAI ao fim do próprio job `sheet`. Para fichas prontas cujo modelo ou versão do resumo esteja desatualizado, `GET /sheet` devolve imediatamente os campos em cache com `summary: null` e enfileira `sheet_summary`; esse job lê os campos e o checklist gravados e chama somente a OpenAI, sem repetir o Jev. Falha, disjuntor aberto ou ausência posterior da chave deixam o resumo nulo e encerram o job sem retentativa automática.

`title_rewrite` usa o Ollama local (sem custo) e não passa pelo orçamento de IA. A API o enfileira depois de responder a busca (primeira página) ou o detalhe, só com `TITLE_TEACHER_ENABLED=true` e para editais com título `rules` marcado com `display_title_needs_model`. O `dedupe_key` é `title_rewrite:<edital>:p<versão do prompt>`, a lane é `batch`, `max_attempts` é 3 e são criados no máximo `TITLE_REWRITE_DAILY_LIMIT` (padrão 2000) por dia em America/Sao_Paulo. O worker executa um por vez e não reivindica esse tipo com a flag desligada; Ollama fora do ar faz o job voltar à fila com backoff. Detalhes em [títulos e categorias](./tender-titles-v1.md).

## Estados e prioridade

O ciclo é `queued → running → succeeded`. Falha transitória volta a `queued` com backoff exponencial limitado a cinco minutos; ao atingir `max_attempts`, passa a `dead`. A visibilidade de um job `running` é renovada durante a execução. Se `locked_until` vencer, outro worker o recoloca na fila ou o encerra como `dead`. O claim usa uma única instrução `UPDATE … FOR UPDATE SKIP LOCKED … RETURNING`, prioriza `interactive` sobre `batch` e, na faixa, o job mais antigo.

O `dedupe_key` é único e inclui o tipo, edital e a versão relevante: fingerprint do índice, versão do perfil/prompt/modelo no fit e chave global do cache da ficha. Para `sheet_summary`, inclui id da ficha, modelo OpenAI solicitado e versão do prompt do resumo; assim, dois GETs concorrentes criam um único job. O status público `processing`/`pending` representa tanto fila quanto execução da ficha; a atualização isolada do resumo não muda uma ficha pronta para `processing`.

## Contenção

Novos índices disparados por usuário estão limitados a `AI_INDEX_ENQUEUE_PER_USER_PER_HOUR` por hora. Cada tipo tem profundidade máxima; ao excedê-la, a API mantém o estado anterior e não cria trabalho. Esses limites reduzem abuso acidental, mas não substituem autenticação da ingestão pública, que segue como decisão pendente do owner.

| Variável | Padrão |
|---|---:|
| `AI_JOB_POLL_MS` | `1000` |
| `AI_JOB_VISIBILITY_TIMEOUT_MS` | `300000` |
| `WORKER_INDEX_CONCURRENCY` | `2` |
| `WORKER_SHEET_CONCURRENCY` | `2` |
| `WORKER_FIT_CONCURRENCY` | `8` |
| concorrência de `title_rewrite` | `1` (fixa) |
| `AI_INDEX_ENQUEUE_PER_USER_PER_HOUR` | `60` |
| `AI_QUEUE_MAX_DEPTH_INDEX` | `1000` |
| `AI_QUEUE_MAX_DEPTH_SHEET` | `1000` |
| `AI_QUEUE_MAX_DEPTH_FIT` | `10000` |
| `AI_QUEUE_MAX_DEPTH_TITLE_REWRITE` | `2000` |
| `TITLE_REWRITE_DAILY_LIMIT` | `2000` |

`APP_ROLE=all` executa o consumidor no mesmo processo para desenvolvimento. `APP_ROLE=api` nunca consome; `APP_ROLE=worker` consome sem servir a API pública.
