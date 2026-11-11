# Classificação noturna de categorias (aluno local + Jev professor)

Objetivo: tirar títulos e categorias da OpenAI. O título exibido fica com o normalizador por regras;
a categoria é dada pelo **aluno** (embeddings no Ollama do próprio servidor + vizinhos mais próximos),
de madrugada, e o **Jev** só é consultado nos editais em que o aluno tem pouca confiança. A OpenAI
fica para as consultas de documentos feitas pelos usuários.

Não há migração: o job usa `tenders.category_confidence`, `tender_title_examples` e
`ai_title_usage`, que já existem.

## O que roda e quando

Job `nightly_category_classification`, no processo que roda os agendadores (`APP_ROLE=all` ou
`worker`), dentro da janela `NIGHTLY_CATEGORY_WINDOW_START`–`NIGHTLY_CATEGORY_WINDOW_END`
(padrão 00:00–05:30, America/Sao_Paulo). O agendador olha o relógio a cada minuto; a execução segura
o lock `nightly_category_classification` (advisory lock + linha em `job_run_audit`), então duas
instâncias nunca rodam juntas. Cada chamada ao Ollama leva poucos textos
(`NIGHTLY_CATEGORY_EMBED_CHUNK`, padrão 8) e o relógio é conferido entre elas: às 05:30 o job para
no lote em andamento, antes da coleta das 06:00. O que ficou sem avaliar continua pendente e entra
na noite seguinte; um restart dentro da janela retoma do mesmo jeito, porque o que já foi gravado sai
da lista de pendentes.

Ordem de uma noite:

1. **Exemplos.** Embute os exemplos rotulados sem vetor ou com vetor de outro
   `OLLAMA_EMBED_MODEL` (inclui os rótulos da OpenAI que nunca foram embutidos). Ocupa no máximo
   `NIGHTLY_CATEGORY_EXAMPLE_SHARE` (40%) do tempo que resta da janela; com menos de
   `NIGHTLY_CATEGORY_MIN_EXAMPLES` (200) exemplos utilizáveis, a noite inteira vai para eles.
2. **Concordância.** Classifica até `NIGHTLY_CATEGORY_HOLDOUT_SAMPLE` (500) exemplos do `holdout`
   (20% que o aluno nunca usa como vizinho) e compara com o rótulo do professor. Não chama o Ollama.
   A prova é **fixa**: só entram exemplos criados antes de `NIGHTLY_CATEGORY_HOLDOUT_FROZEN_AT`
   (08/11/2026 00:00 de Brasília). Os exemplos novos do Jev vêm dos editais em que o aluno teve
   dúvida; se entrassem na prova, ela ficaria mais difícil a cada noite e a concordância cairia sem o
   aluno piorar. Os exemplos de holdout criados depois da data são medidos à parte
   (`holdoutRecent`, os 500 mais novos), só para leitura.
3. **Aluno.** Editais `open`/`under_review` que não são `teacher` e ainda não têm
   `category_confidence`, os mais novos primeiro, em lotes de `NIGHTLY_CATEGORY_BATCH` (64). Depois
   de gravar cada lote, os duvidosos dele vão ao Jev: os editais da noite usam o teto diário antes
   da sobra.
4. **Jev, sobra de noites anteriores.** Com o que o teto deixou, editais já avaliados com confiança
   abaixo de `JEV_TEACHER_CONFIDENCE_THRESHOLD`, os mais novos primeiro.
5. **Sobra de tempo.** Volta aos exemplos que a etapa 1 deixou para trás.

O Jev só recebe editais que ainda aceitam proposta (`proposal_deadline` futuro ou vazio). Os de prazo
vencido continuam com a categoria do aluno ou das regras e não contam em `jevBacklog`.

O que o aluno grava:

| Confiança do aluno | `categories` / `category_source` | Vai ao Jev? |
|---|---|---|
| ≥ `JEV_TEACHER_CONFIDENCE_THRESHOLD` (0,6) | do aluno / `student` | não |
| entre `CATEGORY_STUDENT_MIN_CONFIDENCE` (0,42) e o limiar | do aluno / `student` | sim |
| < `CATEGORY_STUDENT_MIN_CONFIDENCE` | **mantém o que havia** (regras ou vazio) | sim |

