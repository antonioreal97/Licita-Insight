# Active Context — Licita Insight

## Foco agora

Memory-bank iniciado em 22 set 2026. Não há tarefa de produto em andamento além desta documentação.

O código em `main` é um **protótipo visual funcional com mocks**, alinhado ao brief do `README.md`, ainda longe da arquitetura de services pedida na spec.

## O que está na mesa

- Branch `main`, alinhada com `origin/main`.
- `README.md` aparece como untracked no working tree (o brief de produto).
- Últimos commits: scaffold inicial, dependências + documentação de requisitos, ajuste de estilos do `licitainsight`.

## Decisões já visíveis no código

- Produto vive em `artifacts/licitainsight`, não no mockup-sandbox.
- Entidade técnica: `Tender`. Copy de UI fala “edital”.
- Tema claro por padrão, dark mode no shell via `localStorage`.
- Usuária demo fixa: Marina Almeida.
- API e banco existem como esqueleto e não participam do fluxo de licitações.

## Próximos passos naturais (não iniciados)

1. Extrair a UI de `pages.tsx` para componentes reutilizáveis (`search`, `tenders`, `filters`) sem mudar o visual.
2. Criar `tenderService` (search, getById, saved, save, monitor) em cima dos mocks.
3. Colocar filtros, ordenação e página na URL.
4. Completar filtros do brief (modalidade, valor, datas, órgão, fonte, categoria) e facets.
5. Estados reais de loading, erro de API e vazio — hoje o vazio da busca existe; erro de API é só no design system.
6. Só então desenhar o contrato OpenAPI de busca e ligar o `api-server`.

## Cuidados ativos

- Não implementar scraping.
- Não tratar os mocks como licitações reais.
- Não espalhar um segundo design system: tokens já estão no CSS; páginas usam classes Tailwind + um `Button` local.
- `pages.tsx` está denso (várias páginas em poucas linhas). Qualquer edição precisa preservar `data-testid` e o comportamento atual.
