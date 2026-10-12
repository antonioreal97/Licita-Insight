# Fixtures das fontes internacionais

Respostas reais das APIs públicas, gravadas em 11/10/2026 com o User-Agent do coletor
(`PardalDigital/<versão> (+https://pardaldigital.com; contato@pardaldigital.com)`) e reduzidas para caber no
repositório.

| Arquivo                      | Origem                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worldbank-procnotices.json` | `search.worldbank.org/api/v2/procnotices` com `deadline_strdate` e a lista `fl` do coletor — 12 dos 660 avisos do dia                                                  |
| `eu-ft-search.json`          | `POST api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA` com a consulta do coletor (`type` 1, 2 e 8; `status` aberto e previsto) — 14 dos 1.197 resultados |
| `eu-ft-facet.json`           | `POST …/rest/facet` com a mesma consulta — só as tabelas `type`, `status`, `frameworkProgramme`, `contractType` e `geographicalZones`, com os códigos usados acima      |
| `ptax-eur.json`              | `olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo` para `EUR` — os boletins de 07 a 09/10/2026                                               |

O que foi cortado:

- **Banco Mundial.** O coletor não pede contato, e-mail, telefone nem endereço (`fl`). De `notice_text` ficou
  um trecho de até 550 caracteres em volta da frase que diz como o mercado é abordado ("international
  competitive procurement", "appel d'offres ouvert national"…), sem a marcação HTML. E-mails, telefones e um
  nome de pessoa que apareciam nesses trechos foram trocados por `[e-mail removido]`, `[telefone removido]` e
  `[nome removido]`.
- **Funding & Tenders.** De cada resultado ficaram os campos de `metadata` que o parser lê. `topicConditions`,
  `descriptionByte` e `beneficiaryAdministration` ficaram só com os trechos que tratam de países elegíveis;
  `budgetOverview` ficou com as linhas do próprio tópico e uma de outro tópico da mesma chamada;
  `publicationDocuments` com os três primeiros documentos.

Casos cobertos: concorrência internacional e nacional (em inglês e francês), consultor individual, pedido de
cotações, dois avisos de projetos no Brasil, aviso com prazo vencido, país com mais de um fuso (Indonésia),
tópico do Horizon com e sem restrição de países, tópico que cita o Brasil, ERC, MSCA, Fundo Europeu de Defesa,
Digital Europe, três chamadas em cascata (duas do mesmo tópico), ação externa com documentos, e três resultados
que o índice ainda marca como abertos (prazo de 2023 e duas chamadas sem prazo, uma delas Twinning).
