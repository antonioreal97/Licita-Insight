```text
CLAUDE_HANDOFF

ID: CLAUDE_HANDOFF-002

Feature: Search v1.1 — campos aditivos

Status: READY_FOR_CLAUDE

Contract decision:
  ACEITO como extensão aditiva de /api/v1, sem mudança de parâmetros, rotas ou semântica v1.
  Os campos novos não-null foram declarados opcionais no OpenAPI para preservar compatibilidade
  estrutural com clientes v1, mas a implementação v1.1 os devolve sempre nos contextos aplicáveis.

Base URL local: http://localhost:3001/api

Command to start API:
  PORT=3001 pnpm --config.verify-deps-before-run=false --dir artifacts/api-server run dev

Route status:
  READY  GET /api/v1/tenders/search
         - facets.organization retorna top 20 + todo organizationId selecionado, inclusive count 0;
         - estimatedValueStatus presente em cada resultado;
         - facets.city retorna top 30 por IBGE e ignora apenas o próprio filtro city;
         - facets.groupTotals retorna totais disjuntivos por grupo;
         - meta.searchModeFallbackReason informa not_available/query_too_short/null;
         - facets.valueRange.histogram retorna até 12 buckets em escala logarítmica.

  READY  GET /api/v1/tenders/{id}
         - estimatedValueStatus também presente no detalhe por herança de TenderSummary.

  READY  GET /api/v1/search/suggestions
         - count preenchido para term, organization e category no repositório atual.

Request schema:
  Inalterado em relação à v1.

Response additions:
  TenderSummary.estimatedValueStatus?: disclosed | confidential | not_published
  SearchFacets.city?: FacetBucket[]
  SearchFacets.groupTotals?: { status, modality, state, source, category, organization }
  SearchFacets.valueRange.histogram?: { from, to, count }[]
  SearchResponse.meta.searchModeFallbackReason: not_available | query_too_short | null

Compatibility:
  Clientes antigos continuam válidos e podem ignorar os campos extras.
  Clientes regenerados tratam estimatedValueStatus, city, groupTotals e histogram como opcionais.
  searchModeFallbackReason é nullable e sempre presente na resposta v1.1.

Organization facet behavior:
  organization mantém top 20 por count/label. IDs selecionados fora desse conjunto são anexados.
  Se a organização é conhecida, o label canônico é usado mesmo quando count=0; ID desconhecido
  usa o próprio identificador como label.

City facet behavior:
  value = código IBGE; label = "Município/UF"; máximo 30 buckets.
  O cálculo remove city do conjunto de filtros, mas mantém state e todos os demais grupos.

Group totals:
  Cada total aplica todos os filtros exceto o filtro do próprio grupo. Não é calculado pela soma
  de buckets, evitando erro com categorias multivaloradas.

Mode fallback:
  keyword solicitado -> null.
  semantic/hybrid com query normalizada menor que 3 caracteres -> query_too_short.
  semantic/hybrid nos demais casos -> not_available.

Value histogram:
  Até 12 buckets, limites derivados em escala log1p, valores null excluídos. min/max/histogram
  usam todos os filtros exceto valueMin/valueMax, preservando o comportamento disjuntivo da faixa.

Fixture data:
  Mantidos 60 registros sintéticos. A fixture agora diferencia confidential/not_published e possui
  25 organizações para validar seleção fora do top 20. Dados continuam explicitamente marcados
  como fixture e não representam licitações reais.

OpenAPI/codegen:
  lib/api-spec/openapi.yaml atualizado para 1.1.0.
  lib/api-zod e lib/api-client-react/src/generated regenerados com sucesso.
  docs/contracts/search-v1.md recebeu a seção "v1.1 — aditivos".

Validation:
  PASS  pnpm --config.verify-deps-before-run=false --dir lib/api-spec run codegen
  PASS  pnpm --config.verify-deps-before-run=false run typecheck
  PASS  pnpm --config.verify-deps-before-run=false --dir artifacts/api-server run build
  PASS  pnpm --config.verify-deps-before-run=false --dir artifacts/api-server run test
        9 testes HTTP, incluindo organization fora do top 20/count 0, motivo de valor null,
        city disjuntivo, groupTotals, fallback de mode, histograma e counts de suggestions.

Performance notes:
  Testes locais com 60 fixtures permaneceram abaixo das metas contratuais por requisição.
  Benchmark p95 com banco/índice reais continua necessário antes de garantia de produção.

Frontend considerations:
  Atualizar tipos/domínio e MockSearchAdapter para os campos v1.1 antes de exibi-los.
  Manter fallback visual para ausência dos campos opcionais ao consumir servidores v1 antigos.

Breaking changes: NO

Migration required: NO

Database changes: NONE

N8N changes: NONE
```