`category_confidence` e `categorized_at` são gravados nos três casos. Título oficial igual ao de um
exemplo já rotulado recebe o rótulo do exemplo sem embedding (confiança 1), e título repetido na
mesma noite é embutido uma vez só; o resumo conta os dois em `reused`.

O Jev responde uma pergunta `choice` sobre a lista oficial de categorias, pela lane `batch` do
`jev-scheduler` (que já reserva folga para o uso interativo e pausa em 429). Com confiança do Jev
≥ `JEV_TEACHER_MIN_CONFIDENCE` (0,5) o edital vira `category_source = teacher` e o par entra em
`tender_title_examples`, já com o vetor calculado pelo aluno: na noite seguinte ele é vizinho.
Abaixo disso nada muda no edital. Nos dois casos a chamada é registrada em `ai_title_usage`
(`model = jev-teacher/<modelo>`), que conta o teto `JEV_TEACHER_DAILY_LIMIT` por dia de São Paulo e
impede perguntar de novo sobre o mesmo título. Falha de chamada não conta no teto; cinco seguidas
encerram o Jev naquela noite. Com o orçamento diário de IA (`AI_DAILY_BUDGET_USD`) estourado, o Jev
professor não é chamado.

## Variáveis

| Variável | Padrão | Efeito |
|---|---|---|
| `TITLE_TEACHER_OPENAI_ENABLED` | `false` | `true` religa o professor OpenAI de títulos e categorias |
| `CATEGORY_STUDENT_ENABLED` | `false` | liga o aluno (e, com ele, o job noturno) |
| `NIGHTLY_CATEGORY_ENABLED` | `true` | `false` volta à classificação logo após cada coleta |
| `NIGHTLY_CATEGORY_WINDOW_START` / `_END` | `00:00` / `05:30` | janela; pode cruzar a meia-noite |
| `NIGHTLY_CATEGORY_BATCH` | `64` | editais lidos e gravados por rodada |
| `NIGHTLY_CATEGORY_EMBED_CHUNK` | `8` | textos por chamada ao Ollama |
| `NIGHTLY_CATEGORY_EXAMPLE_SHARE` | `0.4` | parte da janela reservada aos exemplos |
| `NIGHTLY_CATEGORY_MIN_EXAMPLES` | `200` | mínimo de exemplos para o aluno classificar |
| `NIGHTLY_CATEGORY_HOLDOUT_SAMPLE` | `500` | exemplos do holdout medidos por noite; `0` desliga |
| `NIGHTLY_CATEGORY_HOLDOUT_FROZEN_AT` | `2026-11-08T03:00:00Z` | só exemplos criados antes disso entram na prova; `off` mede o holdout inteiro (sem prova fixa) |
| `NIGHTLY_CATEGORY_EMBED_RETRY_DELAY_MS` | `20000` | pausa antes de repetir um embedding que falhou, multiplicada pela tentativa (4 tentativas: 20 s, 40 s, 60 s) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | no compose de produção: `http://ollama:11434` |
| `OLLAMA_EMBED_MODEL` | `bge-m3` | modelo de embedding; trocar re-embute os exemplos |
| `OLLAMA_KEEP_ALIVE` | `10m` | produção: `2m`, para o modelo sair da memória fora da janela |
| `OLLAMA_EMBED_TIMEOUT_MS` | `60000` | produção: `180000` (a primeira chamada carrega o modelo) |
| `JEV_TEACHER_ENABLED` | `true` | `false` deixa o aluno sozinho; exige `JEV_API_KEY` |
| `JEV_TEACHER_CONFIDENCE_THRESHOLD` | `0.6` | confiança do aluno abaixo da qual o edital vai ao Jev |
| `JEV_TEACHER_DAILY_LIMIT` | `1500` | chamadas ao Jev professor por dia |
| `JEV_TEACHER_MIN_CONFIDENCE` | `0.5` | confiança mínima do Jev para gravar e virar exemplo |
| `JEV_TEACHER_CONCURRENCY` | `4` | chamadas simultâneas (o `jev-scheduler` ainda limita) |

