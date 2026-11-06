# Contrato — Hub de oportunidades v1

O endpoint preserva o contrato cultural original e passa a reunir oportunidades públicas de cultura, fomento e inovação. Não são licitações do PNCP e não entram em `/v1/tenders/search`.

## Modelo e compatibilidade

- `kind`: `culture` | `funding` | `innovation` | `partnership` | `procurement`. `procurement` é aviso de aquisição de organismo internacional; licitações do PNCP continuam fora daqui.
- `source`: `mapas` | `finep` | `cnpq` | `capes` | `transferegov` | `funarte` | `minc` | `salic` | `worldbank` | `eu_ft` | `idb` | `fap`. `sourceName` traz o rótulo exibido como selo: "Mapas Culturais", "FINEP", "CNPq", "CAPES", "Transferegov.br", "Funarte", "Ministério da Cultura", "Lei Rouanet (Salic)", "Banco Mundial", "União Europeia (Funding & Tenders)", "BID" e "FAPs estaduais". Nas chamadas de FAP, `organizationName` traz a sigla da fundação (FAPDF, FAPESP…) e `state` traz a UF dela.
- `scope`: `national` | `international`. É abrangência, não tipo: uma chamada internacional continua com seu `kind`. Toda chamada das fontes brasileiras é `national`.
- `international`: `null` nas chamadas nacionais; nas internacionais, o objeto descrito em "Oportunidades internacionais".
- `status`: `open` | `upcoming` | `closed` | `undated`.
- `program`: `audiovisual` | `lpg` | `fac` | `fsa` | `null`. Fundos nomeados (`lpg`, `fac`, `fsa`) saem do título e do resumo; `audiovisual` vale quando o texto ou a área da chamada é de audiovisual; nas demais chamadas de cultura é `null`.
- `areas`: lista de áreas canônicas — `audiovisual`, `musica`, `teatro`, `danca`, `circo`, `artes-visuais`, `literatura`, `patrimonio`, `culturas-populares`, `artesanato`, `cultura-digital`, `gastronomia`, `gestao-producao`, `formacao`, `diversidade`, `outras`. Vem dos termos de área da fonte (`areaTerms`, `terms.area` no Mapas Culturais), cada termo em uma área; termo fora do vocabulário cai em `outras`. Audiovisual também é lido do título e do resumo. Instalações que não publicam termos de área (Ceará, Aracaju) são classificadas só pelo texto, e a lista pode ficar vazia.
- `areaTerms`: os termos de área exatamente como a fonte publicou.
- `opportunityType`: tipo da chamada na fonte ("Edital", "Oficina", "Festival"…) ou `null`.
- `organizationName`: instituição que publicou a chamada. Nunca é o nome de uma pessoa física: quando o dono da chamada no Mapas Culturais é um agente individual, vale o projeto, espaço ou organização vinculado e, sem vínculo, o rótulo `Proponente individual (<instalação>)`. Regra completa em `docs/compliance/minimizacao-fontes-publicas.md`.
- `originName`: projeto, espaço, evento ou organização ao qual a chamada pertence na fonte (por exemplo "Editais Funcultura 2026") ou `null`. Um agente pessoa física nunca aparece aqui.
- `individualListing`: `true` quando a chamada foi publicada por pessoa física e o texto não cita edital, lei de fomento nem órgão público (aulas, oficinas particulares, testes do formulário). Só vem na busca com `includeIndividual=true`; no detalhe vem sempre.
- `city`: município, só para chamadas de instalações municipais; `null` nas estaduais.
- `continuousFlow`: `true` em chamada de fluxo contínuo. Sem data de encerramento própria, `registrationTo` é `null` (o Mapas Culturais grava 01/01/2111 como marcador; esse valor não é exposto).
- `audience`, `amount` e datas são `null` quando a fonte não os publica de forma explícita.
- `documents` contém apenas título, URL oficial e media type; o Pardal Digital não copia o conteúdo integral dos PDFs.
- `installation` continua presente para clientes v1, agora com `city`. Em fontes não-Mapas, seu `id` é o id da fonte e o nome é a atribuição oficial. Instalações municipais usam o id `<uf>-<município>` (`rn-natal`).
- `sourceUrl` é sempre o link canônico oficial quando disponível.
- `profileMatch` é uma pontuação determinística opcional, baseada nos termos, exclusões, UFs e faixa de valor do perfil autenticado; `null` significa ausência de combinação suficiente.
- `application`, `applicationCheckedAt` e `noticeDates`: onde se inscrever e o período de inscrição lido do edital (seção "Onde se inscrever"). Campos aditivos: clientes que não os conhecem continuam iguais.

A migração `0031_opportunities_hub.sql` é não destrutiva: mantém `cultural_opportunities`, adiciona colunas com defaults `culture`/`mapas`, preserva todos os registros e relaxa somente o `NOT NULL` de `program`. No PostgreSQL 11+, defaults constantes são adicionados por metadados e não reescrevem a tabela; ainda assim, índices são construídos e devem ser aplicados na janela operacional normal.

A migração `0039_opportunity_areas.sql` também é não destrutiva: adiciona `areas`, `area_terms`, `opportunity_type`, `origin_name`, `city` e `continuous_flow` (defaults constantes, sem reescrita da tabela), marca como `audiovisual` as linhas do Mapas que já existiam (até então a coleta só guardava audiovisual) e cria dois índices. A tabela tem centenas de linhas; nada trava de forma perceptível. Roda pelo `pnpm --filter @workspace/db run migrate` normal.

A minimização de dados pessoais (11/10/2026) não tem migração: tipo do dono e marcação de anúncio individual ficam em `raw_payload.ownerReview`, e as linhas antigas são revisadas pelo job `opportunity_owner_review` ao subir.

A migração `0040_opportunity_federal_sources.sql` só amplia a lista de valores aceitos em `source`; não toca em nenhuma linha. É manual em produção e deve ser aplicada antes de ligar a coleta federal (`docs/migrations/0040-opportunity-federal-sources.md`).

A migração `0041_international_opportunities.sql` adiciona as colunas das chamadas internacionais, amplia as listas de `kind` e `source` e cria a preferência `users.show_international_opportunities`. É manual em produção e deve ser aplicada **antes** de publicar a API (`docs/migrations/0041-international-opportunities.md`).

