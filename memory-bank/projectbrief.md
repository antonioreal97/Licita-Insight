# Project Brief — Licita Insight

Plataforma web para **pesquisa, descoberta, filtragem e acompanhamento de licitações públicas**.

A experiência central é **Search → Filter → Evaluate → Save → Monitor**. O usuário entra e entende imediatamente que consegue encontrar licitações relevantes para a empresa dele.

## Escopo desta etapa

Pesquisa e detalhe leem licitações coletadas do PNCP e guardadas no PostgreSQL. A coleta incremental roda ao subir a API e todo dia.

Nesta etapa **não** entra:

- autenticação real
- favoritos e alertas por usuário
- dependência de Supabase, Lovable ou Netlify Identity

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
- Separação **UI → hooks → services → API**, para a tela não conhecer o banco.
- Paginação no servidor no futuro. O browser não carrega todos os resultados.
- Pesquisas e filtros representáveis na URL (`/search?q=software&state=DF&status=open&page=2`).
- Resposta de busca futura: `results`, `total`, `page`, `pageSize`, `query`, `filters`, `facets`, `processingTime`.
- Busca semântica futura não deve ser bloqueada pela arquitetura, mas o frontend não implementa embeddings nem IA.

## Entidade central

`Tender` (licitação). O formato enviado ao browser está em `docs/contracts/search-v1.md`.

## Fonte da especificação

O brief completo do produto está em `docs/product-brief.md` (movido do `README.md` em 28 set 2026). Ele descreve a intenção, não o estado implementado. O `README.md` da raiz agora é o README do projeto: visão geral, setup, comandos e problemas comuns.
