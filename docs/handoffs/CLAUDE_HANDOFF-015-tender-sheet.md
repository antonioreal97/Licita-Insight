# CLAUDE_HANDOFF-015 — ficha do edital

## Entrega

- `GET /api/v1/tenders/:id/sheet`: implementada com sessão + `requireSubscription`; `401`, `402` e `404` preservam os envelopes existentes.
- `GET /api/v1/tenders/:id/ask-status` e `POST /api/v1/tenders/:id/ask`: sem mudança de contrato. A ficha reutiliza exatamente o índice disparado pelo ask-status (`ensureTenderIndex`), sem índice paralelo.
- O estado público é `{ status, fields, unreadDocuments, model, generatedAt }`. Fora de `ready`, `fields` é vazio; em `ready`, contém os 13 ids na ordem do handoff.
- Ausência de candidato e melhor Noul abaixo de `0.5` resultam sempre em `not_found`. Choice `not_defined` ou confiança abaixo de `0.6` mantém `found` com `answer: null` e o trecho.
- O Jev recebe somente `{ trecho_do_edital }`: um request por trecho candidato, com uma Noul para cada campo candidatado pelo trecho. Apenas o melhor trecho de cada campo categórico recebe Choice.
- Cache global (sem user id) por `(tender_id, index_version, requested_model, prompt_version)`. `promptVersion = 1`; o segundo melhor trecho/Noul fica em `diagnostics`, fora do contrato público.
- Teto global separado `AI_DAILY_SHEET_LIMIT`, com contador, tokens e custo estimado por dia. Hit de cache não consome o teto nem a cota de perguntas do usuário.

## Contrato final

O contrato coincide com o item 3 do handoff e está documentado em [`docs/contracts/ai-v1.md`](../contracts/ai-v1.md) e no OpenAPI. Os ids são:

`consortium`, `subcontracting`, `me_epp`, `site_visit`, `samples`, `bid_guarantee`, `contract_guarantee`, `penalties`, `technical_qualification`, `financial_qualification`, `contract_term`, `delivery_term`, `price_adjustment`.

Enums categóricos: `consortium` (`allowed | forbidden | not_defined`), `subcontracting` (`allowed | limited | forbidden | not_defined`), `me_epp` (`exclusive | quota | benefits_only | not_defined`), `site_visit` (`mandatory | optional | waived | not_defined`) e `samples` (`required | not_required | not_defined`). `not_defined` é interno e sai como `answer: null`.

Além das respostas previstas, o OpenAPI explicita os erros operacionais já padronizados `429 AI_QUOTA_EXCEEDED` (teto diário global) e `503 AI_UNAVAILABLE` (Jev não configurado/indisponível).

## Persistência e migration

Migration `lib/db/migrations/0007_tender_sheet.sql`:

- `tender_ai_sheets`: cache global, campos públicos, diagnósticos (incluindo 2º melhor), modelo, tokens, custo e timestamps; unique index nos quatro componentes da chave.
- `ai_sheet_daily_usage`: uso global diário, tokens e custo.

O extrator passou à versão 3 porque agora remove bytes de controle inválidos para UTF-8/PostgreSQL; mensagens de falha também são sanitizadas e limitadas antes da persistência.

## Variáveis novas

- `AI_DAILY_SHEET_LIMIT=500`
- `AI_SHEET_EVIDENCE_THRESHOLD=0.5`
- `AI_SHEET_ANSWER_THRESHOLD=0.6`
- `AI_SHEET_CANDIDATE_LIMIT=6`
- `AI_DOCUMENT_TIMEOUT_MS=30000` (o run de calibração usou `120000` para downloads PNCP lentos)

## Calibração

Fonte: `postgres://licita:licita@localhost:5432/licita_cycle4`, 8.431 editais, três com documentos; modelo `jev-1.13.0`. Resultado completo, com melhor e segundo trechos de até 300 caracteres, está em `docs/handoffs/CODEX_HANDOFF-015-calibration.json`. Foram calibrados 39 campos; limiares mantidos em Noul `0.5` e Choice `0.6`.

Legenda: `p` = página do melhor; `n` = Noul; `n2` = segundo Noul; `a/c` = answer/confidence. `—` significa sem candidato/resultado.

### 03288908000483-1-000042-2026 (ready, 225 trechos, 26.092 tokens)

