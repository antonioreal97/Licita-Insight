# Pedido de liberação de acesso — Mapa da Cultura (federal)

Rascunho para o owner enviar. Canal publicado pelo Ministério da Cultura para o Mapa da Cultura:
`suporte.mapa@cultura.gov.br`
(<https://www.gov.br/cultura/pt-br/acesso-a-informacao/perguntas-frequentes/mapas-culturais>).

Antes de enviar, preencha o que está entre colchetes. O diagnóstico técnico que embasa o pedido está em
[`cultural-sources.md`](./cultural-sources.md).

## Por que pedir

A API pública do Mapa da Cultura federal (`https://mapa.cultura.gov.br/api/opportunity/find`) responde
**HTTP 403 com desafio do Cloudflare** (`Cf-Mitigated: challenge`, página pedindo JavaScript e cookies) para
qualquer cliente que não seja um navegador, de qualquer rede. O coletor do Pardal Digital registra a fonte como
bloqueada e **não tenta contornar** o desafio. As instalações estaduais e municipais do Mapas Culturais
respondem normalmente à mesma consulta.

Enquanto a liberação não vem, as chamadas federais chegam por outras fontes oficiais (editais do MinC e da
Funarte no gov.br e programas do Transferegov.br), que não trazem a lista completa de oportunidades do Mapa.

## Mensagem

**Para:** suporte.mapa@cultura.gov.br
**Assunto:** Pedido de liberação de leitura da API pública de oportunidades do Mapa da Cultura — Pardal Digital

Prezados,

Somos o **Pardal Digital** (<https://pardaldigital.com>), [razão social e CNPJ], um serviço brasileiro que
reúne, em um só lugar, licitações do PNCP e chamadas públicas de cultura e fomento, para que pequenos
produtores, coletivos e organizações da sociedade civil encontrem editais abertos. Cada chamada é exibida com o
nome do órgão que a publicou, a indicação da fonte e o **link para a página oficial**, onde a inscrição é
feita. Não intermediamos inscrições.

Já lemos, pela API pública `/api/opportunity/find`, as chamadas abertas de 12 instalações estaduais e 31
municipais do Mapas Culturais. No Mapa da Cultura federal, a mesma rota responde HTTP 403 com um desafio do
Cloudflare para clientes automatizados. Não tentamos contorná-lo e, por isso, escrevemos para pedir a
liberação.

**O que pedimos:** permissão para que o nosso coletor leia a rota pública
`GET https://mapa.cultura.gov.br/api/opportunity/find`, por exemplo com uma regra que dispense o desafio para
o nosso User-Agent e o nosso IP de saída. Se houver outro caminho oficial para as oportunidades abertas (um
arquivo de dados abertos, outra rota ou uma chave de acesso), usamos o que os senhores indicarem.

**Uso pretendido**

- Somente leitura, somente de **chamadas públicas abertas** (oportunidades), que já são de acesso público no
  site.
- Campos lidos: nome, descrição curta, datas de inscrição, tipo, áreas, órgão responsável e endereço da
  página da oportunidade.
- Não lemos dados de agentes, inscritos ou inscrições, nem qualquer dado pessoal; não fazemos login e não
  enviamos nada ao Mapa.
- Não copiamos anexos: guardamos só o título e o link oficial dos documentos.

**Volume e frequência**

- Uma coleta por dia, às 06:00 (horário de Brasília), e uma quando o nosso serviço é reiniciado, o que é
  raro.
- Uma consulta por coleta: `registrationTo=GTE(<data de hoje>)`, com 50 resultados por página e no máximo 20
  páginas — na prática, poucas requisições por dia.
- Intervalo mínimo de 1 segundo entre requisições; respeitamos `Retry-After` e não repetimos em sequência uma
  resposta 403 ou 429.
- Reduzimos a frequência ou mudamos o horário se os senhores preferirem.

**Identificação do coletor**

- User-Agent: `PardalDigital/<versão> (+https://pardaldigital.com; contato@pardaldigital.com)`
- IP de saída: [IP fixo do ambiente de produção]
- Cabeçalho `Accept: application/json`

**Contato**

- Responsável: [nome e cargo]
- E-mail: contato@pardaldigital.com
- Telefone: [telefone]

Ficamos à disposição para ajustar o que for necessário e para interromper a leitura a qualquer momento, a
pedido dos senhores.

Atenciosamente,
[nome]
Pardal Digital

## Depois da resposta

- Liberado: confirme com uma coleta manual (`pnpm --filter @workspace/api-server run collect:opportunities`)
  e veja se a instalação federal deixa de aparecer em `meta.installationIssues` de `/api/v1/opportunities`.
  Nenhuma mudança de código é necessária; a instalação federal já está na lista do coletor.
- Negado ou sem resposta: as chamadas federais continuam vindo das páginas do MinC e da Funarte e do
  Transferegov.br (`CULTURE_FEDERAL_COLLECT=true`).
- Uma chamada que o MinC ou a Funarte publicam com link para o Mapa da Cultura já aparece no hub com esse
  link. Quando a API for liberada, a mesma chamada passará a vir também pelo Mapa, com outro identificador;
  será preciso unificar as duas pelo endereço da oportunidade antes de religar a instalação federal.
