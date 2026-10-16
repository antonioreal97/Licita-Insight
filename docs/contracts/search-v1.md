# Contrato — Search API v1

Status: **ACEITO** pelo `CODEX_BACKEND_AGENT` sem alterações ([`docs/handoffs/CLAUDE_HANDOFF-001-search.md`](../handoffs/CLAUDE_HANDOFF-001-search.md)) · integrado ao frontend via `VITE_API_MODE=http`
Handoff: [`docs/handoffs/CODEX_HANDOFF-001-search.md`](../handoffs/CODEX_HANDOFF-001-search.md)

Nota de implementação: com `total = 0` a API retorna `totalPages = 0`; o frontend trata ambos (0 ou 1).

O Codex é autoridade sobre a implementação backend (schema, índice, ranking). Este documento
fixa apenas a **forma pública** que o frontend consome. Mudanças de forma devem voltar como
`CLAUDE_HANDOFF` antes de serem implementadas.

## Convenções gerais

| Item            | Regra                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Base path       | `/api/v1`                                                                                      |
| Formato         | JSON UTF-8, chaves em `camelCase`                                                              |
| Enums           | inglês, `snake_case` (o frontend traduz para PT-BR)                                            |
| Datas           | ISO 8601 com offset (`2024-11-04T09:00:00-03:00`); datas sem hora como `YYYY-MM-DD`            |
| Dinheiro        | `number` em reais com até 2 casas (`1847000.5`), campo pode ser `null` quando sigiloso/ausente |
| Campos ausentes | `null` explícito, nunca omitido, para campos declarados no schema                              |
| Arrays em query | parâmetro repetido: `?status=open&status=under_review`                                         |
| Auth            | v1 sem auth (dev). Preparar middleware para `Authorization: Bearer <token>` futuro             |
| Versão          | path (`/v1`). Mudança incompatível ⇒ `/v2`                                                     |

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

| HTTP | code                 | Quando                                                            |
| ---- | -------------------- | ----------------------------------------------------------------- |
| 400  | `INVALID_PARAMETER`  | parâmetro inválido / fora de faixa / enum desconhecido            |
| 404  | `NOT_FOUND`          | licitação inexistente                                             |
| 429  | `RATE_LIMITED`       | incluir header `Retry-After`                                      |
| 500  | `INTERNAL_ERROR`     | falha inesperada                                                  |
| 503  | `SEARCH_UNAVAILABLE` | índice de busca indisponível (o frontend mostra estado degradado) |

## Enums

```ts
type TenderStatus =
  "open" | "under_review" | "closed" | "suspended" | "cancelled" | "direct";
type Modality =
  | "pregao_eletronico"
  | "pregao_presencial"
  | "concorrencia"
  | "concorrencia_eletronica"
  | "dispensa"
  | "inexigibilidade"
  | "credenciamento"
  | "leilao"
  | "dialogo_competitivo"
  | "other";
type SortOption =
  | "relevance"
  | "deadline_asc"
  | "published_desc"
  | "first_seen_desc"
  | "value_desc"
  | "value_asc";
type SearchMode = "keyword" | "semantic" | "hybrid";
```

`SearchMode`: v1 só precisa implementar `keyword`. `semantic`/`hybrid` podem responder como
`keyword` e sinalizar em `meta.searchMode` o modo realmente aplicado.

### Semântica de `TenderStatus`

| Valor | Rótulo | Quando |
| --- | --- | --- |
| `open` | Aberto | Há disputa ou janela ativa: pregão e afins; **dispensa eletrônica com** `proposal_deadline`; **credenciamento sem prazo** (chamamento contínuo = oportunidade real). Padrão da busca (`status=open`). |
| `direct` | Contratação direta | `modality` ∈ {`dispensa`, `inexigibilidade`} **e** `proposal_deadline` nulo. Continua pesquisável e no filtro Situação; **fora** do padrão Abertos. |
| `under_review` | Em análise | Prazo de proposta já passou (ou situação equivalente na fonte). |
| `closed` / `suspended` / `cancelled` | Encerrado / Suspenso / Revogado | Situação terminal na fonte. |

