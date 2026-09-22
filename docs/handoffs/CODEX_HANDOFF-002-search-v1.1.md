```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-002

Feature: Search v1.1 — campos aditivos pedidos pelo frontend após integração

Objective:
  Fechar lacunas de dados percebidas pelos agentes de Search UX e Data Experience ao consumir
  a Search API v1. TODAS as mudanças são ADITIVAS (campos novos opcionais/nullable ou novos
  parâmetros). Nada existente muda de forma ou semântica → permanece /api/v1.

Priority: P1 itens 1–3 · P2 itens 4–7

Frontend context:
  /search já usa facets disjuntivos, chips de filtro e autocomplete; /tenders/:id mostra valor,
  itens, documentos e timeline. Integração HTTP validada contra http://localhost:3001/api
  (VITE_API_MODE=http). Obrigado pelo CLAUDE_HANDOFF-001.

Backend requirement (aditivo):

  P1-1  Rótulos de organizationId selecionados fora do top 20
        facets.organization deve SEMPRE incluir buckets para cada organizationId enviado no
        request (mesmo com count 0), além do top 20. Sem isso o chip de filtro fica sem nome.

  P1-2  Motivo do valor nulo
        TenderSummary.estimatedValueStatus: 'disclosed' | 'confidential' | 'not_published'
        ('disclosed' quando estimatedValue != null). UI mostra "Sigiloso" vs "Não informado".

  P1-3  Contagem em sugestões
        suggestions[].count preenchido também para type='organization' e type='term'
        (nº de licitações que a sugestão retornaria). Pode continuar null se caro.

  P2-4  Facet de município
        facets.city: FacetBucket[] (value = código IBGE, label = "Município/UF"), top 30,
        respeitando o filtro state (disjuntivo como os demais).

  P2-5  Total sem o próprio grupo
        facets.groupTotals: { status, modality, state, source, category, organization: number }
        = total de resultados com todos os filtros exceto o do grupo. Usado no empty state para
        sugerir "remover o filtro mais restritivo" sem somar buckets (categorias são multivaloradas).

  P2-6  Motivo do fallback de modo
        meta.searchModeFallbackReason: 'not_available' | 'query_too_short' | null
        quando mode pedido ≠ meta.searchMode.

  P2-7  Histograma de valor
        facets.valueRange.histogram: { from: number; to: number; count: number }[] (≤ 12 buckets,
        escala log) para o filtro de faixa de valor.

Endpoint required: GET /api/v1/tenders/search, GET /api/v1/search/suggestions (sem rotas novas)
Method: GET
Parameters / Filters / Sorting / Pagination: inalterados
Expected response: v1 + campos acima. Atualizar lib/api-spec/openapi.yaml + codegen e
  docs/contracts/search-v1.md (seção "v1.1 — aditivos"; você pode editar esse arquivo para isso).
Expected errors: inalterados
Authentication: nenhuma
Performance expectations: mesmas metas p95 da v1

Acceptance criteria:
  - campos novos presentes e tipados no OpenAPI; clientes antigos continuam válidos
  - testes cobrindo P1-1 (org selecionada fora do top 20 aparece), P1-2, P2-4 disjuntivo, P2-5
  - typecheck + testes do api-server passando

Mock already implemented: NO (o frontend atualiza o MockSearchAdapter quando você confirmar)
Blocking: NO

Observações de processo (worktree compartilhada):
  - O índice do git é compartilhado entre nós. Seus arquivos do HANDOFF-001 continuam STAGED e
    não commitados (api-server, lib/**, pnpm-*). Eu commito apenas com `git commit -- <meus paths>`
    para não levar os seus; por favor faça o mesmo (`git commit -- <seus paths>`).
  - Sobre "Jev"/n8n citado no seu handoff: não faz parte deste escopo; o orquestrador vai
    confirmar com o usuário antes de qualquer trabalho nisso.

Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-002-search-v1.1.md
```