A migração `0043_opportunity_application.sql` adiciona, todas nulas, as colunas do link de inscrição (`application_*`) e do período lido do edital (`notice_*`). É manual em produção e deve ser aplicada **antes** de publicar a API (`docs/migrations/0043-opportunity-application.md`).

## Onde se inscrever

Sem IA e sem custo de modelo: regras determinísticas sobre a página da chamada na fonte e o texto dos documentos oficiais (PDF, DOCX, ODT, lidos pelo mesmo extrator dos editais do PNCP). Na dúvida, nada é preenchido: um link errado é pior que nenhum.

`application` (ou `null`):

| Campo | Conteúdo |
| --- | --- |
| `url` | Link para se inscrever. |
| `platform` | Slug de plataforma conhecida (`sucupira`, `sicapes`, `carlos-chagas`, `salic`, `transferegov`, `sigproj`, `prosas`, `mapa-da-cultura`, `mapas-culturais`, `fapesp-sage`, `sisfaperj`, `fapemig-everest`, `facepe-agil`, `sigfap`, `eu-funding-tenders`, `eu-prospect`, `google-forms`, `even3`) ou `null` para um link aceito só pelas palavras ao redor. A tabela fica em `artifacts/api-server/src/ingest/application-platforms.ts` e cresce com uma entrada por plataforma (host, caminho, nomes e página de entrada). |
| `label` | Nome a exibir ("Plataforma Sucupira"); `null` sem plataforma conhecida. |
| `article` | Artigo de `label` (`a`/`o`), para "na Plataforma Sucupira", "no Salic". |
| `origin` | `source_page` (a página da chamada, ou a página é a própria plataforma) ou `document` (um documento oficial). |
| `documentTitle` | Título do documento que indica o link, quando `origin = document`. |

Regras:

- **A página é a plataforma**: Mapas Culturais (inscrição na página da oportunidade), Transferegov.br (o portal recebe as propostas), tópicos do Funding & Tenders da UE (`topic-details`, botão de submissão na própria página) e chamadas de ação externa no PROSPECT. Sem requisição.
- **Plataforma conhecida** citada (link ou nome) logo depois de palavras de inscrição ("inscrição", "submissão", "propostas deverão ser encaminhadas", "formulário de propostas"…), sem palavra de outra etapa no meio (recurso, resultado, homologação, contato, legislação, verificação, Lattes…). Nome sem link usa a página de entrada da plataforma. Duas plataformas com a mesma força: nada.
- **Outro link**: só se for o único, vier logo depois de palavras de inscrição e a frase disser que é um lugar ("no link", "pelo sistema", "acesse", "formulário"…).
- Nunca: e-mail, legislação (planalto, DOU, `leg.br`), gov.br genérico, redes sociais, login gov.br, Lattes, Linha Direta, autenticação do SEI, o próprio PDF/página da chamada ou qualquer arquivo.

`noticeDates` (ou `null`): `registrationFrom`, `registrationTo`, `origin` e `documentTitle`. Só existe quando a fonte não publica datas (`registrationFrom` e `registrationTo` nulos); as datas da fonte sempre prevalecem e `registrationFrom`/`registrationTo` não mudam. Vem de expressões em português logo depois de "inscrição/inscrições/submissão/envio das propostas" — "de 24 de agosto de 2026 até as 18h do dia 18 de dezembro de 2026", "De 20 de outubro a 18 de novembro de 2026", "01/12/2026 a 15/01/2027", "até 30/11/2026, às 18h", "Data limite para submissão 11/12/2026". Horário de Brasília; sem hora, o período abre às 00:00 e fecha às 23:59:59. Não preenche quando: falta o ano; uma data solta não diz se abre ou encerra; a data é de outra etapa (homologação, resultado, seleção interna); duas afirmações discordam (cronograma alterado, segunda etapa); ou existe retificação/alteração listada que não pôde ser lida. A página da fonte vem antes dos documentos (no PDSE ela traz o cronograma alterado). `status` não muda com essas datas.

`applicationCheckedAt`: última leitura da página e dos documentos. `null` = ainda não lida; com data e `application = null`, o edital foi lido e não indica um link com confiança.

### Leitura (dentro das coletas existentes)

Não há agenda nova: a leitura roda no fim de cada coleta já agendada, depois de gravar as chamadas, e nunca a faz falhar (o resultado vai em `ingest_runs.details.applications`).

| Coleta | Fontes lidas | Requisições |
| --- | --- | --- |
| Fomento (`collect:funding`) | CAPES, CNPq, FINEP | Página da chamada e até 3 documentos do edital |
| Cultura federal (`collect:culture-federal`) | MinC, Salic, Funarte; Transferegov por regra | Idem; Transferegov sem requisição |
| Internacional (`collect:international`) | Funding & Tenders por regra | Nenhuma (Banco Mundial e cascata ficam sem link) |
| Mapas Culturais (`collect:opportunities`) | Mapas por regra | Nenhuma (um `UPDATE` em lote) |

- Só chamadas não encerradas. Até `APPLICATION_READ_MAX_CALLS` (20) chamadas lidas por coleta, as nunca lidas primeiro; o resto fica para a próxima.
- Documentos: os listados pela fonte e os PDFs da página cujo título é de edital, chamada, regulamento ou alteração, do ano mais recente; nunca resultados, listas, anexos, modelos ou portarias. Até 15 MB e 150 páginas por arquivo, 30 s de timeout, um download por endereço na coleta. O texto é lido em memória e descartado; só link, datas e título do documento são gravados.
- Ritmo: `APPLICATION_READ_DELAY_MS` (1000) entre requisições, robots.txt de cada host consultado antes, até 3 redirecionamentos seguidos à mão, mesmo User-Agent das coletas.
- Cache: `application_input_hash` (versão do leitor + `sourceUrl` + URLs de `documents`). Chamada com o mesmo hash lida há menos de 7 dias não é relida; documento novo na fonte (retificação) muda o hash e força a releitura. Página proibida no robots.txt ou com 4xx conta como lida até a próxima janela; timeout e 5xx tentam de novo na próxima coleta.
- `OPPORTUNITY_APPLICATION_READING=false` desliga a leitura (as coletas seguem iguais).
- Coleta repetida: o upsert não toca nas colunas `application_*`/`notice_*`; a mesma chamada continua com o link e não duplica.

