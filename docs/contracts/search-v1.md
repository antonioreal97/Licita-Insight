# Contrato — Search API v1

Status: **ACEITO** pelo `CODEX_BACKEND_AGENT` sem alterações ([`docs/handoffs/CLAUDE_HANDOFF-001-search.md`](../handoffs/CLAUDE_HANDOFF-001-search.md)) · integrado ao frontend via `VITE_API_MODE=http`
Handoff: [`docs/handoffs/CODEX_HANDOFF-001-search.md`](../handoffs/CODEX_HANDOFF-001-search.md)

Nota de implementação: com `total = 0` a API retorna `totalPages = 0`; o frontend trata ambos (0 ou 1).

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
type SortOption = 'relevance' | 'deadline_asc' | 'published_desc' | 'first_seen_desc' | 'value_desc' | 'value_asc';
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
| `newOnly` | boolean | `false` | somente editais inseridos pela primeira vez no Pardal dentro de `NEW_TENDER_WINDOW_HOURS` (24 h por padrão) |
| `valueMin` / `valueMax` | number | — | sobre `estimatedValue`; registros com valor `null` são excluídos quando um dos dois é enviado |
| `publishedFrom` / `publishedTo` | date | — | sobre `publishedAt`, inclusivo, horário de Brasília |
| `deadlineFrom` / `deadlineTo` | date | — | sobre `proposalDeadline`, inclusivo, horário de Brasília |
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
    newCount: number;              // novos no período, aplicando os demais filtros
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
  title: string;                     // objeto oficial, preservado sem reescrita
  displayTitle: string;              // título padronizado; fallback para title
  displayTitleSource: 'rules' | 'model' | null;
  objectSummary: string | null;      // até ~300 chars
  organization: { id: string; name: string };
  purchasingUnit: string | null;
  modality: Modality;
  modalityLabel: string;             // rótulo original da fonte
  status: TenderStatus;
  tenderNumber: string | null;       // ex. "Pregão Eletrônico 042/2024"
  tenderNumberShort?: string | null; // ex. "042/2024", sem prefixo da modalidade
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
  firstSeenAt: string;               // primeira inserção no Pardal; não é a publicação no PNCP
  isNew: boolean;                    // calculado com o relógio do servidor
};
```

---

## 2. `GET /api/v1/tenders/{id}`

**Propósito:** mostrar imediatamente os dados já armazenados; itens e documentos do PNCP são enriquecidos em segundo plano.

Resposta 200: `TenderDetail = TenderSummary & { … }`

```ts
{
  description: string | null;
  processNumber: string | null;
  items: { id: string; description: string; quantity: number | null; unit: string | null; estimatedUnitValue: number | null; estimatedTotalValue: number | null }[];
  documents: { id: string; name: string; type: string; sizeBytes: number | null; url: string; publishedAt: string | null }[];
  timeline: { at: string; type: 'published' | 'amended' | 'deadline_changed' | 'status_changed' | 'document_added'; description: string }[];
  createdAt: string;
  detailsFetchedAt: string | null;
}
```

Em editais PNCP, `detailsFetchedAt: null` significa que `items` e `documents` ainda não foram
consultados; arrays vazios nesse estado **não** significam que a fonte não publicou nada. O GET agenda
essa consulta fora do tempo de resposta, sem duplicar trabalhos em andamento. O cliente pode consultar
novamente até `detailsFetchedAt` deixar de ser `null`. Respostas pendentes têm `Cache-Control: no-store`.

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

## v1.1 — aditivos

Os campos abaixo são aditivos. Rotas, parâmetros existentes e semântica da v1 permanecem
inalterados.

```ts
type EstimatedValueStatus = 'disclosed' | 'confidential' | 'not_published';

