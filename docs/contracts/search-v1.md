# Contrato — Search API v1

Status: **PROPOSTO** pelo Claude Orchestrator (frontend) · aguardando confirmação do `CODEX_BACKEND_AGENT`
Handoff: `docs/handoffs/CODEX_HANDOFF-001-search.md`

O Codex é autoridade sobre a implementação backend (schema, índice, ranking). Este documento
fixa apenas a **forma pública** que o frontend consome. Mudanças de forma devem voltar como
`CLAUDE_HANDOFF` antes de serem implementadas.

## Convenções gerais

| Item | Regra |
|---|---|
| Base path | `/api/v1` |
| Formato | JSON UTF-8, chaves em `camelCase` |
| Enums | inglês, `snake_case` (o frontend traduz para PT-BR) |
| Datas | ISO 8601 com offset (`2024-11-04T09:00:00-03:00`); datas sem hora como `YYYY-MM-DD` |
| Dinheiro | `number` em reais com até 2 casas (`1847000.5`), campo pode ser `null` quando sigiloso/ausente |
| Campos ausentes | `null` explícito, nunca omitido, para campos declarados no schema |
| Arrays em query | parâmetro repetido: `?status=open&status=under_review` |
| Auth | v1 sem auth (dev). Preparar middleware para `Authorization: Bearer <token>` futuro |
| Versão | path (`/v1`). Mudança incompatível ⇒ `/v2` |

### Envelope de erro (todas as rotas)

```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "pageSize must be between 1 and 100",
    "details": [{ "field": "pageSize", "issue": "out_of_range" }],
    "requestId": "b1f0…"
  }
}
```

| HTTP | code | Quando |
|---|---|---|
| 400 | `INVALID_PARAMETER` | parâmetro inválido / fora de faixa / enum desconhecido |
| 404 | `NOT_FOUND` | licitação inexistente |
| 429 | `RATE_LIMITED` | incluir header `Retry-After` |
| 500 | `INTERNAL_ERROR` | falha inesperada |
| 503 | `SEARCH_UNAVAILABLE` | índice de busca indisponível (o frontend mostra estado degradado) |

## Enums

```ts
type TenderStatus = 'open' | 'under_review' | 'closed' | 'suspended' | 'cancelled';
type Modality = 'pregao_eletronico' | 'pregao_presencial' | 'concorrencia' | 'concorrencia_eletronica'
  | 'dispensa' | 'inexigibilidade' | 'credenciamento' | 'leilao' | 'dialogo_competitivo' | 'other';
type SortOption = 'relevance' | 'deadline_asc' | 'published_desc' | 'value_desc' | 'value_asc';
type SearchMode = 'keyword' | 'semantic' | 'hybrid';
```

`SearchMode`: v1 só precisa implementar `keyword`. `semantic`/`hybrid` podem responder como
`keyword` e sinalizar em `meta.searchMode` o modo realmente aplicado.

---

## 1. `GET /api/v1/tenders/search`

**Propósito:** busca paginada de licitações com filtros, ordenação e facets.

### Parâmetros (query)

| Nome | Tipo | Default | Notas |
|---|---|---|---|
| `q` | string | — | texto livre; vazio = listar tudo (ordenar por `published_desc` quando `sort=relevance` e `q` vazio) |
| `mode` | SearchMode | `keyword` | preparação para busca semântica |
| `status` | TenderStatus[] | — | OR entre valores |
| `modality` | Modality[] | — | OR |
| `state` | string[] (UF, 2 letras) | — | OR |
| `city` | string[] | — | código IBGE preferencial; nome aceito |
| `organizationId` | string[] | — | OR |
| `sourceId` | string[] | — | OR |
| `category` | string[] | — | slugs de categoria |
| `valueMin` / `valueMax` | number | — | sobre `estimatedValue`; registros com valor `null` são excluídos quando um dos dois é enviado |
| `publishedFrom` / `publishedTo` | date | — | inclusivo |
| `deadlineFrom` / `deadlineTo` | date | — | sobre `proposalDeadline`, inclusivo |
| `sort` | SortOption | `relevance` | |
| `page` | int ≥ 1 | 1 | |
| `pageSize` | int 1–100 | 20 | |
| `facets` | boolean | `true` | `false` pula o cálculo de facets |

Filtros diferentes combinam com AND. Facets devem ser calculados com **todos os filtros
aplicados exceto o próprio grupo** (disjunctive faceting), para que o usuário veja
contagens das outras opções do mesmo grupo.

### Resposta 200

```ts
{
  data: TenderSummary[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number; totalIsEstimate: boolean };
  facets: {
    status: FacetBucket[];
    modality: FacetBucket[];
    state: FacetBucket[];
    source: FacetBucket[];
    category: FacetBucket[];
    organization: FacetBucket[];   // top 20
    valueRange: { min: number | null; max: number | null };
  } | null;                        // null quando facets=false
  meta: {
    query: string | null;
    searchMode: SearchMode;         // modo efetivamente aplicado
    tookMs: number;
    indexUpdatedAt: string | null;  // última atualização do índice
  };
}

type FacetBucket = { value: string; label: string; count: number };

type TenderSummary = {
  id: string;                        // estável, URL-safe
  title: string;                     // objeto resumido
  objectSummary: string | null;      // até ~300 chars
  organization: { id: string; name: string };
  purchasingUnit: string | null;
  modality: Modality;
  modalityLabel: string;             // rótulo original da fonte
  status: TenderStatus;
  tenderNumber: string | null;       // ex. "Pregão Eletrônico 042/2024"
  estimatedValue: number | null;
  publishedAt: string | null;
  openingAt: string | null;
  proposalDeadline: string | null;
  location: { state: string | null; city: string | null; cityIbgeCode: string | null };
  source: { id: string; name: string; url: string | null };
  categories: { slug: string; label: string }[];
  relevance: {
    score: number | null;            // 0–1, null quando sort != relevance ou q vazio
    highlights: { field: 'title' | 'objectSummary' | 'items'; fragments: string[] }[];
    // fragments usam <mark>…</mark>; nenhuma outra tag HTML é permitida
  };
  updatedAt: string;
};
```

---

## 2. `GET /api/v1/tenders/{id}`

**Propósito:** detalhe completo de uma licitação.

Resposta 200: `TenderDetail = TenderSummary & { … }`

```ts
{
  description: string | null;
  processNumber: string | null;
  items: { id: string; description: string; quantity: number | null; unit: string | null; estimatedUnitValue: number | null; estimatedTotalValue: number | null }[];
  documents: { id: string; name: string; type: string; sizeBytes: number | null; url: string; publishedAt: string | null }[];
  timeline: { at: string; type: 'published' | 'amended' | 'deadline_changed' | 'status_changed' | 'document_added'; description: string }[];
  createdAt: string;
}
```

Erros: 404 `NOT_FOUND`.

---

## 3. `GET /api/v1/search/suggestions`

**Propósito:** autocomplete do campo de busca.

| Nome | Tipo | Default |
|---|---|---|
| `q` | string (≥ 2 chars) | obrigatório |
| `limit` | int 1–20 | 8 |

Resposta 200:

```ts
{ suggestions: { type: 'term' | 'organization' | 'category'; value: string; label: string; count: number | null }[] }
```

Meta de latência: p95 < 150 ms.

---

## Performance esperada

| Rota | p95 |
|---|---|
| `/tenders/search` (com facets) | < 500 ms |
| `/tenders/{id}` | < 200 ms |
| `/search/suggestions` | < 150 ms |

## Fora de escopo v1

Pesquisas salvas, licitações salvas, alertas, auth de usuário — virão em handoffs próprios.