## `GET /api/v1/opportunities`

Filtros: `q`, `state`, `city`, `installation`, `organization`, `area`, `status`, `program`, `kind`, `source`, `scope`, `agency`, `region`, `country`, `language`, `opportunityType`, `eligibility`, `funding`, `deadlineFrom`, `deadlineTo`, `includeIndividual`, `page`, `pageSize` e `facets`. Arrays usam parâmetros repetidos. O contrato de busca do Pardal Digital permanece `q`, que também encontra área, tipo, origem e município.

- `area`: uma ou mais áreas canônicas; a chamada entra se tiver qualquer uma delas. Audiovisual é um filtro (`area=audiovisual`), não mais a regra de coleta. `program=audiovisual` e `q=audiovisual` continuam respondendo.
- `city`: nome do município como aparece na faceta. Mande `state` junto para separar homônimos.
- `organization`: nome da instituição que publicou a chamada, como aparece na faceta. Até 20 valores de até 200 caracteres em `city` e em `organization`.
- `includeIndividual`: `true` ou `false` (padrão `false`). Sem ele, anúncios individuais ficam fora dos resultados, do total e das facetas; `meta.hiddenIndividualListings` diz quantos os mesmos filtros deixaram de fora. Na tela é o parâmetro `individual=1` da URL.

- `scope`: `national` (padrão), `international` ou `all`. Sem o parâmetro só vêm chamadas nacionais, como antes; um cliente que não conhece a seção internacional não muda de resultado.
- `agency`: organismo ("Banco Mundial", "União Europeia"), como aparece na faceta. `region`: `america-latina` | `africa` | `europa` | `asia` | `oriente-medio` | `global`. `country`: ISO 3166-1 alfa-2 do país de execução (`country=BR` lista os projetos no Brasil). `language`: código de duas letras do idioma do aviso. `opportunityType`: tipo como aparece na faceta ("Bens", "Obras", "Consultoria", "Serviços (não consultoria)", "Subvenção", "Financiamento em cascata", "Chamada de ação externa").
- `eligibility` e `funding`: `yes` | `conditional` | `no` | `unknown`, um ou mais valores. A API não aplica padrão; a tela manda `eligibility=yes&eligibility=conditional` quando a URL da aba internacional não traz o filtro, e `eligibility=all` na URL (nunca enviado à API) mostra tudo.

Facetas: `status`, `state`, `installation`, `program`, `kind`, `source`, `area`, `city`, `organization` e, quando a busca inclui chamadas internacionais, `agency`, `region`, `language`, `opportunityType`, `eligibility` e `funding` (listas vazias com `scope=national`). Em `area` a chamada conta uma vez em cada área que tem, então a soma passa do total. Cada item de `city` traz `state`. `organization` devolve as 100 instituições com mais chamadas. A ordenação continua: abertas, futuras, sem data e encerradas; depois prazo e título.

`meta.installationIssues` lista as fontes que falharam, foram bloqueadas ou estão desativadas na última coleta. Com `scope=international` vêm as fontes internacionais que não responderam por completo, e `gaps` fica vazio. `meta.scope` repete o escopo aplicado e `meta.internationalInProfile` diz se a conta ligou "Mostrar oportunidades internacionais".

As rotas continuam exigindo a mesma sessão/acesso vigente da versão anterior: `401` sem sessão, `402 SUBSCRIPTION_REQUIRED` sem acesso, `503 SEARCH_UNAVAILABLE` se o Postgres não responder.

## `GET /api/v1/opportunities/{id}`

Retorna o mesmo `OpportunitySummary` da busca, incluindo documentos oficiais e atribuição. `404 NOT_FOUND` para id ausente.

## Coleta

- Cultura: `pnpm --filter @workspace/api-server run collect:opportunities`; `CULTURE_DAILY_COLLECT` mantém o comportamento anterior.
  - Cada instalação recebe uma consulta: `GET /api/opportunity/find?registrationTo=GTE(<hoje>)`, sem palavra-chave, com áreas (`terms`), tipo, origem e o tipo do agente dono (`owner.{id,name,type}`) no mesmo `@select`, 50 por página, até `CULTURE_MAX_PAGES` páginas (padrão 20). Chamadas de fluxo contínuo vêm na mesma listagem. `CULTURE_LOOKBACK_DAYS` (padrão 1, hoje) recua a data para reler chamadas encerradas há pouco.
  - Não há filtro por `continuousFlow`: a coluna é uma data, e `continuousFlow=EQ(true)` fazia a instalação responder uma página de erro em HTML — a origem do antigo "invalid JSON".
  - Resposta que não é JSON vira falha `invalid_response` com status, content-type e o início do corpo. BOM e aviso de PHP antes do JSON são ignorados. Se a primeira página falha com a seleção completa, a consulta é refeita com os campos básicos. Se uma página seguinte falha, as anteriores ficam e a listagem é marcada como incompleta.
  - Quando a listagem vem completa, as chamadas abertas daquela instalação que não apareceram mais são encerradas.
  - Do agente só se pede id, nome e tipo. O nome de agente individual (pessoa física) não é gravado em nenhuma coluna nem em `raw_payload`, que guarda uma lista fechada de campos da fonte.
  - Instalações: a federal, as 12 estaduais e as 31 municipais da lista oficial do projeto (`README` de `mapasculturais/mapasculturais`). Aracaju e Bento Gonçalves só respondem por HTTP sem TLS, como publicado na lista.
  - Uma instalação municipal que falha em 3 coletas seguidas é desativada automaticamente e testada de novo depois de 7 dias; se responder, volta sozinha. Federal e estaduais nunca são desativadas. Limite de taxa (429) não conta como falha.
  - Intervalo mínimo entre requisições: `CULTURE_PAGE_DELAY_MS` (padrão 1000). `Retry-After` é respeitado; acima de 60 s a instalação fica para o próximo ciclo. Bloqueio (403) e certificado inválido são registrados e a fonte não é contornada.