## Modelo de embedding

O modelo é o de `OLLAMA_EMBED_MODEL`. Quando ele muda, os vetores antigos deixam de valer
(`embedding_model` diferente): o job re-embute os exemplos pela etapa 1 e só classifica com os que
já estão no modelo novo. Editais já classificados não são reavaliados.

**A escolha final está pendente do benchmark no servidor** (`ops/macbook/bench/run-embedding-bench.sh`,
resultado na issue #29), que mede `bge-m3`, `embeddinggemma:300m` e `qwen3-embedding:0.6b` no
hardware real, com os rótulos reais. Velocidade medida em outro hardware não serve de base.

O que decide é a conta abaixo, com o número de títulos/s que o benchmark der para cada modelo:

- horas por noite para N editais = N ÷ (títulos/s × 3.600);
- a janela tem 5,5 h; com 40% dela para exemplos enquanto houver exemplo sem vetor, sobram 3,3 h;
- para 7.500 editais caberem em 3,3 h o modelo precisa de **≥ 0,63 títulos/s**; para caberem na
  janela inteira, ≥ 0,38 títulos/s.

Com a medição já feita em produção para o `bge-m3` (≈ 0,38 títulos/s com 2 CPUs, ≈ 2,6 s por
edital), 7.500 editais levam ≈ 5,5 h: a janela inteira, sem folga. E os ≈ 20 mil rótulos sem vetor
levariam ≈ 14,6 h, isto é, cerca de 7 noites a 40% da janela, com ≈ 4.500 editais por noite nesse
período. Se o `bge-m3` for mantido, as saídas são alargar a janela (por exemplo
`NIGHTLY_CATEGORY_WINDOW_START=22:00`), reduzir `NIGHTLY_CATEGORY_EXAMPLE_SHARE` ou aceitar que o
acervo antigo seja coberto ao longo de várias noites (os editais novos têm prioridade). Um modelo
mais rápido com acurácia parecida resolve as três coisas de uma vez.

### Qualidade medida localmente (sem tempos)

Sem acesso aos rótulos de produção, a medição local usou dados públicos: títulos (`objetoCompra`) da
API de consulta do PNCP, com rótulo "prata" de `category-rules.ts`, divididos 80/20 pelo mesmo hash
do `split`, mais o gabarito de 40 títulos do repositório. O aluno é o do código (`k = 7`, mínimo
0,42). Serve para comparar os modelos entre si; **não** é a concordância com a OpenAI, que sai toda
noite em `holdout` no resumo do job.

| Modelo | Dim. | Concordância no holdout (n = 214) | Cobertura (≥ 0,42) | Concordância nos cobertos | Abaixo de 0,6 | Concordância ≥ 0,6 | Concordância < 0,6 | Gabarito (40) |
|---|---|---|---|---|---|---|---|---|
| `bge-m3` | 1.024 | 66,4% | 77,1% | 77,0% | 63,6% | 91,0% | 52,2% | 24/40 |
| `embeddinggemma:300m` | 768 | 72,0% | 78,5% | 82,1% | 57,5% | 90,1% | 58,5% | 24/40 |
| `qwen3-embedding:0.6b` | — | não concluído localmente | | | | | | |

Amostra: 2.061 títulos públicos, 1.060 com rótulo das regras (846 de treino, 214 de holdout).

Como ler:

- **Os dois modelos empatam.** A diferença de 5,6 pontos em 214 casos cabe na margem de erro
  (≈ ±6 pontos); no gabarito, 24/40 para ambos. A qualidade não decide entre eles: decide a
  velocidade no servidor.
- **A confiança separa bem.** Acima de 0,6 o aluno concorda com o rótulo em ≈ 90% dos casos; abaixo,
  em 52–59%. É o que justifica mandar ao Jev só a parte de baixo.
- **A parcela "abaixo de 0,6" daqui não é previsão de produção.** São 846 vizinhos possíveis contra
  ≈ 4,5 mil já embutidos em produção (≈ 24 mil depois de embutir os rótulos da OpenAI); com mais
  vizinhos a confiança sobe. A parcela real sai em `holdout.belowJevThreshold` na primeira noite, e o
  teto diário segura o custo enquanto o limiar não é ajustado.
- O `qwen3-embedding:0.6b` não terminou a tempo na máquina local e fica para o benchmark do servidor.

## Custo

- Aluno: sem custo de API.
- Jev professor: no máximo `JEV_TEACHER_DAILY_LIMIT` chamadas por dia, cada uma com a lista de 29
  categorias e o título. A ≈ US$ 0,042 por milhão de tokens de entrada, 1.500 chamadas custam
  ≈ US$ 0,03 a US$ 0,06 por dia (estimativa para 400 a 1.000 tokens por chamada; nenhuma chamada
  real foi feita no desenvolvimento). O valor real sai em `jevCostUsd` no resumo e em
  `ai_title_usage`.
- Professor OpenAI desligado: os ≈ US$ 0,30/dia de títulos e categorias deixam de existir.

## Ativação

1. Fazer o merge do PR do app e levar a `main` para `ops/macbook-worker`. **Só depois** fazer o merge
   do PR de ops: o compose novo liga `CATEGORY_STUDENT_ENABLED=true`, e com o código antigo isso
   classificaria de dia, logo depois da coleta.
2. Deploy normal (`docker compose -f compose.macbook.yml [-f compose.macbook.tailscale.yml] up -d --build`).
   Sobem o serviço `ollama` (rede interna, 2 CPUs, 2 GB) e o one-shot `ollama-pull`, que baixa o
   modelo.
3. Conferir (`ops/macbook/monitor/ALBERT.md`, seção "Ollama e classificação noturna de categorias").
4. Na manhã seguinte, ler o resumo e ajustar o limiar se a parcela enviada ao Jev ficar fora de
   10–20% (abaixo).

## Verificação

Log por lote e resumo da noite (JSON do pino):

```sh
docker logs --since 10h licita-macbook-app-1 2>&1 | grep -E 'Nightly category (batch|classification summary)' | tail -n 5
```

O resumo traz `processed`, `reused`, `categorized`, `kept`, `lowConfidence`, `jevSent`, `jevTaught`,
`jevRejected`, `jevFailed`, `jevCostUsd`, `examplesEmbedded`, `examplesAdded`, `pendingTenders`,
`pendingExamples`, `jevBacklog`, `jevSkipped`, `stopped`, `durationMs` e `holdout`
(`agreement`, `coverage`, `agreementCovered`, `belowJevThreshold`, `thresholdForShare`, `bands`).
`durationMs ÷ processed` dá o tempo por edital da noite.

`holdout.agreement` é a concordância do aluno com o rótulo do professor (OpenAI ou Jev) em exemplos
que ele nunca usou. `holdout.belowJevThreshold` é a parcela que iria ao Jev com o limiar atual, e
`holdout.thresholdForShare` diz qual limiar mandaria 10%, 15% ou 20%: para mirar 15%, use o valor de
`p15` em `JEV_TEACHER_CONFIDENCE_THRESHOLD`.

`holdout.bands` dá a concordância por faixa de confiança (`from` ≤ confiança < `to`; a última inclui
1), só das faixas com exemplos. É o que mostra onde o aluno passa a errar demais: o limiar do Jev deve
ficar acima da faixa em que `agreement` cai, e `CATEGORY_STUDENT_MIN_CONFIDENCE` abaixo da qual a
categoria do aluno é pior que nenhuma.

```sh
docker logs --since 24h licita-macbook-app-1 2>&1 | grep 'Nightly category classification summary' | tail -n 1 \
  | jq -c '.holdout.bands[] | {faixa: "\(.from)–\(.to)", n: .total, acerto: .agreement}'
```

```sql
-- Execuções do job
select status, started_at, duration_ms / 60000 as minutos, error
from job_run_audit where job_key = 'nightly_category_classification'
order by started_at desc limit 5;

-- Parcela que vai ao Jev com o limiar atual, e com limiares vizinhos
select round(100.0 * count(*) filter (where category_confidence < 0.5) / count(*), 1) as abaixo_050,
       round(100.0 * count(*) filter (where category_confidence < 0.6) / count(*), 1) as abaixo_060,
       round(100.0 * count(*) filter (where category_confidence < 0.7) / count(*), 1) as abaixo_070
from tenders
where categorized_at > now() - interval '24 hours' and category_confidence is not null
  and category_source is distinct from 'teacher';

-- Jev professor nas últimas 24 h
select count(*) as chamadas, sum(input_tokens) as tokens, sum(estimated_cost_usd) as usd
from ai_title_usage where model like 'jev-teacher/%' and created_at > now() - interval '24 hours';
```

### Histórico da concordância

Toda execução que mede o holdout grava o resumo inteiro em `ingest_runs`, com
`source = 'nightly-category'`, `status = 'succeeded'`, `upserted` = editais categorizados pelo aluno,
`window_to` = fechamento da janela (identifica a noite) e `details` = o mesmo JSON do log. Uma noite
retomada depois de um restart grava uma linha por execução; vale a última da noite. Execuções sem
holdout (sem exemplos, ou paradas antes da medição) não entram. Não há migração: a tabela e a coluna
`details` já existem. Se a gravação falhar, o job registra um aviso e a noite segue.

```sql
-- Concordância por noite (última execução de cada noite)
select distinct on (noite) noite, details->>'embedModel' as modelo,
       (details->'holdout'->>'total')::int as n,
       (details->'holdout'->>'agreement')::numeric as concordancia,
       (details->'holdout'->>'coverage')::numeric as cobertura,
       (details->'holdout'->>'belowJevThreshold')::numeric as abaixo_do_limiar_jev,
       details->'holdout'->>'frozenAt' as prova_fixa_ate,
       (details->'holdoutRecent'->>'agreement')::numeric as concordancia_exemplos_novos
from (select (window_to at time zone 'America/Sao_Paulo')::date as noite, * from ingest_runs
      where source = 'nightly-category') r
order by noite desc, finished_at desc
limit 30;
```

O painel **Concordância do aluno** do dashboard admin e o alerta `nightly:agreement` do monitor
(branch `ops/macbook-worker`) leem esse histórico. O alerta compara a última noite com a mediana das
noites anteriores com o mesmo modelo de embedding e a mesma prova (`holdout.frozenAt`): trocar
`OLLAMA_EMBED_MODEL` ou `NIGHTLY_CATEGORY_HOLDOUT_FROZEN_AT` começa uma série nova, e o alerta espera
três noites dela. As noites anteriores a esta mudança mediram o holdout inteiro (`frozenAt` ausente) e não se
comparam com as seguintes.

Métricas Prometheus: `licitai_nightly_category_tenders_total{result}`,
`licitai_nightly_category_low_confidence_total`, `licitai_nightly_category_jev_total{result}`,
`licitai_nightly_category_jev_cost_usd_total`, `licitai_nightly_category_examples_embedded_total` e
`licitai_nightly_category_pending{kind}`; as execuções aparecem em
`licitai_scheduled_job_results_24h{job="nightly_category_classification"}`.

## Reversão

- `CATEGORY_STUDENT_ENABLED=false`: o job não agenda mais nada; as categorias já gravadas ficam.
- `TITLE_TEACHER_OPENAI_ENABLED=true`: a coleta volta a enfileirar e o worker volta a consumir a fila
  OpenAI, inclusive os jobs que ficaram `queued`.
- `JEV_TEACHER_ENABLED=false`: o aluno segue sozinho; os duvidosos ficam na fila do Jev.

## Limites conhecidos

- Editais novos só recebem a categoria do aluno na madrugada seguinte; até lá ficam com a das regras.
- Um edital `teacher` cujo título oficial muda mantém a categoria antiga (como já acontecia com o
  professor local); só o professor OpenAI, quando ligado, reavalia títulos alterados de `teacher`.
- O aluno roda no processo da API: classifica um edital por vez e devolve o controle ao event loop
  entre eles. Com ≈ 24 mil exemplos de 1.024 dimensões, a matriz ocupa ≈ 100 MB durante o job.
