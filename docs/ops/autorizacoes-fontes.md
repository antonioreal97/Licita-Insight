# Autorizações das fontes

Registro das permissões e respostas recebidas das fontes de dados, com as condições que o Pardal Digital assumiu ao pedir. Só a organização e o canal oficial; nenhum e-mail pessoal. Antes de mudar volume, frequência ou identidade de uma coleta registrada aqui, rever as condições.

Pedidos em andamento ficam em notas próprias, como [`pedido-liberacao-mapa-cultura.md`](pedido-liberacao-mapa-cultura.md).

## BID — IDB Open Data

- **Fonte:** dataset "Project procurement bidding notices and notification of contract awards" em `data.iadb.org` (CKAN), licença CC BY 4.0.
- **Canal:** IDB Open Data, `opendata@iadb.org`.
- **Pedido (11/10/2026):** permissão para ler o dataset de avisos de aquisição uma vez por dia, em baixo volume, identificado como `PardalDigital/1.0 (+https://pardaldigital.com; contato@pardaldigital.com)`.
- **Resposta (13/10/2026):** "This use case is acceptable for us. We are updating our robots.txt to reflect a more permissive approach for our users."
- **robots.txt (15/10/2026):** `https://data.iadb.org/robots.txt` libera páginas, downloads, catálogo e a API (`Allow: /*api/*action/`, com `package_show` e `datastore_search?resource_id=…` citados como uso esperado). A coleta continua lendo o `robots.txt` a cada execução e para se ele passar a proibir.

Condições que assumimos e onde estão no código ([`docs/contracts/opportunities-v1.md`](../contracts/opportunities-v1.md), seção Coleta):

| Condição | Como é cumprida |
| --- | --- |
| Uma leitura por dia | A fonte `idb` entra na coleta internacional diária, encadeada depois do PNCP (`INTERNATIONAL_COLLECT`), com no máximo uma conclusão por dia |
| Baixo volume | `package_show` + `datastore_search` só com as colunas usadas, ordenado por prazo e interrompido nos avisos vencidos: 4 requisições por dia em 15/10/2026, 1 s entre elas, teto de 10 páginas |
| Identidade fixa | User-Agent `PardalDigital/1.0 (+https://pardaldigital.com; contato@pardaldigital.com)` em toda requisição ao `data.iadb.org` (`IDB_USER_AGENT` em `artifacts/api-server/src/ingest/idb-parsers.ts`) |
| Atribuição ao BID | "Fonte: BID (Banco Interamericano de Desenvolvimento), CC BY 4.0" no item da lista e no detalhe |
| Link para o aviso oficial | Cada item aponta para o documento do aviso em `idbdocs.iadb.org`; aviso sem link não entra |
| Sem copiar documentos completos | Só os campos estruturados do dataset; o documento do aviso não é baixado nem lido ("Onde se inscrever" não roda para o BID) e o resumo é escrito por regras |

## Ibermúsicas

- **Canal:** canal oficial de contato do programa Ibermúsicas.
- **Resposta (13/10/2026):** "Nuestras convocatorias son públicas, pueden difundirlas libremente. El próximo ciclo de convocatorias se iniciará en junio de 2027."
- **Situação:** só registrada. Não há coletor; rever antes do ciclo de junho de 2027.