- Fomento: `pnpm --filter @workspace/api-server run collect:funding`; agenda somente quando `FUNDING_DAILY_COLLECT=true`, por padrão às 08:00 de `America/Sao_Paulo` (`FUNDING_DAILY_HOUR`).
- O User-Agent é `PardalDigital/<versão> (+https://pardaldigital.com; contato@pardaldigital.com)`, com intervalo de um segundo por padrão.
- Cada fonte tem `robots.txt` consultado antes da página. Bloqueio é registrado como `blocked_by_robots`, sem tentativa de evasão.
- Deduplicação usa o índice compatível `(installationId, externalId)`; nas fontes de fomento `installationId` é o id da fonte e `externalId` é o SHA-256 truncado da URL canônica. Isso preserva ids iguais publicados por instalações Mapas diferentes.
- Encerramento é derivado de `registrationTo`; prazo futuro usa `upcoming` e ausência de data usa `undated` (ou `open` quando a própria lista oficial declara que a chamada está aberta).

Na imagem de produção, os comandos manuais são:

```sh
docker exec licita-macbook-app-1 node artifacts/api-server/dist/collect-opportunities.mjs
docker exec licita-macbook-app-1 node artifacts/api-server/dist/collect-funding.mjs
docker exec licita-macbook-app-1 node artifacts/api-server/dist/collect-culture-federal.mjs
docker exec licita-macbook-app-1 node artifacts/api-server/dist/collect-international.mjs
```

Cada executável aceita `--help` sem banco. As execuções com gravação usam o mesmo lock da agenda correspondente; as variáveis `*_DRY_RUN` documentadas abaixo continuam disponíveis via `docker exec -e`.

FINEP atualmente publica `Disallow: /`; portanto o adaptador e o parser ficam prontos, mas a coleta real retorna zero e `blocked_by_robots` até autorização/alteração oficial. CNPq usa a página “Abertas para Submissão”. CAPES usa a seção “Editais Abertos”; o catálogo CKAN não continha, na pesquisa de referência, um recurso que substituísse integralmente essa lista.

### FAPs estaduais (`source = fap`)

As chamadas das Fundações de Amparo à Pesquisa entram na mesma coleta de fomento (`collect:funding`), depois de CAPES, CNPq e FINEP. Precisam da migração [`0054`](../migrations/0054-opportunity-source-fap.md).

- O catálogo das 27 FAPs, uma por UF, fica em `artifacts/api-server/src/ingest/fap-sources.ts`. Cada FAP tem um estado de coleta: `active` (tem adaptador), `pending` (listagem pública vista no levantamento, adaptador a escrever), `blocked_by_robots` (nunca coletada) ou `unreachable`. O levantamento está em [`docs/research/fontes-fap-2026-11.md`](../research/fontes-fap-2026-11.md).
- Cada FAP é uma instalação: `installationId = fap-<uf>` (`fap-df`), `state = <UF>`, `organizationName` = sigla. A região declarada no perfil vale para as FAPs como para os editais. Cada FAP aparece em separado no `details.sources` da execução, com `installationId`, e a falha de uma não derruba as outras.
- Por FAP: `robots.txt` da origem, a página inicial (para achar as páginas de editais do momento) e cada página de editais, com `FUNDING_PAGE_DELAY_MS` entre as requisições. Uma URL proibida pelo `robots.txt` interrompe aquela FAP.
- Só entra a chamada que publica um período de submissão ou de inscrição explícito. Prêmios sem período, painéis só de resultados e seleções de servidores ficam de fora. O status sai das datas (`open`, `upcoming`, `closed`).
- `externalId` é o SHA-256 truncado de `<página>#<âncora>`. A âncora vem do número do edital (`edital-06-2026`, `chamada-12-2026`), então retificações publicadas na mesma página atualizam a mesma chamada.
- `FAP_SOURCES=df,sp` restringe a coleta a essas UFs; `FAP_SOURCES=off` desliga todas as FAPs.
- **FAPDF** (ativa): a página inicial lista uma página por ano (`/editais-fapdf-20261` em 2026). A coleta lê a do ano corrente em Brasília e, em janeiro e fevereiro, também a do ano anterior; sem página do ano, lê a mais recente. Cada edital é um painel `panel-title`, e as chamadas de um programa são painéis aninhados. O período vem de "PERÍODO DE SUBMISSÃO: dd/mm/aaaa a dd/mm/aaaa". Os documentos são os links do edital e das retificações; extratos do DODF e resultados ficam de fora.
- **FAPEMIG** (ativa): lê `/oportunidades/chamadas-e-editais?status=aberta` no site Nuxt. O HTML SSR já traz as chamadas abertas no payload `__NUXT_DATA__` (título, datas de submissão, valor e anexos); a coleta não chama a API `api.site.fapemig.br`. O `sourceUrl` é a página oficial de cada chamada (`/oportunidades/chamadas-e-editais/<slug>`). Só entram itens com `status_chamada: aberta`; documentos limitados a edital/chamada/retificação (máx. 5).
- **FAPERGS** (ativa): a página `/abertos` carrega as chamadas por AJAX em `/_service/conteudo/pagedlistfilho?id=2042…` (permitido no `robots.txt`). Cada artigo da listagem vira chamada com `status: "open"`; resultados no título ficam de fora. O `detail` lê o post da chamada para período de submissão/inscrição e PDFs do edital/retificações; sem período no post, mantém a abertura declarada pela listagem.
- **FAPEG** (ativa): usa `/fapeg/editais/inscricoes-abertas/` no portal `goias.gov.br` (WordPress). A página "Em andamento" lista chamadas ainda em execução (julgamento/homologação), não só inscrição aberta — por isso a coleta não a lê. Cada linha da tabela vira uma chamada com `status: "open"`; o `detail` completa edital/retificações em PDF.
- **FAPEMA** (ativa): categoria WordPress `/category/editais/editais-em-aberto/` (só abertos). A listagem traz o post de cada edital; o `detail` lê o período de submissão/inscrição no post e os PDFs do edital/retificações (via visualizador ou link direto). Sem período no post, a chamada cai fora.
- **FACEPE** (ativa): lê a listagem filtrada `/editais/todos/?c=aberto` (cards `card-edital-grupo`) e a página `/editais-x-fluxo-continuo/`. O filtro "aberto" não é confiável: em 11/2026 listava 60 cards, com chamadas de 2023 e 2024, resultados e prêmios, e nenhum card traz data. Por isso a coleta só fica com os editais numerados no ano corrente em Brasília (em janeiro e fevereiro, também os do ano anterior), descarta resultados, prêmios, cronogramas, homologações e o processo eleitoral, e grava `status: "undated"` em vez de adivinhar `open`. A chamada da página de fluxo contínuo fica `open`. Não há página própria por chamada: `sourceUrl` é a listagem com âncora. Os documentos são os PDFs do edital e das erratas, sem resultados.
- **FAPESC** (ativa): descobre `/chamadas-abertas/` no menu e lê os posts dos editais. O detalhe completa “Prazo para submissão” (intervalo ou fluxo contínuo até uma data); prazo explícito prevalece sobre o rótulo de aberta. Sem prazo textual, mantém a abertura declarada pela listagem. Guarda até cinco PDFs de edital/retificações, sem resultados e extratos.
- **FAPITEC** (ativa): lê apenas `/editais-abertos/` e os posts dos editais; “em andamento” inclui chamadas em fase de resultados, portanto não é tratado como inscrições abertas. Exclui credenciamento de consultoria ad hoc. Quando o cronograma existe somente em imagem, mantém datas nulas e `status: "open"` pela listagem oficial; documentos limitados ao edital e retificações.
- **FAPEAM** (pendente): `/editais/` e `?aba=fluxo-continuo` entregam templates Vue; os dados dependem de `/wp-admin/admin-ajax.php`, proibido no `robots.txt`. Os sitemaps alternativos não estão disponíveis e os feeds também são proibidos; a coleta aguarda uma listagem permitida. Não há chamadas coletadas nem inferência de abertura a partir desse template.

