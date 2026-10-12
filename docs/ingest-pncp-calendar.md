# Calendário de coleta do PNCP

A listagem histórica usa `ingest_days`, com chave `(source, day, modality, uf)`.
`day` é uma data em `America/Sao_Paulo`; `uf = all` representa a listagem nacional.
O calendário registra estado, páginas lidas, registros gravados, início e conclusão
da tentativa. Os editais continuam em `tenders`, sem alteração na busca.

## Coleta diária

Com a API no ar, a coleta incremental começa na subida do processo e de novo todo dia às 06:00 em `America/Sao_Paulo`. `PNCP_DAILY_HOUR` muda a hora (0–23). `PNCP_DAILY_COLLECT=false` desliga o agendamento. Cada execução usa o calendário: pula partições seladas, pede lacunas e hoje, e revisa editais em aberto até `PNCP_REFRESH_LIMIT`.

## Coleta incremental

Execute `pnpm --filter @workspace/api-server run collect:pncp` sem `PNCP_FROM`
ou `PNCP_TO`. Sem calendário, a janela inicial é de `PNCP_LOOKBACK_DAYS` (30 por
padrão), incluindo hoje. Nas execuções seguintes, o coletor pula as partições
seladas e consulta somente lacunas, UFs incompletas e dias ainda abertos.
O calendário não amplia o intervalo configurado: para recuperar dias anteriores
à janela após uma parada longa, aumentar `PNCP_LOOKBACK_DAYS` (até 366) ou usar
um backfill com datas explícitas.

Uma partição fica selada quando está `complete` e sua consulta **começou depois
do fim do dia de publicação**. Uma consulta iniciada antes da meia-noite e
concluída depois não sela esse dia. Hoje nunca é selado.

A tentativa é marcada `pending` antes da primeira página e só fica `complete`
após todas as páginas e gravações terminarem. Uma falha mantém a partição
pendente, com seus contadores parciais; a próxima execução reinicia na página 1.
O upsert por número de controle evita duplicar os editais.
Partições `pending` explícitas dentro da janela configurada são retomadas mesmo
quando existe uma partição nacional `all` já selada para o mesmo dia/modalidade;
isso cobre tentativas antigas interrompidas depois de uma divisão por UF.

Se a consulta nacional expirar, o coletor reparte o dia/modalidade por UF.
Cada UF tem sua própria conclusão. A próxima execução pede apenas as UFs que
ainda não foram seladas, sem tentar de novo a listagem nacional. Cobertura nacional
exige `all` selado ou todas as 27 UFs seladas.

## Backfill e revisão individual

- `PNCP_FROM` ou `PNCP_TO` força a releitura do intervalo, mesmo se já selado.
- `from` ou `to` no corpo de `POST /api/v1/ingest/pncp` tem o mesmo efeito.
- `days` no corpo ajusta a janela incremental; não força a releitura, desde que
  o ambiente também não defina datas explícitas.
- Um backfill invalida a cobertura anterior do escopo antes de começar. Se
  falhar, esse escopo permanece pendente para a próxima execução.
- `PNCP_UF` e `PNCP_MODALITIES` continuam restringindo o escopo.

Depois da listagem, `refreshOpenTenders` consulta cada compra pela API de
consulta e grava status, prazos e valor antes de tentar itens e arquivos pela
API de manutenção. A fila inclui `open`, `under_review` e `suspended`
com `fetched_at` anterior ao início da execução, em ordem do mais antigo.
`PNCP_REFRESH_LIMIT` mantém o padrão 200; `0` desliga essa revisão. Editais
encerrados permanecem no banco. `PNCP_REFRESH_MAX_CONSECUTIVE_FAILURES` (padrão 3) controla dois disjuntores independentes: falhas recuperáveis consecutivas na
consulta da compra interrompem a fila inteira; falhas no enriquecimento pulam
somente itens/arquivos dos próximos editais, mantendo a renovação de compra.
O mesmo limite interrompe a leitura de resultados da transparência. Uma compra
renovada não vira falha de refresh se seu enriquecimento falhar. O resumo da
execução separa compras renovadas, enriquecimentos concluídos, falhos e pulados.
404/410 e compras não encontradas mantêm a classificação anterior.

