# Contrato — Hub de oportunidades v1

O endpoint preserva o contrato cultural original e passa a reunir oportunidades públicas de cultura, fomento e inovação. Não são licitações do PNCP e não entram em `/v1/tenders/search`.

## Modelo e compatibilidade

- `kind`: `culture` | `funding` | `innovation` | `partnership`.
- `source`: `mapas` | `finep` | `cnpq` | `capes`.
- `status`: `open` | `upcoming` | `closed` | `undated`.
- `program`: `audiovisual` | `lpg` | `fac` | `fsa` | `null`. Fundos nomeados (`lpg`, `fac`, `fsa`) saem do título e do resumo; `audiovisual` vale quando o texto ou a área da chamada é de audiovisual; nas demais chamadas de cultura é `null`.
- `areas`: lista de áreas canônicas — `audiovisual`, `musica`, `teatro`, `danca`, `circo`, `artes-visuais`, `literatura`, `patrimonio`, `culturas-populares`, `artesanato`, `cultura-digital`, `gastronomia`, `gestao-producao`, `formacao`, `diversidade`, `outras`. Vem dos termos de área da fonte (`areaTerms`, `terms.area` no Mapas Culturais), cada termo em uma área; termo fora do vocabulário cai em `outras`. Audiovisual também é lido do título e do resumo. Instalações que não publicam termos de área (Ceará, Aracaju) são classificadas só pelo texto, e a lista pode ficar vazia.
- `areaTerms`: os termos de área exatamente como a fonte publicou.
- `opportunityType`: tipo da chamada na fonte ("Edital", "Oficina", "Festival"…) ou `null`.
- `originName`: projeto, agente ou espaço ao qual a chamada pertence na fonte (por exemplo "Editais Funcultura 2026") ou `null`.
- `city`: município, só para chamadas de instalações municipais; `null` nas estaduais.
- `continuousFlow`: `true` em chamada de fluxo contínuo. Sem data de encerramento própria, `registrationTo` é `null` (o Mapas Culturais grava 01/01/2111 como marcador; esse valor não é exposto).
- `audience`, `amount` e datas são `null` quando a fonte não os publica de forma explícita.
- `documents` contém apenas título, URL oficial e media type; o Pardal Digital não copia o conteúdo integral dos PDFs.
- `installation` continua presente para clientes v1, agora com `city`. Em fontes não-Mapas, seu `id` é o id da fonte e o nome é a atribuição oficial. Instalações municipais usam o id `<uf>-<município>` (`rn-natal`).
- `sourceUrl` é sempre o link canônico oficial quando disponível.
- `profileMatch` é uma pontuação determinística opcional, baseada nos termos, exclusões, UFs e faixa de valor do perfil autenticado; `null` significa ausência de combinação suficiente.

A migração `0031_opportunities_hub.sql` é não destrutiva: mantém `cultural_opportunities`, adiciona colunas com defaults `culture`/`mapas`, preserva todos os registros e relaxa somente o `NOT NULL` de `program`. No PostgreSQL 11+, defaults constantes são adicionados por metadados e não reescrevem a tabela; ainda assim, índices são construídos e devem ser aplicados na janela operacional normal.

A migração `0039_opportunity_areas.sql` também é não destrutiva: adiciona `areas`, `area_terms`, `opportunity_type`, `origin_name`, `city` e `continuous_flow` (defaults constantes, sem reescrita da tabela), marca como `audiovisual` as linhas do Mapas que já existiam (até então a coleta só guardava audiovisual) e cria dois índices. A tabela tem centenas de linhas; nada trava de forma perceptível. Roda pelo `pnpm --filter @workspace/db run migrate` normal.

## `GET /api/v1/opportunities`

Filtros: `q`, `state`, `city`, `installation`, `organization`, `area`, `status`, `program`, `kind`, `source`, `deadlineFrom`, `deadlineTo`, `page`, `pageSize` e `facets`. Arrays usam parâmetros repetidos. O contrato de busca do Pardal Digital permanece `q`, que também encontra área, tipo, origem e município.

- `area`: uma ou mais áreas canônicas; a chamada entra se tiver qualquer uma delas. Audiovisual é um filtro (`area=audiovisual`), não mais a regra de coleta. `program=audiovisual` e `q=audiovisual` continuam respondendo.
- `city`: nome do município como aparece na faceta. Mande `state` junto para separar homônimos.
- `organization`: nome da instituição que publicou a chamada, como aparece na faceta. Até 20 valores de até 200 caracteres em `city` e em `organization`.

