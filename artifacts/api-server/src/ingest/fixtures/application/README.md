# Fixtures de "Onde se inscrever"

Trechos de editais e páginas públicas, baixados em 14/10/2026 com o User-Agent do coletor e reduzidos ao que
os testes leem. O texto dos PDFs saiu do mesmo extrator dos editais (`ai/document-extractor.ts`), com as quebras
de linha do PDF preservadas (é nelas que os links se partem). Sem dados pessoais: nenhum trecho traz nome de
pessoa; os e-mails que aparecem são institucionais.

| Arquivo | Origem |
| --- | --- |
| `capes-apcn-edital-20-2026.txt` | CAPES, Edital nº 20/2026 (APCN), `…/editais/edital_2844920.pdf` — itens 2.2, 3.8–4.6, 4.13 e o cronograma |
| `capes-pdse-edital-22-2026.txt` | CAPES, Edital nº 22/2026 (PDSE), `…/editais/sei_2849220_edital_n__22_2026.pdf` — cronograma original, 9.3, 10.2–10.3, 11.3–11.4, SCBA e rodapé do SEI |
| `capes-pdse.html` | Página do PDSE em `gov.br/capes` — só o `<main>` da seção "Inscrição" até a primeira linha do Edital 17/2025, sem atributos de apresentação |
| `cnpq-chamada-30-2026.txt` | CNPq/CAPES, Chamada nº 30/2026 (MAI/DAI), `…/chamadapublica30_2026_MAIDAI_2766773.pdf` — cronograma, 4.x (Lattes), 5.3.6 (Sucupira), 9 e 10.3 |

O que os testes leem daqui:

- APCN: a URL da Sucupira quebrada entre linhas (`…/submissao-de-` + `proposta.`) e o período repetido no item 4.3 e
  no cronograma; o link do SEI é de autenticidade, não de inscrição.
- PDSE: o edital original dá 1/10 a 3/11; a página, depois de duas alterações, dá 20/10 a 18/11. Por isso a página
  vem antes dos documentos e uma alteração não lida impede usar as datas do edital.
- CNPq: a Plataforma Carlos Chagas só é nomeada na submissão (o link aparece no recurso); a Sucupira aparece como
  verificação, perto de "submissão".

As páginas do MinC e da Funarte usadas nos testes são as de `fixtures/federal/`.
