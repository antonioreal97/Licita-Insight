# Fixtures das fontes federais de cultura

Respostas reais das fontes públicas, gravadas em 11/10/2026 com o User-Agent do coletor
(`PardalDigital/<versão> (+https://pardaldigital.com; contato@pardaldigital.com)`) e reduzidas para caber no
repositório. Das páginas gov.br ficou só o bloco `<main>`, sem scripts, links de compartilhamento e atributos
de apresentação (`data-*`, `title`, `target`, `style`).

| Arquivo                                | Origem                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `transferegov-parcerias-programa.json` | `api-publica.transferegov.gestao.gov.br/parcerias/programa?situacao_programa=Disponibilizado` — 4 dos 92 programas (ids 181, 97, 72, 9) |
| `siconv_programa-amostra.csv`          | `siconv_programa.csv` de `…/downloads/dadosgov/siconv_programa.zip` — cabeçalho e 21 das 1.257.690 linhas, de 8 programas               |
| `govbr-robots.txt`                     | `www.gov.br/robots.txt`, sem as regras de `/ebserh` e `/mre`                                                                            |
| `funarte-robots.txt`                   | `www.gov.br/funarte/robots.txt` (o de `www.gov.br/cultura/robots.txt` é idêntico)                                                       |
| `funarte-editais-abertos.html`         | `www.gov.br/funarte/pt-br/editais/editais-abertos` — os 4 cartões do dia                                                                |
| `funarte-editais-2026.html`            | `www.gov.br/funarte/pt-br/editais/2026` — índice do ano                                                                                 |
| `funarte-programa.html`                | `…/editais/2026/programa-funarte-aberta` — página de programa, com um cartão por chamada                                                |
| `funarte-chamada.html`                 | `…/programa-funarte-aberta-2026-2013-ocupacao-dos-espacos-culturais-da-funarte-centro-de-teatro` — 6 parágrafos e 4 dos 17 anexos       |
| `minc-inscricoes-abertas.html`         | `www.gov.br/cultura/pt-br/assuntos/editais/inscricoes-abertas` — os 3 cartões do dia                                                    |
| `minc-cultura-viva-pontoes.html`       | `…/edital-cultura-viva-fomento-a-rede-de-pontoes-de-cultura-viva` — sem os anexos 3 a 13                                                |
| `minc-biblioteca-comunitaria.html`     | `…/edital-biblioteca-comunitaria-e-cultura-viva` — até a seção "Inscrições" (fluxo contínuo)                                            |
| `minc-rouanet-nas-favelas.html`        | `…/programa-rouanet-nas-favelas-2` — até o cronograma e a seção "Inscrições" (inscrição pelo Salic)                                     |

O que os testes leem daqui:

- No dia da gravação, o cartão "Programa Funarte Aberta" da lista de abertos redirecionava para
  `…/editais-1/2026/programa-funarte-aberta`, que respondia 404; a página existe em `…/editais/2026/…`. Os
  outros três cartões redirecionam para fora do gov.br (`cenografiasdoavesso.com`, `oei.int` e
  `mapa.cultura.gov.br/oportunidade/11685`). O coletor guarda esses endereços e não os requisita.
- O edital Cultura Viva aparece na lista do MinC e na da Funarte; as duas apontam para a mesma oportunidade do
  Mapa da Cultura.
- No CSV, um programa ocupa uma linha por modalidade, natureza jurídica e UF. A amostra tem um nome entre aspas
  com `;` dentro, um programa `CADASTRADO`, um encerrado em 2012 e um com fim em `15/12/5008`.