| campo | status | p | n | n2 | a/c |
|---|---:|---:|---:|---:|---|
| consortium | found | 6 | .98 | .88 | forbidden / 1.00 |
| subcontracting | found | 10 | .99 | .98 | forbidden / 1.00 |
| me_epp | not_found | 2 | .11 | .07 | — |
| site_visit | found | 1 | .92 | — | waived / .98 |
| samples | found | 7 | .97 | .94 | not_required / 1.00 |
| bid_guarantee | found | 13 | .94 | .62 | null / .94 |
| contract_guarantee | found | 12 | .91 | .59 | null / .91 |
| penalties | found | 19 | .98 | .96 | null / .98 |
| technical_qualification | found | 11 | .97 | .95 | null / .97 |
| financial_qualification | found | 1 | .98 | .98 | null / .98 |
| contract_term | found | 7 | .98 | .12 | null / .98 |
| delivery_term | found | 8 | .98 | .91 | null / .98 |
| price_adjustment | found | 16 | .98 | .98 | null / .98 |

### 34028316000103-1-000086-2026 (índice failed parcial, 159 trechos, 19.180 tokens)

Um documento PNCP expirou por timeout; os quatro documentos legíveis foram calibrados. A rota espelha `failed` e não publica esta ficha até um retry completar o índice; o run serve para revisão dos trechos disponíveis.

| campo | status | p | n | n2 | a/c |
|---|---:|---:|---:|---:|---|
| consortium | found | 5 | .98 | .98 | forbidden / 1.00 |
| subcontracting | found | 5 | .99 | .93 | forbidden / 1.00 |
| me_epp | found | 21 | .92 | .82 | benefits_only / .99 |
| site_visit | found | 8 | .66 | — | waived / .99 |
| samples | not_found | — | — | — | — |
| bid_guarantee | not_found | — | — | — | — |
| contract_guarantee | not_found | — | — | — | — |
| penalties | found | 23 | .98 | .97 | null / .98 |
| technical_qualification | found | 17 | .96 | .88 | null / .96 |
| financial_qualification | found | 18 | .98 | .98 | null / .98 |
| contract_term | found | 3 | .94 | — | null / .94 |
| delivery_term | not_found | 22 | .04 | .03 | — |
| price_adjustment | not_found | — | — | — | — |

### 34028316000103-1-000087-2026 (índice failed parcial, 120 trechos, 17.988 tokens)

Dois documentos expiraram por timeout e um era unsupported; o documento principal legível foi calibrado. A rota continua espelhando `failed` até retry bem-sucedido.

| campo | status | p | n | n2 | a/c |
|---|---:|---:|---:|---:|---|
| consortium | found | 4 | .98 | .98 | forbidden / 1.00 |
| subcontracting | found | 4 | .98 | .92 | limited / 1.00 |
| me_epp | found | 18 | .89 | .81 | benefits_only / .99 |
| site_visit | not_found | — | — | — | — |
| samples | not_found | — | — | — | — |
| bid_guarantee | not_found | — | — | — | — |
| contract_guarantee | not_found | — | — | — | — |
| penalties | found | 20 | .98 | .96 | null / .98 |
| technical_qualification | found | 14 | .94 | .91 | null / .94 |
| financial_qualification | found | 15 | .98 | .97 | null / .98 |
| contract_term | not_found | — | — | — | — |
| delivery_term | not_found | 2 | .04 | .03 | — |
| price_adjustment | not_found | — | — | — | — |

## Verificação e comandos

- `pnpm --dir lib/api-spec run codegen` — passou; clientes React e Zod regenerados.
- `pnpm -w run typecheck:libs` — passou.
- `pnpm --dir artifacts/api-server run typecheck` — passou.
- `pnpm --dir artifacts/api-server run build` — passou.
- `pnpm --dir artifacts/api-server run test` — passou: 98 testes, 2 suítes PostgreSQL opt-in ignoradas; inclui Jev mockado e `test:dist-sheet` contra `dist/tender-sheet-policy.mjs`.
- `PNCP_TEST_DATABASE_URL=… pnpm --dir artifacts/api-server exec tsx --test src/account/account.integration.test.ts` — passou: 18/18, incluindo `401/402/404/no_documents`, teto diário, cache compartilhado entre dois usuários e invalidação por versão do índice em schema isolado.
- `DATABASE_URL=… JEV_MODEL=jev-1.13.0 AI_DOCUMENT_TIMEOUT_MS=120000 pnpm --dir artifacts/api-server run calibrate:tender-sheet` — passou, 3 editais × 13 campos.

## Não verificado / atenção para integração

- A revisão humana campo a campo contra os PDFs oficiais, pedida pelo handoff, fica para Claude/owner. Em especial, revisar `site_visit` do edital `…000086…` (Noul .66) e as garantias do edital `…000042…`.
- Dois editais estavam parcialmente legíveis por timeout do PNCP. O JSON registra os resultados dos trechos existentes, mas a API corretamente continua retornando `failed` enquanto o índice estiver incompleto.