Facetas: `status`, `state`, `installation`, `program`, `kind`, `source`, `area`, `city` e `organization`. Em `area` a chamada conta uma vez em cada área que tem, então a soma passa do total. Cada item de `city` traz `state`. `organization` devolve as 100 instituições com mais chamadas. A ordenação continua: abertas, futuras, sem data e encerradas; depois prazo e título.

`meta.installationIssues` lista as fontes que falharam, foram bloqueadas ou estão desativadas na última coleta.

As rotas continuam exigindo a mesma sessão/acesso vigente da versão anterior: `401` sem sessão, `402 SUBSCRIPTION_REQUIRED` sem acesso, `503 SEARCH_UNAVAILABLE` se o Postgres não responder.

## `GET /api/v1/opportunities/{id}`

Retorna o mesmo `OpportunitySummary` da busca, incluindo documentos oficiais e atribuição. `404 NOT_FOUND` para id ausente.

## Coleta

- Cultura: `pnpm --filter @workspace/api-server run collect:opportunities`; `CULTURE_DAILY_COLLECT` mantém o comportamento anterior.
  - Cada instalação recebe uma consulta: `GET /api/opportunity/find?registrationTo=GTE(<hoje>)`, sem palavra-chave, com áreas (`terms`), tipo e origem no mesmo `@select`, 50 por página, até `CULTURE_MAX_PAGES` páginas (padrão 20). Chamadas de fluxo contínuo vêm na mesma listagem. `CULTURE_LOOKBACK_DAYS` (padrão 1, hoje) recua a data para reler chamadas encerradas há pouco.
  - Não há filtro por `continuousFlow`: a coluna é uma data, e `continuousFlow=EQ(true)` fazia a instalação responder uma página de erro em HTML — a origem do antigo "invalid JSON".
  - Resposta que não é JSON vira falha `invalid_response` com status, content-type e o início do corpo. BOM e aviso de PHP antes do JSON são ignorados. Se a primeira página falha com a seleção completa, a consulta é refeita com os campos básicos. Se uma página seguinte falha, as anteriores ficam e a listagem é marcada como incompleta.
  - Quando a listagem vem completa, as chamadas abertas daquela instalação que não apareceram mais são encerradas.
  - Instalações: a federal, as 12 estaduais e as 31 municipais da lista oficial do projeto (`README` de `mapasculturais/mapasculturais`). Aracaju e Bento Gonçalves só respondem por HTTP sem TLS, como publicado na lista.
  - Uma instalação municipal que falha em 3 coletas seguidas é desativada automaticamente e testada de novo depois de 7 dias; se responder, volta sozinha. Federal e estaduais nunca são desativadas. Limite de taxa (429) não conta como falha.
  - Intervalo mínimo entre requisições: `CULTURE_PAGE_DELAY_MS` (padrão 1000). `Retry-After` é respeitado; acima de 60 s a instalação fica para o próximo ciclo. Bloqueio (403) e certificado inválido são registrados e a fonte não é contornada.
- Fomento: `pnpm --filter @workspace/api-server run collect:funding`; agenda somente quando `FUNDING_DAILY_COLLECT=true`, por padrão às 08:00 de `America/Sao_Paulo` (`FUNDING_DAILY_HOUR`).
- O User-Agent é `PardalDigital/<versão> (+https://pardaldigital.com; contato@pardaldigital.com)`, com intervalo de um segundo por padrão.
- Cada fonte tem `robots.txt` consultado antes da página. Bloqueio é registrado como `blocked_by_robots`, sem tentativa de evasão.
- Deduplicação usa o índice compatível `(installationId, externalId)`; nas fontes de fomento `installationId` é o id da fonte e `externalId` é o SHA-256 truncado da URL canônica. Isso preserva ids iguais publicados por instalações Mapas diferentes.
- Encerramento é derivado de `registrationTo`; prazo futuro usa `upcoming` e ausência de data usa `undated` (ou `open` quando a própria lista oficial declara que a chamada está aberta).

FINEP atualmente publica `Disallow: /`; portanto o adaptador e o parser ficam prontos, mas a coleta real retorna zero e `blocked_by_robots` até autorização/alteração oficial. CNPq usa a página “Abertas para Submissão”. CAPES usa a seção “Editais Abertos”; o catálogo CKAN não continha, na pesquisa de referência, um recurso que substituísse integralmente essa lista.