Pregão e outras modalidades sem prazo não são promovidos a `direct` (são poucos; revisar depois). Recomendações e alertas de perfil filtram `status = 'open'`, então `direct` não entra.

---

## 1. `GET /api/v1/tenders/search`

**Propósito:** busca paginada de licitações com filtros, ordenação e facets.

### Parâmetros (query)

| Nome                            | Tipo                    | Default     | Notas                                                                                                       |
| ------------------------------- | ----------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `q`                             | string                  | —           | texto livre; vazio = listar tudo (ordenar por `published_desc` quando `sort=relevance` e `q` vazio)         |
| `mode`                          | SearchMode              | `keyword`   | preparação para busca semântica                                                                             |
| `status`                        | TenderStatus[]          | —           | OR entre valores                                                                                            |
| `modality`                      | Modality[]              | —           | OR                                                                                                          |
| `state`                         | string[] (UF, 2 letras) | —           | OR                                                                                                          |
| `city`                          | string[]                | —           | código IBGE preferencial; nome aceito                                                                       |
| `organizationId`                | string[]                | —           | OR                                                                                                          |
| `sourceId`                      | string[]                | —           | OR                                                                                                          |
| `category`                      | string[]                | —           | slugs de categoria                                                                                          |
| `newOnly`                       | boolean                 | `false`     | somente editais inseridos pela primeira vez no Pardal dentro de `NEW_TENDER_WINDOW_HOURS` (24 h por padrão) |
| `notification`                  | string                  | —           | exige sessão; restringe aos até 20 `tenderIds` do snapshot de uma notificação `saved_search_new_matches` ou `profile_new_matches` do usuário logado |
| `myRegion`                      | boolean                 | `false`     | exige sessão e aplica a região salva no perfil, incluindo raio e categorias remotas                         |
| `valueMin` / `valueMax`         | number                  | —           | sobre `estimatedValue`; registros com valor `null` ou marcado como implausível (`estimatedValueFlag`) são excluídos quando um dos dois é enviado |
| `publishedFrom` / `publishedTo` | date                    | —           | sobre `publishedAt`, inclusivo, horário de Brasília                                                         |
| `deadlineFrom` / `deadlineTo`   | date                    | —           | sobre `proposalDeadline`, inclusivo, horário de Brasília                                                    |
| `sort`                          | SortOption              | `relevance` |                                                                                                             |
| `page`                          | int ≥ 1                 | 1           |                                                                                                             |
| `pageSize`                      | int 1–100               | 20          |                                                                                                             |
| `facets`                        | boolean                 | `true`      | `false` pula o cálculo de facets                                                                            |

Filtros diferentes combinam com AND. Facets devem ser calculados com **todos os filtros
aplicados exceto o próprio grupo** (disjunctive faceting), para que o usuário veja
contagens das outras opções do mesmo grupo.

`notification` não faz parte da query canônica de uma busca salva. Sem sessão, responde 401.
Um id inexistente, de outro usuário ou de outro tipo de notificação responde 200 com lista vazia
e `meta.notification: null`, sem revelar se a notificação existe. Editais removidos da base são
simplesmente omitidos. O filtro não exige assinatura além das regras normais da busca pública.

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
    notification?: {
      id: string;
      type: 'saved_search_new_matches' | 'profile_new_matches';
      createdAt: string;
      matchCount: number;
      storedTenderCount: number;
      savedSearchName: string | null;
      savedSearchQuery: string | null;
    } | null;
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
  items: {
    id: string;
    description: string;
    quantity: number | null;
    unit: string | null;
    estimatedUnitValue: number | null;
    estimatedTotalValue: number | null;
  }
  [];
  documents: {
    id: string;
    name: string;
    type: string;
    sizeBytes: number | null;
    url: string;
    publishedAt: string | null;
  }
  [];
  timeline: {
    at: string;
    type: "published" |
      "amended" |
      "deadline_changed" |
      "status_changed" |
      "document_added";
    description: string;
  }
  [];
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

