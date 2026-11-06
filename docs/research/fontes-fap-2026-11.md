# Levantamento das FAPs estaduais (2026-11-05)

Cada uma das 27 unidades da federação tem uma Fundação de Amparo (ou de Apoio) à Pesquisa. Para cada uma, o levantamento leu a página inicial e o `robots.txt` com o User-Agent da Pardal Digital, para saber três coisas: se a coleta é permitida, se a página é HTML lido sem JavaScript e onde ficam os editais. O catálogo que a coleta usa fica em `artifacts/api-server/src/ingest/fap-sources.ts`, e o contrato está em [`docs/contracts/opportunities-v1.md`](../contracts/opportunities-v1.md#faps-estaduais-source--fap).

Regra comum: a coleta mostra título, período, sigla da FAP e link oficial com atribuição. PDFs não são copiados. Se uma FAP proíbe a leitura no `robots.txt`, a coleta não acontece.

| UF | FAP | Estado | Onde estão os editais | Observação |
|---|---|---|---|---|
| AC | FAPAC | pendente | `fapac.ac.gov.br` (WordPress) | Poucos links de edital na home; chamadas também em parceiros (Amazônia+10) |
| AL | FAPEAL | pendente | `/category/editais/`, `/pesquisador/editais/` | WordPress, um post por edital |
| AM | FAPEAM | pendente | `/editais/` e `?aba=fluxo-continuo` são templates Vue sem chamadas no HTML | Dados em `/wp-admin/admin-ajax.php` proibido no robots; `/wp-sitemap.xml` e `/sitemap_index.xml` retornam página não encontrada; feeds também proibidos (06/11/2026) |
| AP | FAPEAP | pendente | Portal `ap.gov.br`, PDFs em `matrix.amapa.gov.br` | Sem `robots.txt`; edital é PDF direto |
| BA | FAPESB | pendente | `/category/edital/` | WordPress |
| CE | FUNCAP | pendente | Notícias em `ce.gov.br/funcap/…` | Sem `robots.txt`; editais misturados com notícias de resultado |
| DF | FAPDF | **ativa** | `/editais-fapdf-<ano>` (Liferay, painéis por edital) | Adaptador `parseFapdfOpportunities` |
| ES | FAPES | pendente | `/editais` (abertos, encerrados, resultados) | Sem `robots.txt` |
| GO | FAPEG | **ativa** | `/fapeg/editais/inscricoes-abertas/` (não `em-andamento`) | Portal do estado; "em andamento" ≠ inscrição aberta |
| MA | FAPEMA | **ativa** | `/category/editais/editais-em-aberto/` | Categoria só de abertos; período no post (`detail`) |
| MG | FAPEMIG | **ativa** | `/oportunidades/chamadas-e-editais?status=aberta` (payload Nuxt) | Listagem filtrada já traz título, datas, valor e anexos; `sourceUrl` é a página de cada chamada |
| MS | FUNDECT | pendente | `ms.gov.br/ciencia-e-tecnologia/consultar-chamadas-publicas-da-fundect…` | Portal do estado |
| MT | FAPEMAT | **bloqueada** | — | `robots.txt` com `Disallow: /`; não coletar |
| PA | FAPESPA | pendente | Posts de notícia por chamada | Sem página de editais clara na home |
| PB | FAPESQ | pendente | `/editais/2026/editais-2026` | Página por ano, como a FAPDF |
| PE | FACEPE | **ativa** | `/editais/todos/?c=aberto` (+ `/editais-x-fluxo-continuo/`) | O filtro "aberto" também lista editais antigos e nenhum card traz data: só os editais do ano, com status `undated` |
| PI | FAPEPI | pendente | `/editais-fapepi/` | WordPress |
| PR | Fundação Araucária | pendente | — | Home sem links de edital no HTML; verificar menu e sitemap |
| RJ | FAPERJ | **ativa** | `www.faperj.br/?id=28.5.7` → `?id=530.6.6` (lista de 2026) | Cronogramas na lista; ignora datas riscadas, conselho e anos anteriores; 32 editais, 8 abertos em 06/11/2026 |
| RN | FAPERN | pendente | `/documentos/Editais/` | Listagem de documentos |
| RO | FAPERO | inacessível | — | Não respondeu no levantamento; testar de novo |
| RR | FAPERR | pendente | Posts de notícia | Poucas chamadas próprias; muitas do CONFAP |
| RS | FAPERGS | **ativa** | `/abertos` via `/_service/conteudo/pagedlistfilho?id=2042…` | HTML de `/abertos` vem vazio; chamadas no JSON do serviço (Allow: /); `detail` lê o post |
| SC | FAPESC | **ativa** | `/chamadas-abertas/` e posts dos editais | Prazo explícito prevalece sobre listagem; fluxo contínuo preservado; leitura real: 5 chamadas, 4 abertas (06/11/2026) |
| SE | FAPITEC | **ativa** | `/editais-abertos/` e posts dos editais | Exclui consultoria ad hoc; em andamento já inclui resultados (Inovathon: inscrições até 24/09/2026); cronograma da bolsa em imagem, status aberto pela listagem; leitura real: 1 chamada aberta (06/11/2026) |
| SP | FAPESP | **ativa** | `fapesp.br/chamadas`, painel “Chamadas Abertas (Todas)” | Prazo, área e modalidade; parcerias e fluxo contínuo incluídos; 24 chamadas abertas em 06/11/2026 |
| TO | FAPT | inacessível | — | Não respondeu no levantamento; testar de novo |

## Próximos lotes sugeridos

1. Páginas só de abertos, mais simples: FAPESC, FAPITEC, FAPEMA, FACEPE, FAPEAM e FAPEG.
2. Maior volume: FAPESP, FAPEMIG, FAPERJ e FAPERGS.
3. WordPress com um post por edital (lista e depois o post): FAPEAL, FAPESB, FAPEPI e FAPAC.
4. Casos difíceis (notícias, PDFs diretos ou portal do estado): FUNCAP, FAPEAP, FAPESPA, FAPERR, FUNDECT, FAPERN, FAPES, FAPESQ e Fundação Araucária.
5. Testar de novo: FAPERO e FAPT.
