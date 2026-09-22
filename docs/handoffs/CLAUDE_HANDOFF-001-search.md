```text
CLAUDE_HANDOFF

ID: CLAUDE_HANDOFF-001

Feature: Search — resultados, filtros e facets

Status: READY_FOR_CLAUDE

Contract decision:
  ACEITO sem alteração da forma pública descrita em docs/contracts/search-v1.md.
  semantic e hybrid são aceitos como entrada e degradados para keyword; a resposta informa
  meta.searchMode="keyword", conforme permitido pelo contrato v1.

Base URL local: http://localhost:3001/api

Command to start API:
  PORT=3001 pnpm --config.verify-deps-before-run=false --dir artifacts/api-server run dev

Route status:
  READY  GET /api/v1/tenders/search
         Busca textual accent-insensitive, arrays por parâmetros repetidos, AND entre grupos,
         OR dentro do grupo, facets disjuntivos, ordenação, paginação 1-based, highlights seguros
         com apenas <mark>, facets=false e fallback de mode para keyword.

  READY  GET /api/v1/tenders/{id}
         Detalhe completo e erro 404 NOT_FOUND no envelope padrão.

  READY  GET /api/v1/search/suggestions
         Sugestões de termo, organização e categoria; q mínimo de 2 caracteres após trim;
         limit entre 1 e 20.

Request schema:
  Conforme docs/contracts/search-v1.md e lib/api-spec/openapi.yaml.
  Arrays de filtro usam parâmetros repetidos (style=form, explode=true).

Response schema:
  Conforme docs/contracts/search-v1.md. OpenAPI, Zod e cliente React foram regenerados.

Error responses:
  Implementados: 400 INVALID_PARAMETER, 404 NOT_FOUND e 500 INTERNAL_ERROR.
  Contratados e documentados para extensão: 429 RATE_LIMITED e 503 SEARCH_UNAVAILABLE.
  Todas as respostas de erro incluem requestId; X-Request-Id também é devolvido no header.

Authentication:
  Nenhuma na v1. O roteamento permanece desacoplado para inclusão futura de middleware Bearer.

Pagination:
  page default 1; pageSize default 20, intervalo 1–100; total exato e totalIsEstimate=false.

Filtering:
  q, mode, status[], modality[], state[], city[], organizationId[], sourceId[], category[],
  valueMin, valueMax, publishedFrom, publishedTo, deadlineFrom e deadlineTo.

Sorting:
  relevance, deadline_asc, published_desc, value_desc e value_asc.
  relevance sem q usa published_desc, como definido no contrato.

Example request:
  GET http://localhost:3001/api/v1/tenders/search?q=termo-inexistente&page=1&pageSize=20&sort=relevance

Example response:
  {
    "data": [],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 0,
      "totalPages": 0,
      "totalIsEstimate": false
    },
    "facets": {
      "status": [],
      "modality": [],
      "state": [],
      "source": [],
      "category": [],
      "organization": [],
      "valueRange": { "min": null, "max": null }
    },
    "meta": {
      "query": "termo-inexistente",
      "searchMode": "keyword",
      "tookMs": 0.5,
      "indexUpdatedAt": "2026-09-20T12:00:00.000Z"
    }
  }

Data status:
  A API usa 60 registros sintéticos, explicitamente identificados como fixture, cobrindo todos
  os status, modalidades, múltiplas UFs, valores null e título longo. O repositório em memória
  é substituível por adapter de banco/search sem alterar o contrato público. Não usar essas
  fixtures como dados reais ou de produção.

Performance notes:
  As rotas executaram em milissegundos nos testes locais com 60 fixtures. As metas p95 do
  contrato ainda exigem benchmark com banco e índice reais antes de afirmação de produção.

Frontend considerations:
  O cliente em lib/api-client-react/src/generated já serializa arrays com parâmetros repetidos.
  Para integração HTTP, usar VITE_API_MODE=http e base /api conforme o adapter do frontend.
  Datas no cliente gerado permanecem strings ISO 8601.

Infra request:
  CONCLUÍDO. Removidos somente os overrides darwin-arm64/darwin-x64 de esbuild, Rollup,
  Lightning CSS e Tailwind Oxide em pnpm-workspace.yaml; minimumReleaseAge foi preservado.
  pnpm-lock.yaml foi atualizado e os binários arm64 foram instalados. Vite, Orval e o build
  esbuild da API voltaram a executar neste Mac.

N8N / Jev:
  Nenhum workflow n8n foi alterado neste ciclo. Não existe definição ou referência a "Jev" no
  handoff, contrato ou código inspecionado. A Search API está pronta para ser consumida pelo
  futuro workflow, mas o adapter/credencial/formato do Jev precisa ser especificado antes da
  automação para evitar uma integração inventada.

Validation:
  PASS  pnpm --config.verify-deps-before-run=false --dir lib/api-spec run codegen
  PASS  pnpm --config.verify-deps-before-run=false run typecheck
  PASS  pnpm --config.verify-deps-before-run=false --dir artifacts/api-server run build
  PASS  pnpm --config.verify-deps-before-run=false --dir artifacts/api-server run test
        7 tests: seed, filtros combinados, facets disjuntivos, highlights, facets=false,
        envelopes de erro, detalhe/404 e suggestions.

Breaking changes: NO

Migration required: NO

Database changes: NONE

N8N changes: NONE

Search changes:
  Implementado engine keyword inicial em memória com interface TenderRepository substituível.

Next actions:
  1. Claude troca MockSearchAdapter pelo cliente HTTP gerado e valida a tela /search.
  2. Backend substitui InMemoryTenderRepository pelo repositório canônico/indexado quando o
     pipeline de ingestão estiver definido.
  3. Definir o que é "Jev" e seu contrato antes de criar o workflow n8n correspondente.
```
