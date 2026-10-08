# Contrato interno — fila durável de IA v1

`ai_jobs` é a fonte de verdade para os trabalhos de índice (`index`), OCR local (`document_ocr`), aderência (`fit`), ficha (`sheet`), resumo de ficha (`sheet_summary`) e reescrita de título pelo professor local (`title_rewrite`). A API grava o estado de domínio, insere o job e responde; somente um papel que executa jobs (`worker` ou `all`) faz download, extração ou chamada aos modelos.

`document_ocr` é criado pelo job de índice para cada PDF digitalizado ou imagem elegível quando a flag está ligada. Mantém concorrência 1 por consumidor, quatro tentativas e o backoff normal; enquanto estiver na fila ou rodando, documento e índice ficam `ocr_processing`. Ao esgotar tentativas ou a visibilidade, o documento vira `unsupported` com motivo `ocr_failed`, para não prender o índice.

Uma ficha nova pode produzir o resumo OpenAI ao fim do próprio job `sheet`. Para fichas prontas cujo modelo ou versão do resumo esteja desatualizado, `GET /sheet` devolve imediatamente os campos em cache com `summary: null` e enfileira `sheet_summary`; esse job lê os campos e o checklist gravados e chama somente a OpenAI, sem repetir o Jev. Falha, disjuntor aberto ou ausência posterior da chave deixam o resumo nulo e encerram o job sem retentativa automática.

`title_rewrite` tem dois provedores, gravados em `payload.provider`. `ollama` (padrão) é local, sem custo e fora do orçamento: a API o enfileira depois de responder a busca (primeira página) ou o detalhe, só com `TITLE_TEACHER_ENABLED=true` e para editais com título `rules` marcado com `display_title_needs_model`, até `TITLE_REWRITE_DAILY_LIMIT` (padrão 2000) por dia. `openai` é enfileirado pela coleta para editais novos ou com título oficial alterado, só com `TITLE_TEACHER_OPENAI_ENABLED=true` e `OPENAI_API_KEY`, até `TITLE_OPENAI_DAILY_LIMIT` (padrão 5000) por dia; ele entra no orçamento diário e não é reivindicado com o disjuntor aberto. O `dedupe_key` é `title_rewrite:<edital>:p<versão do prompt>:<hash do título oficial>`, a lane é `batch` e `max_attempts` é 3. O worker reivindica até 10 jobs do mesmo provedor e resolve todos numa única chamada ao professor, com no máximo um lote em execução por provedor; uma falha da chamada devolve os 10 à fila com backoff, e uma falha ao gravar um edital afeta só o job dele. Com a flag do provedor desligada, seus jobs não são reivindicados. Detalhes em [títulos e categorias](./tender-titles-v1.md).

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
| concorrência de `document_ocr` | `1` |
| `WORKER_SHEET_CONCURRENCY` | `2` |
| `WORKER_FIT_CONCURRENCY` | `8` |
| lote de `title_rewrite` | até 10 jobs, 1 lote por provedor |
| `AI_INDEX_ENQUEUE_PER_USER_PER_HOUR` | `60` |
| `AI_QUEUE_MAX_DEPTH_INDEX` | `1000` |
| `AI_QUEUE_MAX_DEPTH_DOCUMENT_OCR` | `1000` |
| `AI_QUEUE_MAX_DEPTH_SHEET` | `1000` |
| `AI_QUEUE_MAX_DEPTH_FIT` | `10000` |
| `AI_QUEUE_MAX_DEPTH_TITLE_REWRITE` | `2000` |
| `TITLE_REWRITE_DAILY_LIMIT` | `2000` |
| `TITLE_OPENAI_DAILY_LIMIT` | `5000` |

`APP_ROLE=all` executa o consumidor no mesmo processo para desenvolvimento. `APP_ROLE=api` nunca consome; `APP_ROLE=worker` consome sem servir a API pública.