### Fontes federais de cultura

`pnpm --filter @workspace/api-server run collect:culture-federal`; agenda somente quando `CULTURE_FEDERAL_COLLECT=true` (padrão desligado), uma vez por dia às 09:00 de `America/Sao_Paulo` (`CULTURE_FEDERAL_HOUR`, de 7 a 23 — a janela 00:00–05:30 é do job noturno e 06:00 é do PNCP e do Mapas). Não roda ao subir. `CULTURE_FEDERAL_DRY_RUN=true` no comando manual lê as fontes e imprime o que achou, sem gravar. Trava: job singleton `culture_federal_collect` e uma linha `running` por vez em `ingest_runs` (`source = 'culture-federal'`).

Substituem o Mapa da Cultura federal, que responde 403 com desafio do Cloudflare e não é contornado (pedido de liberação em `docs/ops/pedido-liberacao-mapa-cultura.md`).

- **Transferegov.br** (`source = transferegov`), dados abertos, sem login:
  - `GET api-publica.transferegov.gestao.gov.br/parcerias/programa?situacao_programa=Disponibilizado` (módulo Gestão de Parcerias, JSON paginado). Entra o programa com janela de beneficiário espontâneo ainda aberta; janelas de emenda parlamentar e de beneficiário específico não são chamadas públicas.
  - `…/downloads/dadosgov/siconv_programa.zip` (Transferências Discricionárias e Legais, CSV de ~350 MB lido em fluxo). Entra o programa `DISPONIBILIZADO` com `DT_PROG_FIM_RECEB_PROP` de hoje em diante (propostas voluntárias), uma chamada por `COD_PROGRAMA`.
  - `kind`: `funding` para termo de fomento e leis de incentivo; `partnership` para convênio, contrato de repasse, termo de colaboração e termo de compromisso. `opportunityType` traz o instrumento. `audience` traz quem pode propor (OSC, município, estado, consórcio…).
  - `state` só quando o programa vale para uma única UF; com várias, fica `null` (nacional) e as UFs vão no resumo e na busca. O Transferegov não publica município de abrangência do programa. `amount` vem do valor global da API de parcerias; o CSV não publica valor nem objeto.
  - `areas`: preenchidas quando o órgão ou o nome do programa é de cultura.
  - `sourceUrl` é o portal do Transferegov.br: a plataforma não tem página pública por programa (a consulta exige login gov.br). O número do programa vai no resumo e `documents` aponta para o registro nos dados abertos.
- **MinC** (`source = minc`): página "Editais abertos" (`gov.br/cultura/pt-br/assuntos/editais/inscricoes-abertas`) e a página de cada edital listado. Chamadas nacionais da PNAB e da Lei Paulo Gustavo entram por aqui quando o MinC as lista; `program = lpg` sai do título.
- **Lei Rouanet** (`source = salic`): a API `api.salic.cultura.gov.br` só tem projetos, propostas, proponentes, incentivadores e fornecedores — nenhuma chamada — e não é coletada. `salic` marca o edital da lista do MinC cuja inscrição é feita no Salic (a página aponta para `salic.cultura.gov.br`), com `opportunityType = "Lei Rouanet"`.
- **Funarte** (`source = funarte`): página "Editais abertos" (`gov.br/funarte/pt-br/editais/editais-abertos`). Um cartão pode ser uma página de programa com várias chamadas (cada uma vira uma oportunidade, com o programa em `originName`) ou um redirecionamento para outro site; nesse caso o endereço de destino é guardado como `sourceUrl` e não é requisitado.

Regras comuns às páginas gov.br:

