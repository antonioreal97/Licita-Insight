# Contrato interno — fila durável de IA v1

`ai_jobs` é a fonte de verdade para os trabalhos de índice (`index`), aderência (`fit`) e ficha (`sheet`). A API grava o estado de domínio, insere o job e responde; somente um papel que executa jobs (`worker` ou `all`) faz download, extração ou chamada Jev de lote.

## Estados e prioridade

O ciclo é `queued → running → succeeded`. Falha transitória volta a `queued` com backoff exponencial limitado a cinco minutos; ao atingir `max_attempts`, passa a `dead`. A visibilidade de um job `running` é renovada durante a execução. Se `locked_until` vencer, outro worker o recoloca na fila ou o encerra como `dead`. O claim usa uma única instrução `UPDATE … FOR UPDATE SKIP LOCKED … RETURNING`, prioriza `interactive` sobre `batch` e, na faixa, o job mais antigo.

O `dedupe_key` é único e inclui o tipo, edital e a versão relevante: fingerprint do índice, versão do perfil/prompt/modelo no fit e chave global do cache da ficha. Assim, requisições concorrentes observam o mesmo trabalho. O status público `processing`/`pending` representa tanto fila quanto execução.

## Contenção

Novos índices disparados por usuário estão limitados a `AI_INDEX_ENQUEUE_PER_USER_PER_HOUR` por hora. Cada tipo tem profundidade máxima; ao excedê-la, a API mantém o estado anterior e não cria trabalho. Esses limites reduzem abuso acidental, mas não substituem autenticação da ingestão pública, que segue como decisão pendente do owner.

| Variável | Padrão |
|---|---:|
| `AI_JOB_POLL_MS` | `1000` |
| `AI_JOB_VISIBILITY_TIMEOUT_MS` | `300000` |
| `WORKER_INDEX_CONCURRENCY` | `2` |
| `WORKER_SHEET_CONCURRENCY` | `2` |
| `WORKER_FIT_CONCURRENCY` | `8` |
| `AI_INDEX_ENQUEUE_PER_USER_PER_HOUR` | `60` |
| `AI_QUEUE_MAX_DEPTH_INDEX` | `1000` |
| `AI_QUEUE_MAX_DEPTH_SHEET` | `1000` |
| `AI_QUEUE_MAX_DEPTH_FIT` | `10000` |

`APP_ROLE=all` executa o consumidor no mesmo processo para desenvolvimento. `APP_ROLE=api` nunca consome; `APP_ROLE=worker` consome sem servir a API pública.
