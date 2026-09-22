# Project Brief — Licita Insight

Plataforma web para **pesquisa, descoberta, filtragem e acompanhamento de licitações públicas**.

A experiência central é **Search → Filter → Evaluate → Save → Monitor**. O usuário entra e entende imediatamente que consegue encontrar licitações relevantes para a empresa dele.

## Escopo desta etapa

Frontend desacoplado, com dados mockados, pronto para consumir uma API própria depois.

Nesta etapa **não** entra:

- scraping, indexação, normalização ou automações (n8n fica fora do frontend)
- banco de dados de licitações
- autenticação real
- dependência de Supabase, Lovable ou qualquer backend específico

## Áreas do produto

1. Landing pública
2. Autenticação visual (login, criar conta, recuperar senha)
3. Dashboard
4. Pesquisa de licitações (lista e tabela)
5. Filtros avançados
6. Detalhe da licitação
7. Pesquisas salvas
8. Licitações salvas
9. Monitoramento de alterações
10. Configurações (conta, preferências, notificações, tema)
11. Documentação visual em `/design-system`

## Princípios

- Busca é o elemento mais importante da aplicação.
- Visual de **enterprise search + data platform + procurement intelligence**: clean, data-driven, institucional sem parecer portal governamental.
- Separação **UI → lógica de aplicação → services → fonte de dados**, para trocar mocks pela API com o mínimo de mudança visual.
- Paginação no servidor no futuro. O browser não carrega todos os resultados.
- Pesquisas e filtros representáveis na URL (`/search?q=software&state=DF&status=open&page=2`).
- Resposta de busca futura: `results`, `total`, `page`, `pageSize`, `query`, `filters`, `facets`, `processingTime`.
- Busca semântica futura não deve ser bloqueada pela arquitetura, mas o frontend não implementa embeddings nem IA.

## Entidade central

`Tender` (licitação). O modelo atual em `artifacts/licitainsight/src/lib/mock-data.ts` é inicial e deve poder evoluir sem reconstruir a UI.

## Fonte da especificação

O brief completo do produto está no `README.md` da raiz. Ele descreve a intenção, não o estado implementado.
