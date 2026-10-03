# AI v1 — Perguntar ao edital

O recurso procura trechos em documentos oficiais, usa o Jev para escolher evidências que respondem à pergunta e, quando a OpenAI está configurada, redige uma resposta curta com citações. Os trechos originais continuam disponíveis abaixo da resposta.

## Variáveis

- `JEV_API_KEY`: chave server-side obrigatória para perguntar.
- `JEV_MODEL`: versão fixa, padrão `jev-1.13.0`.
- `JEV_RELEVANCE_THRESHOLD`: limiar inicial, padrão `0.5`.
- `AI_SHORTLIST_SIZE`: máximo de trechos distintos enviados ao Jev por pergunta, padrão `10`.
- `AI_DAILY_ASK_LIMIT_TRIAL`: cota diária de teste, padrão `5`.
- `AI_DAILY_ASK_LIMIT_PAID`: cota diária paga, padrão `30`.
- `AI_MAX_DOCUMENT_BYTES`: limite por download, padrão `26214400`.
- `AI_MAX_PDF_PAGES`: limite por PDF, padrão `300`.
- `AI_DOCUMENT_TIMEOUT_MS`: tempo total do download de cada documento, incluindo o corpo, padrão `300000`. Em 02/10/2026 o PNCP entregou arquivos a 50–70 KB/s, e um ZIP de 6 MB levou 91 s; 5 minutos cobrem cerca de 15 MB nessa velocidade (o teto de `AI_MAX_DOCUMENT_BYTES` é 25 MB), e um estouro de tempo segue o retry transitório. O download roda no job de índice, que renova a visibilidade enquanto baixa os documentos em série.
- `AI_DOCUMENT_RETRY_MAX_ATTEMPTS`: teto de tentativas por documento, padrão `6`.
- `AI_DOCUMENT_HOSTS`: allowlist de hosts HTTPS separados por vírgula, padrão `pncp.gov.br`.
- `AI_DAILY_SHEET_LIMIT`: teto global de fichas novas por dia, padrão `500`.
- `AI_SHEET_EVIDENCE_THRESHOLD`: limiar Noul para considerar um trecho encontrado, padrão `0.5`.
- `AI_SHEET_ANSWER_THRESHOLD`: confiança mínima da Choice para expor a categoria, padrão `0.6`.
- `AI_SHEET_CANDIDATE_LIMIT`: máximo de candidatos lexicais por campo, padrão `6`.
- `AI_QUALIFICATION_CANDIDATE_LIMIT`: máximo de segmentos candidatos ao checklist por edital, padrão `40`.
- `OPENAI_API_KEY`: chave server-side opcional. Ausente desliga somente os resumos e preserva os trechos e a ficha atuais.
- `OPENAI_MODEL`: modelo de redação, padrão `gpt-4o-mini`.
- `OPENAI_BASE_URL`: base da API, padrão `https://api.openai.com/v1`.
- `OPENAI_TIMEOUT_MS`: timeout por tentativa, padrão `15000`.
- `OPENAI_INPUT_USD_PER_MTOK`: custo por milhão de tokens de entrada, padrão `0.15`.
- `OPENAI_OUTPUT_USD_PER_MTOK`: custo por milhão de tokens de saída, padrão `0.60`.

