# AI v1 — Perguntar ao edital

O recurso retorna somente trechos extraídos de documentos oficiais. O Jev classifica evidência; ele não gera a resposta exibida.

## Variáveis

- `JEV_API_KEY`: chave server-side obrigatória para perguntar.
- `JEV_MODEL`: versão fixa, padrão `jev-1.13.0`.
- `JEV_RELEVANCE_THRESHOLD`: limiar inicial, padrão `0.5`.
- `AI_DAILY_ASK_LIMIT_TRIAL`: cota diária de teste, padrão `5`.
- `AI_DAILY_ASK_LIMIT_PAID`: cota diária paga, padrão `30`.
- `AI_MAX_DOCUMENT_BYTES`: limite por download, padrão `26214400`.
- `AI_MAX_PDF_PAGES`: limite por PDF, padrão `300`.
- `AI_DOCUMENT_HOSTS`: allowlist de hosts HTTPS separados por vírgula, padrão `pncp.gov.br`.

## Rotas

### `GET /api/v1/tenders/:id/ask-status`

Exige sessão. Usuários com acesso vigente iniciam a indexação assíncrona ao consultar a rota.

### `POST /api/v1/tenders/:id/ask`

Exige sessão, CSRF e acesso vigente. Corpo: `{ "question": "texto de 3 a 300 caracteres" }`.

Retorna `answered` com até três trechos acima do limiar, `not_found` sem evidência suficiente ou `processing` enquanto o índice é construído. O link sempre aponta para o documento oficial e a página é explícita.

Erros específicos: `402 SUBSCRIPTION_REQUIRED`, `429 AI_QUOTA_EXCEEDED` e `503 AI_UNAVAILABLE`.

## Privacidade e retenção

Somente pergunta e trechos do edital são enviados ao Jev. Perguntas ficam no export LGPD, são excluídas com a conta e expiram após 90 dias. Respostas em cache do próprio usuário não consomem nova cota.