| Nome    | Tipo               | Default     |
| ------- | ------------------ | ----------- |
| `q`     | string (≥ 2 chars) | obrigatório |
| `limit` | int 1–20           | 8           |

Resposta 200:

```ts
{
  suggestions: {
    type: "term" | "organization" | "category";
    value: string;
    label: string;
    count: number | null;
  }
  [];
}
```

Meta de latência: p95 < 150 ms.

---

## v1.1 — aditivos

Os campos abaixo são aditivos. Rotas, parâmetros existentes e semântica da v1 permanecem
inalterados.

```ts
type EstimatedValueStatus = "disclosed" | "confidential" | "not_published";

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
  searchModeFallbackReason: "not_available" | "query_too_short" | null;
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

| Campo público      | Campo PNCP                 | Semântica                                                         |
| ------------------ | -------------------------- | ----------------------------------------------------------------- |
| `publishedAt`      | `dataPublicacaoPncp`       | publicação do registro no PNCP                                    |
| `openingAt`        | `dataAberturaProposta`     | início do recebimento de propostas; não representa sessão pública |
| `proposalDeadline` | `dataEncerramentoProposta` | encerramento do recebimento de propostas                          |

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

- status: `Aberto`, `Em análise`, `Encerrado`, `Suspenso`, `Revogado`, `Contratação direta`;
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
Na imagem de produção: `docker exec licita-macbook-app-1 node artifacts/api-server/dist/backfill-platform.mjs`. Usa o mesmo lock `tender_platform_backfill` do job agendado.

### Filtro e facet

| Nome       | Tipo     | Notas                                      |
| ---------- | -------- | ------------------------------------------ |
| `platform` | string[] | slugs de `platform.slug`; OR entre valores |

Com `facets=true`, `facets.platform: FacetBucket[]` (label = `platform.label`) e
`facets.groupTotals.platform: number`, com a mesma regra disjuntiva dos demais grupos: a contagem
ignora apenas o próprio filtro `platform`. Buscas salvas preservam o parâmetro.

---

## Aditivo — valor estimado fora da curva

O PNCP às vezes traz valores estimados com erro de várias ordens de grandeza (uma dispensa de coletes
balísticos de R$ 938.761.000.000). Um único registro assim domina qualquer soma ou ranking. O valor oficial
nunca é corrigido nem escondido: a API marca o registro e deixa o valor fora das contas.

```ts
type EstimatedValueFlag = "absolute_ceiling" | "dispensa_legal_limit" | "modality_outlier";
// TenderSummary e TenderDetail
{
  estimatedValueFlag?: EstimatedValueFlag | null; // null: nenhuma dúvida sobre o valor
}
```

### Regra

Função pura `assessEstimatedValue` (`artifacts/api-server/src/domain/estimated-value-plausibility.ts`),
da afirmação mais forte para a mais fraca. Prefere deixar passar um erro a acusar um valor legítimo:

| Motivo                 | Marca quando                                                                                   | Limite                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `absolute_ceiling`     | qualquer modalidade acima do teto                                                              | R$ 100 bilhões                           |
| `dispensa_legal_limit` | dispensa com amparo legal por valor (Lei 14.133/2021, art. 75, I ou II) mil vezes acima do limite legal | 1.000 × R$ 125.451,15 ≈ R$ 125 milhões |
| `modality_outlier`     | valor acima de 1.000 × o p99 da modalidade                                                     | dispensa R$ 1,3 bi; inexigibilidade R$ 6 bi; pregão presencial R$ 15 bi; credenciamento R$ 30 bi; pregão eletrônico R$ 80 bi |

- Concorrência, diálogo competitivo, leilão e "outra" só têm o teto absoluto: é por elas que saem as
  concessões de dezenas de bilhões.
- Dispensa por emergência e pelos demais incisos do art. 75 não tem limite legal: só o limite da modalidade.
  O amparo vem de `amparoLegal.nome` da publicação; sem amparo reconhecido, o limite legal não se aplica.
- Valor ausente, sigiloso, zero ou negativo nunca é marcado.
- Falsos negativos aceitos: erro de poucas ordens de grandeza dentro de uma modalidade com cauda legítima
  longa (um pregão de R$ 5 bi não se distingue, só pela modalidade, de um registro de preços nacional).

Os p99 de referência saíram de uma amostra **sintética** (`estimated-value-sample.ts`), moldada pelos
quantis medidos nos editais abertos; `pnpm --filter @workspace/api-server run calibrate:estimated-value`
imprime a amostra, os limites, os casos conhecidos e a simulação de Alagoas. Para recalibrar com dados
reais: `select modality, percentile_cont(0.99) within group (order by estimated_value) from tenders where
estimated_value > 0 group by modality`. Nenhum limite pode ficar abaixo de R$ 100 milhões
(`ESTIMATED_VALUE_REVIEW_FLOOR`), que é o predicado do índice lido pelo job; um teste garante isso.

### Efeito

| Onde                                             | Edital com `estimatedValueFlag`                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Resultados da busca e detalhe                    | continua aparecendo, com `estimatedValue` oficial e o flag              |
| `sort=value_desc` / `value_asc`                  | vai para o fim, depois dos editais sem valor                            |
| `valueMin` / `valueMax`                          | não casa com nenhuma faixa, como um valor ausente                       |
| `facets.valueRange` (mín., máx., histograma)     | fica fora                                                               |
| `GET /api/v1/public/tenders/by-state`            | conta em `openTenders`, não soma em `estimatedValueTotal`               |
| Recomendações                                    | não alarga a faixa inferida dos salvos; não pontua a favor nem contra   |
| Aderência ao perfil (`out_of_value_range`)       | não elimina o edital                                                    |

### Preenchimento

A coleta marca o que coleta (e limpa o flag quando a fonte corrige o valor). O histórico e as mudanças de
limite ficam com o job `tender_estimated_value_review` da própria API (papéis que rodam jobs): ao subir e
diariamente às 01:00 em `America/Sao_Paulo`, fora da coleta PNCP das 06:00, sob advisory lock. Lê só os
editais com valor a partir de R$ 100 milhões (índice parcial `tenders_estimated_value_review_idx`), por `id`
em lotes de 1.000 com pausa de 1 s, e só grava onde o flag muda — uma segunda execução não grava nada e uma
execução interrompida é simplesmente repetida. `ESTIMATED_VALUE_REVIEW_BATCH_SIZE` ajusta o lote (1–5000) e
`ESTIMATED_VALUE_REVIEW_DAILY=false` desliga o agendamento. Para uso local,
`pnpm --filter @workspace/api-server run review:estimated-values` executa o mesmo percurso sem pausa.
Na imagem de produção: `docker exec licita-macbook-app-1 node artifacts/api-server/dist/review-estimated-values.mjs`. Usa o mesmo lock `tender_estimated_value_review` do job agendado.

## Aditivo — destaques do card

O payload da busca não muda: a resposta tem cache HTTP público e os destaques resumem a ficha, que é recurso
pago. O card do edital (busca, editais salvos e prioridades da visão geral) mostra até duas linhas curtas a
partir de dados já carregados em lote pela página — o principal motivo da aderência (`GET /me/fit`) e as
exigências-chave da ficha pronta (`GET /me/tender-highlights`, ver `ai-v1.md`). A plataforma de disputa e o
aviso “Você ainda não é cadastrado nesta plataforma” continuam no selo de plataforma do card. Sem dado, o card
fica como antes. Nenhuma das duas leituras gera ficha.

## Performance esperada

| Rota                           | p95      |
| ------------------------------ | -------- |
| `/tenders/search` (com facets) | < 500 ms |
| `/tenders/{id}`                | < 200 ms |
| `/search/suggestions`          | < 150 ms |

## Fora de escopo v1

Pesquisas salvas, licitações salvas, alertas, auth de usuário — virão em handoffs próprios.