- `robots.txt` do `www.gov.br` e do portal do órgão lidos antes de qualquer página; proibição vira `blocked_by_robots`. Resposta diferente de 200 (403, 5xx) vira falha registrada, sem nova tentativa no mesmo dia.
- Só GET de página pública, com o User-Agent do coletor e 1 segundo entre requisições (`CULTURE_FEDERAL_PAGE_DELAY_MS`). Sem login, sem cookies, sem execução de JavaScript. Redirecionamento só é seguido dentro do portal do órgão.
- Tetos por coleta: 30 cartões por lista, 12 chamadas por página de programa e 60 requisições por fonte. No dia 11/10/2026 a coleta inteira fez 25 requisições.
- Da página saem título, situação ("Inscrições abertas"), datas de inscrição, um trecho de até 400 caracteres e os anexos (`documents`: título, link oficial e tipo). A coleta não baixa os arquivos; a leitura de "Onde se inscrever", no fim da coleta, lê até 3 deles em memória e não guarda o conteúdo. O conteúdo do gov.br é CC BY-ND 3.0: o trecho é literal e vai com a fonte e o link.
- Datas: caixa "De … Até …" da Funarte, cronograma ("Início das inscrições", "Encerramento do prazo de inscrição") e frases que falam de inscrição. Sem data explícita na página, `registrationFrom`/`registrationTo` ficam `null` e a situação é `open`, porque a própria lista oficial é a de editais abertos. "Fluxo contínuo" sem data final marca `continuousFlow`.
- Deduplicação: `(installationId, externalId)`, com `installationId` igual à fonte. `externalId` é `programa-<COD_PROGRAMA>` ou `parcerias-<id_programa>` no Transferegov e o SHA-256 truncado da URL canônica nas páginas gov.br. O mesmo edital listado pelo MinC e pela Funarte (as duas apontam para a mesma oportunidade do Mapa da Cultura) fica só na primeira fonte que o lista.
- Encerramento: pela data (`registrationTo`), a cada coleta; e, quando a listagem oficial foi lida inteira, o que saiu dela é encerrado. Listagem vazia, incompleta ou com falha não encerra nada.

## Oportunidades internacionais

Fase 1: avisos de aquisição do **Banco Mundial** (`source = worldbank`, `kind = procurement`), tópicos e chamadas do **Funding & Tenders da União Europeia** (`source = eu_ft`) e avisos de aquisição do **BID** (`source = idb`, `kind = procurement`, coleta autorizada pelo IDB Open Data em 13/10/2026: [`docs/ops/autorizacoes-fontes.md`](../ops/autorizacoes-fontes.md)). UNGM e Devex não são coletados ([`docs/research/oportunidades-internacionais-2026-10-codex.md`](../research/oportunidades-internacionais-2026-10-codex.md)).

### Campos de `international`

- `agency`: organismo que financia ou conduz ("Banco Mundial", "União Europeia", "BID"). `organizationName` continua sendo quem publicou: o órgão comprador no Banco Mundial, "Comissão Europeia" na UE; no BID o dataset não traz o órgão executor (ele está no documento do aviso), então fica "Banco Interamericano de Desenvolvimento (BID)". `originName` traz o projeto (`P171305 · …`) ou o programa e a chamada (`Horizon Europe (HORIZON) · HORIZON-CL5-2027-07`).
- `country` (ISO alfa-2), `countryName` (em português), `region`, `regionName`: onde a chamada é executada, não a sede do organismo. Projeto regional fica sem `country`. `brazilProject` é `true` quando `country = BR`.
- `language`, `languageName`: idioma do aviso na fonte.
- `titleOriginal`, `titlePt`, `translationSource`: o título publicado e, quando existe, o título em português. `translationSource = source` quando a própria fonte publica em português; `model` quando veio de tradução automática local. O campo `title` do resumo é o que a tela mostra: `titlePt` se houver, senão o original. `summary` é escrito por regras, em português, a partir de campos estruturados (tipo, país, método, projeto, orçamento); o texto do aviso não é copiado.
- `amountOriginal`, `currency`: valor e moeda como publicados (a UE publica orçamento em euros; os avisos do Banco Mundial e do BID não trazem valor). `amountBrlApprox`, `fxRate`, `fxDate`: conversão pela PTAX de venda do boletim de fechamento do Banco Central, com a data da cotação. É aproximação. `amount` continua reservado a valor que a fonte publica em reais e fica `null` aqui.
- `deadline`: `at` é o mesmo instante de `registrationTo`; `original` é o prazo como a fonte escreveu, no relógio dela (`2026-10-27 11:00` ou `2026-10-27`); `timeZone` é a zona IANA desse relógio; `precision` é `datetime` quando dia, hora e zona são conhecidos e `date` quando só o dia é confiável. A tela mostra sempre o horário de Brasília com o original ao lado.
  - Banco Mundial: a API manda dia e hora local sem fuso. Quando o país do projeto tem um fuso só, a hora é convertida. Em país com mais de um fuso (Brasil, Indonésia, RD Congo, México…) e em projeto regional, fica o dia, `precision = date`, `timeZone = null`, e a hora aparece como texto ("12:00, hora local do comprador"), sem conversão. Nesses casos `at` é o último segundo do dia em UTC−12, para a chamada nunca ser encerrada antes da hora.
  - BID: o dataset publica só o dia (`2026-11-20`). Fica o último segundo desse dia no fuso do país do projeto, `precision = date`; em país com mais de um fuso (Brasil, Equador, México, Chile…) e em operação regional, o último segundo do dia em UTC−12.
  - UE: o portal rotula os prazos como `+0000`, mas o relógio é o de Bruxelas (a chamada Eurostars diz "14:00 (Brussels time)" e a API manda `14:00:00.000+0000`). Prazo à meia-noite é prazo sem hora: `precision = date` em `Europe/Brussels`. Com vários prazos de corte vale o próximo ainda por vir.
- `brazilEligibility`: `{ status, label, reason, rule }`, se uma entidade ou pessoa do Brasil pode participar. `status`: `yes` | `conditional` | `no` | `unknown`. `reason` é a frase legível da regra; `rule` é o identificador dela.
- `brazilFunding`: `{ status, label, reason }`, se o financiador paga o participante do Brasil. É uma pergunta separada: só a UE responde; no Banco Mundial e no BID é `null` (o contrato é pago a quem vence).
- `eligibilityCheckedAt`: quando a regra foi aplicada (a cada coleta).
- `details`: fatos rotulados do aviso para o detalhe ("Método", "Projeto", "Referência", "Programa", "Tipo de ação", "Prazos de corte"…).

A elegibilidade é indicativa. A tela mostra o motivo ao lado do selo e o aviso "o edital oficial prevalece".

### Regras de elegibilidade

