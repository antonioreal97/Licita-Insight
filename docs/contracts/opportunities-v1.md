# Contrato — Hub de oportunidades v1

O endpoint preserva o contrato cultural original e passa a reunir oportunidades públicas de cultura, fomento e inovação. Não são licitações do PNCP e não entram em `/v1/tenders/search`.

## Modelo e compatibilidade

- `kind`: `culture` | `funding` | `innovation` | `partnership`.
- `source`: `mapas` | `finep` | `cnpq` | `capes`.
- `status`: `open` | `upcoming` | `closed` | `undated`.
- `program`: `audiovisual` | `lpg` | `fac` | `fsa` | `null`; continua preenchido para cultura.
- `audience`, `amount` e datas são `null` quando a fonte não os publica de forma explícita.
- `documents` contém apenas título, URL oficial e media type; o Pardal Digital não copia o conteúdo integral dos PDFs.
- `installation` continua presente para clientes v1. Em fontes não-Mapas, seu `id` é o id da fonte e o nome é a atribuição oficial.
- `sourceUrl` é sempre o link canônico oficial quando disponível.
- `profileMatch` é uma pontuação determinística opcional, baseada nos termos, exclusões, UFs e faixa de valor do perfil autenticado; `null` significa ausência de combinação suficiente.

A migração `0031_opportunities_hub.sql` é não destrutiva: mantém `cultural_opportunities`, adiciona colunas com defaults `culture`/`mapas`, preserva todos os registros e relaxa somente o `NOT NULL` de `program`. No PostgreSQL 11+, defaults constantes são adicionados por metadados e não reescrevem a tabela; ainda assim, índices são construídos e devem ser aplicados na janela operacional normal.

## `GET /api/v1/opportunities`

Filtros: `q`, `state`, `installation`, `status`, `program`, `kind`, `source`, `deadlineFrom`, `deadlineTo`, `page`, `pageSize` e `facets`. Arrays usam parâmetros repetidos. A coleta cultural continua consultando o Mapas Culturais com `@keyword`; o contrato de busca do Pardal Digital permanece `q`.

`kind` e `source` são facetas adicionais; `status`, `state`, `installation` e `program` permanecem compatíveis. A ordenação continua: abertas, futuras, sem data e encerradas; depois prazo e título.

As rotas continuam exigindo a mesma sessão/acesso vigente da versão anterior: `401` sem sessão, `402 SUBSCRIPTION_REQUIRED` sem acesso, `503 SEARCH_UNAVAILABLE` se o Postgres não responder.

## `GET /api/v1/opportunities/{id}`

Retorna o mesmo `OpportunitySummary` da busca, incluindo documentos oficiais e atribuição. `404 NOT_FOUND` para id ausente.

## Coleta

- Cultura: `pnpm --filter @workspace/api-server run collect:opportunities`; `CULTURE_DAILY_COLLECT` mantém o comportamento anterior.
- Fomento: `pnpm --filter @workspace/api-server run collect:funding`; agenda somente quando `FUNDING_DAILY_COLLECT=true`, por padrão às 08:00 de `America/Sao_Paulo` (`FUNDING_DAILY_HOUR`).
- O User-Agent é `PardalDigital/<versão> (+https://pardaldigital.com; contato@pardaldigital.com)`, com intervalo de um segundo por padrão.
- Cada fonte tem `robots.txt` consultado antes da página. Bloqueio é registrado como `blocked_by_robots`, sem tentativa de evasão.
- Deduplicação usa o índice compatível `(installationId, externalId)`; nas fontes de fomento `installationId` é o id da fonte e `externalId` é o SHA-256 truncado da URL canônica. Isso preserva ids iguais publicados por instalações Mapas diferentes.
- Encerramento é derivado de `registrationTo`; prazo futuro usa `upcoming` e ausência de data usa `undated` (ou `open` quando a própria lista oficial declara que a chamada está aberta).

FINEP atualmente publica `Disallow: /`; portanto o adaptador e o parser ficam prontos, mas a coleta real retorna zero e `blocked_by_robots` até autorização/alteração oficial. CNPq usa a página “Abertas para Submissão”. CAPES usa a seção “Editais Abertos”; o catálogo CKAN não continha, na pesquisa de referência, um recurso que substituísse integralmente essa lista.
