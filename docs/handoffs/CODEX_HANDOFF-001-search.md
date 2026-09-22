```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-001

Feature: Search — resultados, filtros e facets

Objective:
  Expor a API pública de busca de licitações que o frontend consome.
  Contrato completo: docs/contracts/search-v1.md (fonte da verdade da forma pública).

Priority: P0 (feature principal do produto)

Frontend context:
  Tela /search do app artifacts/licitainsight. O frontend está sendo reestruturado em
  UI → Hook → Service → API Adapter. Um MockSearchAdapter implementa este mesmo contrato;
  quando a API estiver pronta, troca-se só o adapter (VITE_API_MODE=http).
  Filtros viram query params de URL, então a API precisa aceitar arrays por parâmetro repetido.

Backend requirement:
  1. GET /api/v1/tenders/search   — busca + filtros + ordenação + paginação + facets
  2. GET /api/v1/tenders/{id}     — detalhe
  3. GET /api/v1/search/suggestions — autocomplete
  Declarar as 3 rotas em lib/api-spec/openapi.yaml e rodar codegen (Orval) para gerar
  lib/api-zod e lib/api-client-react.

Endpoint required: ver acima
Method: GET (todas)

Parameters / Filters:
  q, mode, status[], modality[], state[], city[], organizationId[], sourceId[], category[],
  valueMin, valueMax, publishedFrom, publishedTo, deadlineFrom, deadlineTo, facets.
  AND entre grupos, OR dentro do grupo. Facets disjuntivos (excluem o próprio grupo).

Sorting: relevance (default) | deadline_asc | published_desc | value_desc | value_asc

Pagination: page (1-based), pageSize 1–100 (default 20);
  resposta com { page, pageSize, total, totalPages, totalIsEstimate }

Expected response: ver docs/contracts/search-v1.md §1–3 (TenderSummary, TenderDetail, FacetBucket, meta)
  - relevance.highlights com fragmentos contendo apenas <mark>…</mark>
  - meta.searchMode informa o modo efetivamente aplicado (v1 pode ser sempre "keyword")

Expected errors:
  Envelope { error: { code, message, details?, requestId } }
  400 INVALID_PARAMETER · 404 NOT_FOUND · 429 RATE_LIMITED (+Retry-After) · 500 INTERNAL_ERROR · 503 SEARCH_UNAVAILABLE

Authentication: nenhuma na v1; deixar ponto de extensão para Bearer token.

Performance expectations:
  search p95 < 500 ms (com facets) · detail p95 < 200 ms · suggestions p95 < 150 ms

Acceptance criteria:
  - openapi.yaml valida e o codegen roda sem erro; `pnpm run typecheck` passa
  - as 3 rotas respondem conforme o contrato com dados seed (≥ 50 licitações realistas,
    cobrindo todos os status/modalidades, valores null, títulos longos, várias UFs)
  - filtros combinados + facets disjuntivos corretos (teste automatizado)
  - erros retornam o envelope padrão
  - CORS habilitado para o dev server do frontend

Mock already implemented: IN PROGRESS (Claude — MockSearchAdapter no mesmo contrato)

Blocking: NO (frontend segue com mock)

File ownership (worktree compartilhada — evitar conflito):
  CODEX edita:  artifacts/api-server/**, lib/db/**, lib/api-spec/**, lib/api-zod/**,
                lib/api-client-react/src/generated/**, scripts/**
  CLAUDE edita: artifacts/licitainsight/**, design-system/**, docs/contracts/**, docs/handoffs/**
  Não editar arquivos do outro domínio. Não fazer commits que incluam arquivos do outro domínio
  (use `git add <paths>` explícito, nunca `git add -A`).

Resposta esperada:
  CLAUDE_HANDOFF com: aceite ou proposta de mudança no contrato, URL base local,
  comando para subir a API, e status por rota.
```

Nota do ambiente: com pnpm 11, `pnpm run <script>` dispara um `pnpm install` de verificação
cujo `preinstall` falha ("Use pnpm instead"). Contorno: `pnpm --config.verify-deps-before-run=false run <script>`
ou chamar os binários direto (`node_modules/.bin/tsc`).