**Banco Mundial** — `conditional` por padrão. A API não tem campo de país elegível; a abordagem de mercado está no texto do aviso, lido na coleta e não guardado.

| `rule`                                                                           | `status`      | Quando                                                                                                                                                                                 |
| -------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wb-international-open`                                                          | `yes`         | O aviso declara concorrência internacional ("international competitive procurement", "ICB", "appel d'offres international", "AOI", "licitación pública internacional"…)                |
| `wb-national-other-country`                                                      | `no`          | Processo nacional ou local ("National Competitive Bidding", "open national", "appel d'offres national", "LPN", "national shopping", "national consultant"…) em país que não é o Brasil |
| `wb-national-brazil`                                                             | `conditional` | Processo nacional de projeto no Brasil                                                                                                                                                 |
| `wb-ambiguous-market`                                                            | `conditional` | O aviso cita as duas abordagens                                                                                                                                                        |
| `wb-direct-selection`                                                            | `no`          | Contratação direta                                                                                                                                                                     |
| `wb-quotations`, `wb-individual-consultant`, `wb-consulting-firms`, `wb-default` | `conditional` | Sem menção ao mercado: pedido de cotações, consultor individual, seleção de firmas de consultoria e os demais                                                                          |

**BID** — as políticas de aquisição do BID admitem firmas e pessoas dos 48 países-membros, e o Brasil é membro. O dataset não tem campo de restrição; só o método ou o título podem indicar processo limitado ao país do projeto. O documento do aviso não é lido.

| `rule`                     | `status`  | Quando                                                                                                       |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| `idb-member-country`       | `yes`     | Regra geral: financiado pelo BID, sem indicação de processo nacional                                         |
| `idb-national-restriction` | `unknown` | Método ou título de processo nacional ou local ("National Competitive Bidding", "licitación pública nacional"…) fora do Brasil |
| `idb-national-brazil`      | `yes`     | Processo nacional de projeto no Brasil                                                                       |

**União Europeia** — participação e financiamento separados.

| `rule`                                                  | Participa        | Recebe financiamento | Quando                                                                                               |
| ------------------------------------------------------- | ---------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `eu-horizon-consortium` / `eu-third-country-not-funded` | `conditional`    | `no`                 | Horizon Europe colaborativo: entra em consórcio, sem verba da UE (Anexo B), salvo exceção da chamada |
| `eu-mentions-brazil`                                    | `conditional`    | `conditional`        | O texto da chamada cita Brasil, CELAC, América Latina ou Mercosul                                    |
| `eu-individual-researcher`                              | `yes`            | `yes`                | ERC e MSCA Postdoctoral Fellowships (bolsa individual, instituição anfitriã na UE ou país associado) |
| `eu-msca-partner`                                       | `conditional`    | `no`                 | Demais ações MSCA: organização do Brasil como parceira associada                                     |
| `eu-restricted`                                         | `no`             | `no`                 | "participation is limited to legal entities established in Member States and Associated Countries"   |
| `eu-defence-fund`                                       | `no`             | `no`                 | Fundo Europeu de Defesa                                                                              |
| `eu-programme-countries`                                | `unknown`        | `no`                 | Outros programas (Digital Europe, Creative Europe, CERV, LIFE…): o Brasil não é país associado       |
| `eu-cascade` / `eu-cascade-restricted`                  | `unknown` / `no` | `unknown` / `no`     | Chamada em cascata: quem define os países é o projeto que a abriu                                    |
| `eu-external-action` / `eu-twinning`                    | `unknown` / `no` | `unknown` / `no`     | Ação externa (regra de nacionalidade do instrumento) e Twinning                                      |

### Coleta

`pnpm --filter @workspace/api-server run collect:international`; agenda somente quando `INTERNATIONAL_COLLECT=true` (padrão desligado), no máximo uma conclusão por dia em `America/Sao_Paulo`. A coleta começa depois que uma execução do PNCP termina, em qualquer estado final, a partir da hora diária das 06:00; enquanto PNCP, transparência, cultura ou fomento tiver uma execução `running` com heartbeat recente, a agenda espera e verifica novamente em intervalos de cinco minutos. `INTERNATIONAL_HOUR` (10 por padrão, de 7 a 23) é a rede de segurança: se o PNCP não rodar, a coleta internacional começa nessa hora, ainda respeitando execuções em andamento. A janela 00:00–05:30 permanece reservada ao job noturno, e reinícios consultam `ingest_runs`: uma execução internacional `complete` (ou ainda `running`) impede repetição no dia, e uma linha `failed` por erro da fonte também, para não insistir na fonte o dia inteiro. Só a linha `failed` de um processo que morreu no meio (`interrupted by API restart` ou heartbeat expirado) permite nova tentativa no mesmo dia. `INTERNATIONAL_DRY_RUN=true` no comando manual lê as fontes e imprime as contagens por fonte e por elegibilidade, sem gravar e sem exigir `DATABASE_URL`. `INTERNATIONAL_SOURCES=worldbank` lê uma fonte só (`worldbank`, `eu_ft`, `idb`). Trava: job singleton `international_collect` e uma linha `running` por vez em `ingest_runs` (`source = 'international'`).

- **Banco Mundial**: `GET search.worldbank.org/api/v2/procnotices?format=json` com `deadline_strdate` (ontem, em UTC) e `deadline_enddate`, 100 por página. É a API do dataset "Procurement Notice" (Finances One DS00979, CC BY 4.0). Entram convite à licitação, pedido de manifestação de interesse e convite à pré-qualificação com prazo ainda por vir; adjudicações e avisos gerais ficam fora. A lista `fl` não pede contato, e-mail, telefone nem endereço, e `raw_payload` guarda uma lista fechada de campos, sem o texto do aviso.
- **Funding & Tenders**: `POST api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA` com a DSL documentada pela Comissão — `type` 1 (tópico de subvenção), 2 (chamada de ação externa) e 8 (chamada em cascata), `status` 31094501 (previsto) e 31094502 (aberto), ordenado por `identifier`, 100 por página — e um `POST …/rest/facet` por coleta para os rótulos de programa, zona e tipo de contrato. O resultado da busca já traz condições, orçamento e descrição, então a API Topic Details não é chamada (seriam centenas de requisições a mais). Resultado de outro datasource (evento, notícia) é ignorado. O índice mantém `status` aberto em chamadas encerradas há anos: só entra o que tem prazo à frente ou está previsto.
- **BID**: dataset "Project procurement bidding notices and notification of contract awards" do IDB Open Data (CKAN, CC BY 4.0). Por coleta: `robots.txt`, `GET data.iadb.org/api/3/action/package_show?id=project-procurement-bidding-notices-and-notification-of-contract-awards` para achar a tabela com `datastore_active` (o id muda quando o BID troca o arquivo) e `GET …/datastore_search` com `filters={"type":["SPECIFIC","EOI"]}`, `sort=deadline desc, _id asc`, só as 13 colunas usadas (`fields`) e 100 por página. A tabela tem cerca de 25 mil avisos desses dois tipos, quase todos encerrados; a ordem por prazo deixa os vigentes no topo e a leitura para na primeira página que chega a prazos anteriores a ontem (UTC), o que conta como listagem completa. Em 15/10/2026: 113 avisos abertos em 2 páginas, 4 requisições. Teto próprio de 10 páginas. Fica fora o aviso geral de aquisições (tipo `SPECIFIC` com título "General Procurement Notice"), além de adjudicações e pedidos de informação. Emendas ("ENMIENDA", "AMENDMENT", "ALTERAÇÃO") são avisos oficiais com prazo próprio e entram marcadas como emenda. O `datastore_search` foi escolhido em vez do CSV completo (todos os avisos desde 2018, a cada dia) porque devolve só as colunas e as linhas vigentes. O link oficial é o documento do aviso em `idbdocs.iadb.org`; sem ele o aviso não entra. O idioma não vem no dataset e é inferido do país (Brasil: português; Caribe anglófono e Suriname: inglês; Haiti: sem idioma; demais: espanhol). Atribuição exibida no item e no detalhe: "Fonte: BID (Banco Interamericano de Desenvolvimento), CC BY 4.0". "Onde se inscrever" não lê o documento do aviso.
- **PTAX**: `GET olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo`, uma requisição por moeda presente na coleta (hoje só EUR). Sem resposta do Banco Central a conversão anterior é mantida enquanto o valor original não muda; valor novo fica sem conversão até a próxima coleta.
- Volume: em 11/10/2026 a coleta inteira fez 23 requisições (8 ao Banco Mundial, 14 à UE e 1 ao Banco Central).
- User-Agent `PardalDigital/<versão> (+https://pardaldigital.com; contato@pardaldigital.com)` (no BID, fixo em `PardalDigital/1.0 (+https://pardaldigital.com; contato@pardaldigital.com)`, a identidade informada no pedido de autorização) e 1 segundo entre requisições (`INTERNATIONAL_PAGE_DELAY_MS`). O `robots.txt` de cada host é lido antes: 404 não restringe (é o caso dos dois hoje), proibição vira `blocked_by_robots` e qualquer outra resposta deixa a fonte fora daquela coleta. O serviço Olinda do Banco Central é API de dados abertos e não publica `robots.txt` (responde 502 nesse endereço); ele não passa por esse teste.
- `Retry-After` em 429 ou 503 é respeitado, com uma nova tentativa; acima de 60 s, ou na segunda recusa, a fonte fica para o próximo ciclo (`rate_limited`). No BID, resposta 5xx, timeout (60 s) ou conexão caída é repetida até duas vezes, depois de 5 s e 10 s. Nenhuma outra resposta é repetida. Redirecionamento não é seguido.
- Deduplicação por id da fonte no índice `(installationId, externalId)`: o id do aviso no Banco Mundial (`OP00474363`), o identificador do tópico na UE, `cascade-<callccm2Id>` nas chamadas em cascata (várias do mesmo tópico compartilham o `identifier`) e `prospect-<callIdentifier>` na ação externa; no BID, `noticeid` (único na tabela).
- Encerramento: pelo prazo, a cada coleta; e, quando a listagem foi lida até o fim, o que saiu dela é encerrado. Listagem incompleta ou com falha não encerra nada.

### Tradução do título

Sem OpenAI. `INTERNATIONAL_TITLE_TRANSLATION=off` (padrão) mantém o título original; o resumo em português por regras e o selo de idioma dão o contexto. `ollama` usa um modelo local servido pelo Ollama e exige `INTERNATIONAL_TITLE_TRANSLATION_MODEL` (não há modelo padrão); `libretranslate` usa qualquer serviço com a API do LibreTranslate (`INTERNATIONAL_TITLE_TRANSLATION_URL`), que é como modelos Marian/OPUS-MT e NLLB costumam ser servidos. A tradução roda depois que a coleta já foi gravada, em lote de até `INTERNATIONAL_TITLE_TRANSLATION_BATCH` títulos (padrão 100), só para os idiomas de `INTERNATIONAL_TITLE_TRANSLATION_LANGUAGES` (padrão `en,fr`; espanhol fica como está). Resposta vazia, igual ao original ou longa demais é recusada e o título fica no original; três falhas seguidas encerram o lote. Avisos em português entram com `translationSource = source`.

**Pendente: a medir no servidor.** Nenhum modelo foi escolhido nem medido. Antes de ligar, medir no próprio servidor (nunca na máquina de desenvolvimento) com uma amostra de títulos reais em inglês e francês: segundos por título, memória ocupada pelo modelo e proporção de respostas aceitas pelas regras acima, comparando ao menos um modelo de tradução dedicado (Marian/OPUS-MT ou NLLB via LibreTranslate) com um modelo pequeno do Ollama. Até lá a variável fica em `off` e a tela mostra o título original com o selo de idioma.

### Recomendações e perfil

A conta tem a preferência "Mostrar oportunidades internacionais" (`showInternationalOpportunities` em `GET/PUT /api/v1/me/recommendation-preferences`, padrão `false`). Desligada, `profileMatch` é sempre `null` nas chamadas internacionais; ligada, elas são comparadas com o perfil como as demais, com o valor em reais pela PTAX. A aba Internacionais do hub aparece para qualquer conta com acesso.
