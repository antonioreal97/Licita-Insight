# CLAUDE_HANDOFF

**ID:** CLAUDE_HANDOFF-011

**Feature:** Onda 3, fatia 1 — Perguntar ao edital com Jev

**Status:** READY_FOR_CLAUDE

**Contrato:** aceito, sem breaking change. Contrato final em `docs/contracts/ai-v1.md` e OpenAPI em `lib/api-spec/openapi.yaml`.

## Rotas

### `GET /api/v1/tenders/:id/ask-status`

**Status:** implementada e validada.

**Autenticação:** sessão `licita_session`; não exige assinatura para leitura. A indexação assíncrona só é disparada para usuário com trial, assinatura ou entitlement de desenvolvimento vigente.

**Resposta:** `{ index, documents, quota }`, conforme contrato. Estados: `not_started`, `processing`, `ready`, `failed`, `no_documents`, `unsupported`.

**Erros:** `401 UNAUTHENTICATED`, `404 NOT_FOUND`.

### `POST /api/v1/tenders/:id/ask`

**Status:** implementada e validada com Jev real.

**Autenticação:** sessão + CSRF + acesso vigente.

**Request:** `{ "question": "texto de 3 a 300 caracteres" }`.

**Resposta:** `answered`, `not_found` ou `processing`; até três trechos oficiais, ordenados por `relevance`, sempre com documento, URL oficial e página. Nenhum texto é gerado pelo Jev.

**Erros:** `400 INVALID_PARAMETER`, `401 UNAUTHENTICATED`, `402 SUBSCRIPTION_REQUIRED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `429 AI_QUOTA_EXCEEDED`, `503 AI_UNAVAILABLE`.

## Implementação

- Extração PDF nativa por página com `pdfjs-dist`; PDFs em ZIP são abertos com `fflate` e mantêm o nome interno.
- Downloads exigem HTTPS e host em allowlist; ZIP limita quantidade e tamanho descompactado para reduzir SSRF e zip bombs.
- Normalização `NFKC`, remoção de U+FFFD e de cabeçalhos/rodapés repetidos na maioria das páginas.
- PDF sem texto vira `unsupported`; OCR permanece fora do escopo.
- Trechos de aproximadamente 700 caracteres, com página, ordem e `tsvector('portuguese')` persistido e índice GIN.
- Shortlist textual usa união ranqueada de lexemas em português. O smoke real detectou e corrigiu a estratégia inicialmente restritiva por todos os termos.
- Jev via `@typesafe-ai/sdk`, chave passada explicitamente, modelo fixo padrão `jev-1.13.0`, timeout e erro tipado.
- Limiar inicial confirmado em `0.5`; somente passagens acima dele são devolvidas.
- Cota por dia de Brasília com lock transacional: padrão trial `5`, pago/dev `30`; reset à meia-noite em `America/Sao_Paulo`.
- Cache é deliberadamente escopado por usuário, além de tender/pergunta normalizada/versão/modelo. Isso evita reter ou compartilhar perguntas pessoais entre contas; hit sequencial não consome cota.
- Tokens de entrada, modelo retornado e custo estimado são registrados.
- Perguntas entram no export LGPD, são removidas no delete e têm limpeza diária após 90 dias.
- Falhas de indexação são recuperáveis; `processing` abandonado é retomado após 15 minutos.

## Calibração Jev

**Artefato bruto:** `docs/handoffs/CODEX_HANDOFF-011-calibration.json`.

**Execução:** 3 editais reais disponíveis no PostgreSQL × 10 perguntas típicas = 30 perguntas. Foram feitas 295 classificações; o relatório desta execução preserva os três melhores por pergunta (90 candidatos, 51.333 tokens nesse subconjunto e 32 acima de `0.5`). Pela média observada, o custo total estimado foi US$ 0,0071. O script foi ajustado para registrar tokens e todos os candidatos nas próximas execuções.

**Amostras observadas:**

- Consórcio: `0,98` no SESC e `0,97` nos dois editais dos Correios.
- Penalidades/multa: `0,94`, `0,76` e `0,67` nos três editais.
- ME/EPP: ausência coerente no SESC (`0,05`) e evidência nos Correios (`0,87` e `0,96`).
- Visita técnica: evidência em um edital (`0,93`) e ausência nos outros (`0,16` e `0,06`).
- Smoke da camada final: consórcio retornou `answered`, `0,98`, página 4; visita técnica ausente retornou `not_found`; repetição em cache manteve a cota inalterada.

**Limiar proposto:** manter `0.5`. As separações observadas foram fortes; valores limítrofes devem ser reavaliados com telemetria e revisão humana antes de qualquer ajuste.

**Limitação do passo 0:** o banco local continha apenas 3 licitações com anexos. A tentativa de enriquecer até 5 foi bloqueada por timeout e depois rate limit do PNCP. Não foram fabricados dados. O script mantém requisito padrão de 5 e permite reproduzir a amostra atual com `AI_CALIBRATION_MIN_TENDERS=3`; a expansão para 5 deve ser repetida quando o PNCP liberar as consultas.

## Banco e Migration

**Migration required:** YES — `lib/db/migrations/0005_ask_tender.sql`.

Tabelas: `tender_ai_indexes`, `tender_ai_documents`, `tender_ai_passages`, `ai_daily_usage`, `ai_ask_requests`.

## Comandos

Stack completa:

```bash
docker compose up --build
```

API no host, usando o `.env` da raiz:

```bash
pnpm --filter @workspace/db run migrate
pnpm --filter @workspace/api-server run dev
```

Calibração padrão, quando houver cinco editais enriquecidos:

```bash
pnpm --filter @workspace/api-server run calibrate:jev
```

## Configuração

- `JEV_API_KEY` obrigatória apenas para `POST /ask`; ausência retorna `503 AI_UNAVAILABLE` sem afetar o restante da API.
- `JEV_MODEL=jev-1.13.0` recomendado.
- O frontend não recebe nem conhece a chave.
- Demais opções estão documentadas em `docs/contracts/ai-v1.md`.

## Validação

- Typecheck de libs e API: PASS.
- Build da API: PASS.
- Build Docker `api`: PASS.
- Testes completos com PostgreSQL: 107 PASS, 0 FAIL.
- Testes focados finais: 26 PASS, 0 FAIL.
- OpenAPI + clientes React/Zod regenerados: PASS.
- Migration aplicada em banco local: PASS.
- Smoke real PDF/ZIP → índice → `tsvector` → Jev → evidência oficial: PASS.

## Frontend

- Pode integrar diretamente usando os tipos gerados em `lib/api-client-react/src/generated`.
- Enquanto `index=processing`, refazer `GET ask-status` com backoff curto.
- Em `not_found`, mostrar explicitamente que nenhuma evidência suficiente foi encontrada.
- Manter o aviso fixo para conferência do edital original.
- `documentUrl` abre o documento oficial; usar `page` no rótulo do link.

**Breaking changes:** NO

**READY_FOR_CLAUDE:** YES