Chamadas à API de manutenção `/api/pncp/v1` usam
`PNCP_DETAIL_HTTP_TIMEOUT_MS=20000` e `PNCP_DETAIL_MAX_ATTEMPTS=2`; a API de
consulta continua usando `PNCP_HTTP_TIMEOUT_MS=60000` e até cinco tentativas.
Respostas 429 preservam a espera longa existente. O detalhe aberto pelo usuário
agenda o enriquecimento de forma assíncrona e a mesma política curta limita o
trabalho em segundo plano. `details_fetched_at` só é preenchido depois de itens
e arquivos serem gravados; enriquecimentos falhos/pulados continuam pendentes
quando a publicação mudou e, em qualquer caso, voltam à fila do refresh na
coleta seguinte.

Os seis coletores em memória (`pncp`, transparência, Mapas Culturais, fomento,
cultura federal e internacional) atualizam heartbeat a cada 30 s. Ao iniciar,
o processo da aplicação observa três intervalos (90 s) antes de marcar como
`failed`, com `interrupted by API restart` e `finished_at`, somente linhas cujo
heartbeat não avançou. Assim, comandos manuais ativos em outro processo ficam
preservados; os comandos `collect:*` não executam a reconciliação de startup.

## Cobertura na API

`GET /api/v1/ingest/pncp` mantém `run` e `indexUpdatedAt` e acrescenta `coverage`:

- `timeZone`, `from`, `to`, `uf`, `modalities`: escopo calculado pela configuração
  atual do servidor; pode diferir do recorte enviado no último POST.
- `sealedDays`: dias selados em **todas as modalidades e UFs do escopo**.
- `nextOpenDay`: primeiro dia ainda incompleto nesse intervalo, ou `null`.
- `days`: situação por dia/modalidade e `pendingScopes` (`all` ou UFs faltantes).
- `partitions`: registros do calendário, contadores, datas e indicador `sealed`.

Coletar apenas DF/modalidade 6 não significa que o Brasil inteiro foi coberto.
Uma partição `complete` de hoje também não é uma partição `sealed`.

As rotas HTTP de ingestão são operacionais e ficam desligadas por padrão. Para
habilitar `GET`/`POST /api/v1/ingest/pncp`, defina `INGEST_API_TOKEN` com pelo
menos 32 caracteres e envie `Authorization: Bearer <token>`. Sem segredo válido
no ambiente, a API responde `404 NOT_FOUND`; com segredo configurado e token
ausente ou incorreto, responde `401 UNAUTHENTICATED`. O agendamento diário e o
comando CLI `collect:pncp` não usam essas rotas e continuam funcionando sem o
token HTTP.

## Schema e verificação

Com `DATABASE_URL` disponível no ambiente, aplicar:

```sh
pnpm --filter @workspace/db run push-force
```

Os testes em `src/ingest/ingest-calendar.test.ts` cobrem o planejamento e a
virada do dia. `src/ingest/ingest-calendar.integration.test.ts` usa PostgreSQL
real em um schema temporário e respostas controladas do PNCP. Para ativá-lo,
definir `PNCP_TEST_DATABASE_URL` apontando para um banco local com o schema
da aplicação já aplicado. O schema temporário é removido no fim; as tabelas
originais não recebem os dados de teste.

Na pasta `artifacts/api-server`, com essa variável disponível:

```sh
pnpm exec node --import tsx --test src/ingest/ingest-calendar.test.ts src/ingest/ingest-calendar.integration.test.ts
```

A integração verifica duas execuções incrementais no mesmo recorte histórico:
a segunda lê zero páginas, mantém a contagem de editais e expõe a cobertura no
endpoint HTTP. Também verifica backfill forçado, falha na página 2, retomada por
UF e rotação da revisão individual. Duas execuções com datas explícitas de
backfill, por definição, **releem** o intervalo nas duas vezes.