type ValueHistogramBucket = {
  from: number;
  to: number;
  count: number;
};
```

`TenderSummary` e, por herança, `TenderDetail` passam a incluir:

```ts
{
  estimatedValueStatus?: EstimatedValueStatus;
}
```

`estimatedValueStatus` é sempre `disclosed` quando `estimatedValue` não é `null`. Quando o
valor é `null`, diferencia sigilo (`confidential`) de ausência de publicação
(`not_published`).

Para registros PNCP, a classificação usa exclusivamente os campos estruturados
`orcamentoSigilosoCodigo` e `orcamentoSigilosoDescricao`: código `1` significa compra sem sigilo;
códigos `2` e `3` significam compra parcial ou totalmente sigilosa e resultam em
`estimatedValue: null` com `estimatedValueStatus: confidential`. O backend não infere sigilo a
partir de `objetoCompra` ou outro texto livre.

Referência de domínio: [Manual de Integração do PNCP](https://pncp.gov.br/manual/pt-br/latest/singlehtml/).

Quando `facets` é `true`, o objeto passa a incluir:

```ts
{
  city?: FacetBucket[]; // top 30; value=código IBGE, label="Município/UF"
  organization: FacetBucket[]; // top 20 + todos os organizationId selecionados
  groupTotals?: {
    status: number;
    modality: number;
    state: number;
    source: number;
    category: number;
    organization: number;
  };
  valueRange: {
    min: number | null;
    max: number | null;
    histogram?: ValueHistogramBucket[]; // escala logarítmica, máximo de 12 buckets
  };
}
```

Cada `groupTotals.<grupo>` representa o total de licitações após aplicar todos os filtros,
exceto o filtro daquele grupo. A facet `city` ignora apenas o próprio filtro `city` e continua
respeitando `state` e os demais filtros. Buckets de organizações selecionadas são sempre
incluídos, inclusive com `count: 0`; quando o identificador não for conhecido, o próprio ID é
usado como label.

Os campos v1.1 não-null são opcionais no schema para compatibilidade estrutural com clientes
v1, mas a implementação v1.1 os devolve sempre que `facets=true`; `estimatedValueStatus` é
sempre devolvido em resultados e detalhes.

`meta` passa a incluir:

```ts
{
  searchModeFallbackReason: 'not_available' | 'query_too_short' | null;
}
```

O motivo é `null` quando não há fallback. Na implementação keyword da v1.1, solicitações
`semantic` ou `hybrid` usam `query_too_short` para consultas normalizadas com menos de três
caracteres e `not_available` nos demais casos.

Em `/api/v1/search/suggestions`, `count` representa o número de licitações que a sugestão
retornaria e é preenchido para sugestões de termo, organização e categoria enquanto esse
cálculo permanecer barato.

---

## Aditivo — qualidade dos dados PNCP

Esta revisão é aditiva e explicita a proveniência dos campos PNCP já expostos. Não existe
mudança de rota ou de parâmetro.

### Datas do PNCP

| Campo público | Campo PNCP | Semântica |
|---|---|---|
| `publishedAt` | `dataPublicacaoPncp` | publicação do registro no PNCP |
| `openingAt` | `dataAberturaProposta` | início do recebimento de propostas; não representa sessão pública |
| `proposalDeadline` | `dataEncerramentoProposta` | encerramento do recebimento de propostas |

O payload de publicação atualmente consumido não fornece uma data de sessão pública separada.
Por isso, clientes devem rotular `openingAt` como **Início das propostas**. O adapter não infere
uma sessão a partir de outros campos.

### Campos derivados

`TenderSummary` e, por herança, `TenderDetail` passam a incluir:

```ts
{
  tenderNumberShort?: string | null;
}
```

Para o PNCP, `tenderNumberShort` é formado por `numeroCompra/anoCompra`, usando o ano de
`numeroControlePNCP` somente como fallback. `tenderNumber` permanece com o rótulo original da
modalidade para preservar compatibilidade. `title` preserva integralmente `objetoCompra`, enquanto
`objectSummary` é uma síntese mecânica de no máximo 300 caracteres, cortada no limite de palavra e
finalizada com `…`, sem reescrever o texto oficial.

O contrato de títulos padronizados acrescenta `displayTitle` e `displayTitleSource` conforme
[`tender-titles-v1.md`](./tender-titles-v1.md). A consulta textual pesquisa tanto o título
padronizado quanto o objeto oficial e os rótulos das categorias; assim, termos como `limpeza` e
`veículos` encontram os editais classificados com esses rótulos. Highlights com `field: title`
podem trazer o fragmento do título padronizado ou do título oficial, sem alterar os campos de
highlight existentes.

### Facets e relevância

Os labels canônicos de facets são:

- status: `Aberto`, `Em análise`, `Encerrado`, `Suspenso`, `Revogado`;
- modalidades: `Pregão eletrônico`, `Pregão presencial`, `Concorrência`,
  `Concorrência eletrônica`, `Dispensa`, `Inexigibilidade`, `Credenciamento`, `Leilão`,
  `Diálogo competitivo`, `Outra`.

Quando `sort=relevance` e existe consulta, o score é normalizado entre o menor e o maior score
da página retornada. Se todos os resultados da página tiverem a mesma pontuação, `score` é `null`
para não comunicar uma diferença inexistente. A ordenação continua usando a pontuação bruta e os
highlights permanecem disponíveis.

---

## Aditivo — plataforma de disputa

Aditivo, sem mudança de rota. `TenderSummary` e, por herança, `TenderDetail` passam a incluir:

```ts
{
  platform: {
    slug: string;            // "licitanet", "origem-ipm-sistemas", "outro-governancabrasil", "nao-informado"
    label: string;           // "Licitanet", "Sistema de origem: IPM Sistemas", "Outro sistema: Governançabrasil"
    kind: 'platform' | 'source_system' | 'other' | 'unknown';
    url: string | null;      // site da plataforma; só para kind = platform
  } | null;                  // null enquanto o registro não foi normalizado (antes do backfill)
}
```

A plataforma é derivada na ingestão do PNCP, só por regras, em
`artifacts/api-server/src/catalog/tender-platforms.ts`:

1. `usuarioNome` casa com uma sala de disputa conhecida (Compras.gov.br, Licitanet, BLL, BNC, Portal de
   Compras Públicas, Licitações-e, Licitar Digital, BBMNET, Licita Mais Brasil, ComprasBR, Contrata+Brasil,
   Pregão Banrisul e portais estaduais RS/MG/RJ/AM) → `kind: platform`;
2. senão, o host de `linkSistemaOrigem` ou `linkProcessoEletronico` é de uma sala conhecida → `kind: platform`;
3. senão, `usuarioNome` é software de gestão pública (IPM, Betha, Fiorilli…) → `kind: source_system`,
   rótulo "Sistema de origem: <nome>". Esses sistemas publicam no PNCP, mas não informam onde é a disputa;
4. qualquer outro nome → `kind: other`, rótulo "Outro sistema: <nome>";
5. sem `usuarioNome` nem link reconhecível → `nao-informado` / `kind: unknown`.

A API não inventa sala: o card mostra "Disputa em" só para `kind: platform`; o detalhe mostra todos os
casos, com a explicação de que a sala não foi identificada.

Registros anteriores são preenchidos pelo job `tender_platform_backfill` da própria API (papéis que rodam
jobs): ao subir e diariamente às 02:00 em `America/Sao_Paulo`, fora da coleta PNCP das 06:00, sob advisory
lock. Só roda enquanto existir edital com `platform is null`; percorre por `id` em lotes de 2.000 com pausa
de 1 s, registra o progresso de cada lote no log e pode ser interrompido e retomado sem efeito duplicado.
`PLATFORM_BACKFILL_BATCH_SIZE` ajusta o lote (1–5000) e `PLATFORM_BACKFILL_DAILY=false` desliga o
agendamento. Para uso local, `pnpm --filter @workspace/api-server run backfill:platform` executa o mesmo
percurso sem pausa.

### Filtro e facet

| Nome | Tipo | Notas |
|---|---|---|
| `platform` | string[] | slugs de `platform.slug`; OR entre valores |

Com `facets=true`, `facets.platform: FacetBucket[]` (label = `platform.label`) e
`facets.groupTotals.platform: number`, com a mesma regra disjuntiva dos demais grupos: a contagem
ignora apenas o próprio filtro `platform`. Buscas salvas preservam o parâmetro.

---

## Performance esperada

| Rota | p95 |
|---|---|
| `/tenders/search` (com facets) | < 500 ms |
| `/tenders/{id}` | < 200 ms |
| `/search/suggestions` | < 150 ms |

## Fora de escopo v1

Pesquisas salvas, licitações salvas, alertas, auth de usuário — virão em handoffs próprios.
