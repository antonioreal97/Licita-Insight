# Levantamento das FAPs estaduais (2026-11-05)

Cada uma das 27 unidades da federação tem uma Fundação de Amparo (ou de Apoio) à Pesquisa. Para cada uma, o levantamento leu a página inicial e o `robots.txt` com o User-Agent da Pardal Digital, para saber três coisas: se a coleta é permitida, se a página é HTML lido sem JavaScript e onde ficam os editais. O catálogo que a coleta usa fica em `artifacts/api-server/src/ingest/fap-sources.ts`, e o contrato está em [`docs/contracts/opportunities-v1.md`](../contracts/opportunities-v1.md#faps-estaduais-source--fap).

Regra comum: a coleta mostra título, período, sigla da FAP e link oficial com atribuição. PDFs não são copiados. Se uma FAP proíbe a leitura no `robots.txt`, a coleta não acontece.

| UF | FAP | Estado | Onde estão os editais | Observação |
|---|---|---|---|---|
| AC | FAPAC | pendente | `fapac.ac.gov.br` (WordPress) | Poucos links de edital na home; chamadas também em parceiros (Amazônia+10) |
| AL | FAPEAL | pendente | `/category/editais/`, `/pesquisador/editais/` | WordPress, um post por edital |
| AM | FAPEAM | pendente | `/editais/` com abas (abertos, fluxo contínuo, encerrados) | Boa estrutura para listar só os abertos |
| AP | FAPEAP | pendente | Portal `ap.gov.br`, PDFs em `matrix.amapa.gov.br` | Sem `robots.txt`; edital é PDF direto |
| BA | FAPESB | pendente | `/category/edital/` | WordPress |
| CE | FUNCAP | pendente | Notícias em `ce.gov.br/funcap/…` | Sem `robots.txt`; editais misturados com notícias de resultado |
| DF | FAPDF | **ativa** | `/editais-fapdf-<ano>` (Liferay, painéis por edital) | Adaptador `parseFapdfOpportunities` |
| ES | FAPES | pendente | `/editais` (abertos, encerrados, resultados) | Sem `robots.txt` |
| GO | FAPEG | pendente | `goias.gov.br/fapeg/editais/em-andamento/` | Portal do estado (WordPress) |
| MA | FAPEMA | pendente | `/category/editais/editais-em-aberto/` | Categoria só de abertos |
| MG | FAPEMIG | pendente | `/oportunidades/chamadas-e-editais` | Catálogo com status, datas e valor (Nuxt); começar pela página de cada chamada |
| MS | FUNDECT | pendente | `ms.gov.br/ciencia-e-tecnologia/consultar-chamadas-publicas-da-fundect…` | Portal do estado |
| MT | FAPEMAT | **bloqueada** | — | `robots.txt` com `Disallow: /`; não coletar |
| PA | FAPESPA | pendente | Posts de notícia por chamada | Sem página de editais clara na home |
| PB | FAPESQ | pendente | `/editais/2026/editais-2026` | Página por ano, como a FAPDF |
| PE | FACEPE | pendente | `/editais/todos/?c=aberto` | Filtro de abertos na URL |
| PI | FAPEPI | pendente | `/editais-fapepi/` | WordPress |
| PR | Fundação Araucária | pendente | — | Home sem links de edital no HTML; verificar menu e sitemap |
| RJ | FAPERJ | pendente | `faperj.br/?id=28.5.7` (pesquisa 2026-10) | Home sem links no HTML; usar a lista de editais conhecida |
| RN | FAPERN | pendente | `/documentos/Editais/` | Listagem de documentos |
| RO | FAPERO | inacessível | — | Não respondeu no levantamento; testar de novo |
| RR | FAPERR | pendente | Posts de notícia | Poucas chamadas próprias; muitas do CONFAP |
| RS | FAPERGS | pendente | `/chamadas-e-editais` | Página única de chamadas |
| SC | FAPESC | pendente | `/chamadas-abertas/` | Página só de abertas |
| SE | FAPITEC | pendente | `/editais-abertos/` | Página só de abertos |
| SP | FAPESP | pendente | `fapesp.br/chamadas` | HTML estruturado com prazo, área e modalidade |
| TO | FAPT | inacessível | — | Não respondeu no levantamento; testar de novo |

## Próximos lotes sugeridos

1. Páginas só de abertos, mais simples: FAPESC, FAPITEC, FAPEMA, FACEPE, FAPEAM e FAPEG.
2. Maior volume: FAPESP, FAPEMIG, FAPERJ e FAPERGS.
3. WordPress com um post por edital (lista e depois o post): FAPEAL, FAPESB, FAPEPI e FAPAC.
4. Casos difíceis (notícias, PDFs diretos ou portal do estado): FUNCAP, FAPEAP, FAPESPA, FAPERR, FUNDECT, FAPERN, FAPES, FAPESQ e Fundação Araucária.
5. Testar de novo: FAPERO e FAPT.