Os preços padrão do `gpt-4o-mini` foram conferidos em 02/10/2026 na [documentação oficial do modelo](https://developers.openai.com/api/docs/models/gpt-4o-mini): US$ 0,15 por 1 milhão de tokens de entrada e US$ 0,60 por 1 milhão de tokens de saída. As variáveis de preço permitem atualizar o cálculo sem alterar código.

## Rotas

### `GET /api/v1/tenders/:id/ask-status`

Exige sessão. Usuários com acesso vigente iniciam somente a primeira indexação ou uma nova versão quando a lista de documentos muda. Retentativas de documentos falhos são feitas por job próprio: o GET nunca baixa novamente antes de `nextRetryAt`.

A resposta inclui `unreadDocuments`, a contagem de documentos `failed` ou `unsupported`. O índice fica `ready` assim que há pelo menos um documento legível e nenhum documento em processamento; se nenhum documento puder ser lido, fica `failed` (ou `unsupported` quando todos os resultados são desse tipo).

### `POST /api/v1/tenders/:id/ask`

Exige sessão, CSRF e acesso vigente. Corpo: `{ "question": "texto de 3 a 300 caracteres" }`.

Retorna `answered` com até três trechos acima do limiar, `not_found` sem evidência suficiente ou `processing` enquanto o índice é construído. O link sempre aponta para o documento oficial e a página é explícita. A busca no índice combina os termos relevantes da pergunta, variações conhecidas de assuntos do edital (como vistoria/visita técnica) e uma busca ampla de apoio. Ela intercala os resultados, limita inicialmente a dois trechos por página e envia no máximo `AI_SHORTLIST_SIZE` candidatos ao Jev, que verifica quais realmente respondem à pergunta.

Quando o status é `answered` e a OpenAI está configurada, a resposta também pode trazer um campo aditivo:

```ts
summary: { text: string; citations: number[]; model: string } | null;
```

O `gpt-4o-mini` redige de uma a três frases em linguagem natural somente a partir dos trechos `[1..3]` que o Jev já selecionou. Cada afirmação deve citar um desses números; a API descarta texto vazio, texto acima de 600 caracteres, JSON inválido e citação fora da faixa. `not_found` e `processing` não chamam a OpenAI. Chave ausente, disjuntor aberto, timeout ou falha deixam `summary: null` e não transformam a rota em 5xx. A versão `2` do prompt invalida as respostas em cache da versão anterior, e o resumo não consome uma segunda unidade da cota diária do usuário.

Respostas concluídas ficam também em `tender_ai_answers`, compartilhadas por edital e versão do índice. A chave considera o hash SHA-256 da pergunta normalizada, modelos Jev/OpenAI, versão do prompt e parâmetros de busca/relevância; perguntas com a mesma redação (ignorando caixa e espaços extras) reutilizam os trechos e o resumo entre contas. Respostas antigas em `ai_ask_requests` são aproveitadas sob demanda para popular esse cache quando os parâmetros padrão da análise continuam válidos. Um acerto não chama Jev/OpenAI nem consome cota; ainda é registrado no histórico do usuário com custo zero. Se mudar só o modelo ou prompt da OpenAI, os trechos aprovados pelo Jev são reutilizados e somente o resumo é regenerado; seus tokens/custo entram no ledger, sem consumir uma unidade da cota de perguntas. Apenas o processo que reivindica uma entrada nova chama os modelos; concorrentes recebem a resposta pronta após uma espera curta ou `processing` para tentar de novo. A reivindicação expira em cinco minutos para recuperar falhas de processo.

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
  summary: { text: string; citations: number[]; model: string } | null;
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

A ficha, incluindo `qualificationChecklist`, é cache público global por `(tender, indexVersion, model, promptVersion)` e não contém nem envia dados de usuário ao Jev. A versão de prompt da ficha continua `3`; ligar ou trocar o modelo OpenAI invalida somente o resumo e não recalcula os campos. A criação consome o teto global diário, separado da cota de perguntas; hits de cache não consomem o teto.

O resumo opcional tem versão própria (`SHEET_SUMMARY_PROMPT_VERSION = 2`) e usa somente campos `found` e itens do `qualificationChecklist`, em 2 a 4 frases; as citações numéricas apontam para esses itens na ordem em que aparecem na resposta. A versão `2` substitui o esquema de resposta anterior para que fichas com resumo ausente possam ser tentadas novamente. Ausência só pode ser descrita como “não encontrado nos documentos lidos”, nunca como inexistência ou dispensa. Uma ficha nova pode gerar o resumo no próprio job `sheet`; uma ficha pronta com modelo ou versão diferente é devolvida imediatamente com `summary: null`, enquanto um job deduplicado `sheet_summary` chama somente a OpenAI e atualiza a mesma linha. Sem chave não há job; falha ou disjuntor aberto deixam o estado atual com resumo nulo, sem 5xx nem repetição do Jev. Tokens e custo aparecem no ledger como `sheet_summary`, sem entrar em `ai_sheet_daily_usage`, que mede apenas o teto e o custo do Jev para gerar fichas.

## Privacidade e retenção

Somente pergunta e trechos do edital são enviados ao Jev. Quando o resumo está habilitado, a OpenAI recebe a pergunta e no máximo os três trechos já selecionados; nenhum id, e-mail ou nome de usuário é enviado, e a chamada usa `store: false`. Perguntas ficam no export LGPD, são excluídas com a conta e expiram após 90 dias. O cache compartilhado guarda o hash da pergunta e o conteúdo público do edital, sem id de usuário nem texto da pergunta; por isso, apagar uma conta não apaga respostas úteis a outras contas. Respostas em cache não consomem nova cota.

Trechos, documentos extraídos e respostas compartilhadas são purgados 90 dias após `proposalDeadline`, exceto quando algum usuário salvou o edital. O edital permanece na base e o índice recebe um tombstone. `ask-status` e ficha sem cache retornam `expired`; ficha já pronta continua `ready`. `POST ask` retorna `409 CONFLICT` com `details: [{ "field": "index", "issue": "index_expired" }]`. Salvar o edital depois do purge permite uma nova indexação para o usuário que o salvou.
