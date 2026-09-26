# CLAUDE_HANDOFF-016 — índice parcial, retentativa e garantias

## Entrega

- O índice agora fica `ready` quando há ao menos um documento `ready` e nenhum processamento em curso. Documentos `failed` e `unsupported` não bloqueiam ficha/perguntas e entram em `unreadDocuments` tanto na ficha quanto em `GET /v1/tenders/:id/ask-status`.
- O GET continua iniciando a primeira indexação (ou uma nova indexação quando a lista/fingerprint muda), mas não repete downloads de documentos já falhos. As retentativas ficam no job `document-retry-job`, executado ao subir a API e depois a cada minuto.
- Falhas transitórias (timeout, erro de rede, HTTP 429 e 5xx) usam 5 min, 30 min, 2 h e depois 24 h. HTTP 404/outros 4xx, URL inválida, limite de tamanho e arquivo inválido/sem formato suportado são definitivos.
- Uma recuperação cria nova `indexVersion`, copia os trechos dos demais documentos e invalida naturalmente os caches de ficha e perguntas. Uma falha de reextração mantém documento/texto anterior `ready` e agenda outra tentativa, em vez de apagar a extração.
- `bid_guarantee` e `contract_guarantee` agora usam Choice `required | not_required | not_defined`. `not_required` exige trecho negativo explícito; ausência de trecho permanece `not_found`. `SHEET_PROMPT_VERSION` subiu de 1 para 2.

## Contrato final

`GET /api/v1/tenders/:id/ask-status` acrescenta o campo obrigatório:

```ts
unreadDocuments: number;
```

É a mesma contagem da ficha: documentos extraídos com status `failed` ou `unsupported`. Os documentos continuam listados em `documents`; metadados internos de retentativa não são expostos.

Na ficha, as categorias válidas passam a incluir:

```ts
bid_guarantee: "required" | "not_required" | null;
contract_guarantee: "required" | "not_required" | null;
```

`null` cobre Choice `not_defined` e confiança abaixo do limiar. Sem evidência, o campo é `status: "not_found"`, `answer: null`, `evidence: null`; nunca se infere `not_required` da ausência.

O OpenAPI e os clientes React/Zod foram regenerados. A UI manual em `artifacts/licitainsight/src/api/types.ts` ainda precisa receber `unreadDocuments` em `TenderAskStatus` e rótulos para as duas garantias; esse diretório ficou intocado conforme ownership.

## Persistência e migration

Migration `lib/db/migrations/0008_document_retry.sql` adiciona em `tender_ai_documents`:

- `attempt_count integer not null default 0`;
- `retryable boolean not null default false`;
- `next_retry_at timestamptz`;
- `last_attempt_at timestamptz`;
- check de tentativas não negativas e índice parcial dos retries pendentes.

A migration agenda uma tentativa para falhas legadas e promove índices legados `failed` para `ready` quando já havia ao menos um documento `ready`. Isso publica imediatamente a leitura parcial existente e deixa a recuperação restante para o job.

## Variável nova

- `AI_DOCUMENT_RETRY_MAX_ATTEMPTS=6` — teto total de tentativas por documento; depois do teto o documento permanece ilegível, sem novo `nextRetryAt`.

## Reteste real — `licita_cycle4`

Data: 25 set 2026. Banco: `postgres://licita:licita@localhost:5432/licita_cycle4`. Modelo: `jev-1.13.0`. O Postgres do Compose permaneceu em execução; nenhum container foi parado ou reiniciado.

- `…000086-2026`: antes da migration estava `failed`, versão 2, com 4 documentos legíveis e 1 falho. A migration publicou o parcial como `ready`; o job recuperou o documento PNCP na tentativa 2 e criou a versão 3. Resultado final: índice `ready`, 5 documentos legíveis, 0 não lidos, 166 trechos na versão atual; ficha `ready`, 13 campos, 8 encontrados, `unreadDocuments=0`, gerada em `2026-09-25T21:49:19.776Z`.
- `…000087-2026`: antes estava `failed`, versão 2, com 2 falhos e 2 `unsupported` (a extração legível anterior já havia sido removida pelo comportamento antigo). Nesta execução o PNCP respondeu: o job recuperou os dois PDFs na tentativa 2, criando as versões 3 e 4. Resultado final: índice `ready`, 2 documentos legíveis, 2 `unsupported`, 127 trechos na versão atual; ficha `ready`, 13 campos, 6 encontrados, `unreadDocuments=2`, gerada em `2026-09-25T21:49:21.195Z`.
- Nas duas fichas, `bid_guarantee` e `contract_guarantee` ficaram `not_found`; portanto não houve inferência negativa por ausência.

## Verificação e comandos

- `pnpm --dir lib/api-spec run codegen` — passou; OpenAPI e clientes React/Zod regenerados.
- `pnpm -w run typecheck:libs` — passou.
- `pnpm --dir artifacts/api-server run typecheck` — passou.
- `PNCP_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/licita_cycle4 pnpm --dir artifacts/api-server run test` — passou: 131/131, incluindo integrações PostgreSQL e o teste pelo `dist/tender-sheet-policy.mjs`.
- `PNCP_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/licita_cycle4 pnpm --dir artifacts/api-server exec tsx --test src/ai/tender-index.integration.test.ts` — passou. Cobre parcial `ready`, GET sem retry antes de `nextRetryAt`, preservação da extração numa nova falha e recuperação com incremento/cópia de versão.
- `PORT=24252 BASE_PATH=/ pnpm -w run build` — passou, incluindo `typecheck:libs`, typecheck dos artefatos, build do API server e builds Vite.
- Reteste real do job: `DATABASE_URL=... AI_DOCUMENT_TIMEOUT_MS=120000 pnpm --dir artifacts/api-server exec tsx -e '<runDocumentRetryBatch>'` — 3 tentativas, 3 recuperações (1 de `…086`, 2 de `…087`).
- Reteste real da ficha: `DATABASE_URL=... JEV_API_KEY=<somente no ambiente> JEV_MODEL=jev-1.13.0 pnpm --dir artifacts/api-server exec tsx -e '<getTenderSheet + polling>'` — as duas fichas ficaram `ready` nos resultados acima.

## Atenção para integração

- O frontend ainda calcula a contagem de não lidos a partir de `documents`; pode migrar para `status.unreadDocuments`, mantendo fallback durante a integração.
- A UI deve renderizar `required` como “Exige” e `not_required` como “Não exige” para ambas as garantias, sempre junto do trecho. `answer: null` continua “Sem resposta clara; veja o trecho”.
- Não foi feito push e não foram alterados `.gitignore`, `.env` nem `artifacts/licitainsight/**`.
