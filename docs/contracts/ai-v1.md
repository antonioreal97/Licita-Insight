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
- `AI_DOCUMENT_TIMEOUT_MS`: timeout do download de cada documento, padrão `30000`.
- `AI_DOCUMENT_RETRY_MAX_ATTEMPTS`: teto de tentativas por documento, padrão `6`.
- `AI_DOCUMENT_HOSTS`: allowlist de hosts HTTPS separados por vírgula, padrão `pncp.gov.br`.
- `AI_DAILY_SHEET_LIMIT`: teto global de fichas novas por dia, padrão `500`.
- `AI_SHEET_EVIDENCE_THRESHOLD`: limiar Noul para considerar um trecho encontrado, padrão `0.5`.
- `AI_SHEET_ANSWER_THRESHOLD`: confiança mínima da Choice para expor a categoria, padrão `0.6`.
- `AI_SHEET_CANDIDATE_LIMIT`: máximo de candidatos lexicais por campo, padrão `6`.
- `AI_QUALIFICATION_CANDIDATE_LIMIT`: máximo de segmentos candidatos ao checklist por edital, padrão `40`.

## Rotas

### `GET /api/v1/tenders/:id/ask-status`

Exige sessão. Usuários com acesso vigente iniciam somente a primeira indexação ou uma nova versão quando a lista de documentos muda. Retentativas de documentos falhos são feitas por job próprio: o GET nunca baixa novamente antes de `nextRetryAt`.

A resposta inclui `unreadDocuments`, a contagem de documentos `failed` ou `unsupported`. O índice fica `ready` assim que há pelo menos um documento legível e nenhum documento em processamento; se nenhum documento puder ser lido, fica `failed` (ou `unsupported` quando todos os resultados são desse tipo).

### `POST /api/v1/tenders/:id/ask`

Exige sessão, CSRF e acesso vigente. Corpo: `{ "question": "texto de 3 a 300 caracteres" }`.

Retorna `answered` com até três trechos acima do limiar, `not_found` sem evidência suficiente ou `processing` enquanto o índice é construído. O link sempre aponta para o documento oficial e a página é explícita.

Erros específicos: `402 SUBSCRIPTION_REQUIRED`, `429 AI_QUOTA_EXCEEDED` e `503 AI_UNAVAILABLE`.

## Ficha

### `GET /api/v1/tenders/:id/sheet`

Exige sessão e acesso vigente (`402 SUBSCRIPTION_REQUIRED` sem acesso; `404 NOT_FOUND` para edital inexistente). A consulta usa o mesmo índice de `ask-status`; não cria um índice exclusivo para a ficha nem executa retentativas de download. Enquanto a primeira indexação ou a ficha estiver em cálculo, retorna `processing` e a UI pode repetir a consulta com backoff.

Resposta:

```ts
type TenderSheet = {
  status:
    | "not_started"
    | "processing"
    | "ready"
    | "failed"
    | "no_documents"
    | "unsupported"
    | "expired";
  fields: SheetField[];
  qualificationChecklist: QualificationItem[];
  unreadDocuments: number;
  model: string | null;
  generatedAt: string | null;
};

type QualificationItem = {
  type:
    | "ato_societario"
    | "regularidade_fiscal"
    | "regularidade_trabalhista"
    | "qualificacao_tecnica"
    | "qualificacao_economica";
  evidence: {
    documentTitle: string;
    documentUrl: string;
    page: number;
    text: string;
  };
  confidence: number;
};

type SheetFieldId =
  | "consortium"
  | "subcontracting"
  | "me_epp"
  | "site_visit"
  | "samples"
  | "bid_guarantee"
  | "contract_guarantee"
  | "penalties"
  | "technical_qualification"
  | "financial_qualification"
  | "contract_term"
  | "delivery_term"
  | "price_adjustment";

type SheetField = {
  id: SheetFieldId;
  status: "found" | "not_found";
  answer: string | null;
  confidence: number | null;
  evidence: {
    documentTitle: string;
    documentUrl: string;
    page: number;
    text: string;
  } | null;
};
```

Fora de `ready`, `fields` é vazio. Em `ready`, há sempre os 13 ids na ordem acima. `unreadDocuments` conta documentos `failed` ou `unsupported` do índice.

`qualificationChecklist` é aditivo e fica vazio fora de `ready` ou quando nenhum requisito documental foi encontrado. Cada item reproduz um trecho oficial e sua página; o serviço não gera, completa nem infere requisitos ausentes. Um tipo ausente significa somente “não encontrado”, nunca “não exige”. A ordem é `ato_societario`, `regularidade_fiscal`, `regularidade_trabalhista`, `qualificacao_tecnica` e `qualificacao_economica`; um tipo pode aparecer mais de uma vez quando o edital exige documentos distintos.

Categorias válidas em `answer`: `consortium` (`allowed | forbidden`), `subcontracting` (`allowed | limited | forbidden`), `me_epp` (`exclusive | quota | benefits_only`), `site_visit` (`mandatory | optional | waived`), `samples` (`required | not_required`), `bid_guarantee` (`required | not_required`) e `contract_guarantee` (`required | not_required`). Os demais campos têm `answer: null` e mostram somente o trecho.

Ausência de trecho nunca é convertida em resposta negativa: resulta em `not_found`, com `answer`, `confidence` e `evidence` nulos. Em especial, garantias só recebem `not_required` quando o trecho diz explicitamente que não serão exigidas. Choice `not_defined` ou confiança abaixo de `AI_SHEET_ANSWER_THRESHOLD` mantém `status: found` e o trecho oficial, mas retorna `answer: null`.

Falhas transitórias de download (timeout, HTTP 429 e HTTP 5xx) são reagendadas após 5 minutos, 30 minutos, 2 horas e, daí em diante, uma vez por dia, até o teto configurado. HTTP 404, URL/arquivo inválido e limites de tamanho são definitivos. Uma recuperação incrementa `indexVersion`, invalida perguntas e fichas em cache e preserva os trechos dos demais documentos. Se a reextração falhar, uma extração anterior que ainda seja legível não é removida.

A ficha, incluindo `qualificationChecklist`, é cache público global por `(tender, indexVersion, model, promptVersion)` e não contém nem envia dados de usuário ao Jev. A versão de prompt atual é `3`. A criação consome o teto global diário, separado da cota de perguntas; hits de cache não consomem o teto.

## Privacidade e retenção

Somente pergunta e trechos do edital são enviados ao Jev. Perguntas ficam no export LGPD, são excluídas com a conta e expiram após 90 dias. Respostas em cache do próprio usuário não consomem nova cota.

Trechos, documentos extraídos e o índice são purgados 90 dias após `proposalDeadline`, exceto quando algum usuário salvou o edital. O edital permanece na base e o índice recebe um tombstone. `ask-status` e ficha sem cache retornam `expired`; ficha já pronta continua `ready`. `POST ask` retorna `409 CONFLICT` com `details: [{ "field": "index", "issue": "index_expired" }]`. Salvar o edital depois do purge permite uma nova indexação para o usuário que o salvou.
