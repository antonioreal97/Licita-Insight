# Fixtures do Mapas Culturais

Respostas reais das APIs públicas, gravadas em 10/10/2026 com o User-Agent do coletor e reduzidas para caber
no repositório. Só entram registros publicados por órgãos públicos.

| Arquivo                         | Origem                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `es-open.json`                  | `mapa.cultura.es.gov.br/api/opportunity/find?registrationTo=GTE(2026-10-10)` — 3 dos 11 registros                 |
| `pe-open.json`                  | `www.mapacultural.pe.gov.br`, mesma consulta — 3 dos 17 registros, um deles de fluxo contínuo                     |
| `ce-open.json`                  | `mapacultural.secult.ce.gov.br`, mesma consulta — 3 dos 33 registros; esta instalação não publica `terms.area`    |
| `es-continuous-flow-error.html` | Corpo devolvido com status 200 e `text/html` para `continuousFlow=EQ(true)` — primeiros 700 caracteres de ~500 kB |
| `ce-continuous-flow-500.html`   | Corpo completo devolvido com status 500 para a mesma consulta                                                     |

`continuousFlow` é uma coluna de data no Mapas Culturais. O filtro booleano antigo fazia o banco da instalação
recusar a consulta (`invalid input syntax for type timestamp: "true"`), e o servidor respondia a página de erro
em HTML no lugar do JSON.
