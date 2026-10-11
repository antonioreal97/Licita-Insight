# Minimização de dados pessoais nas fontes públicas de oportunidades

Atualizado em 11 de outubro de 2026.

O hub de oportunidades (`cultural_opportunities`, tela `/oportunidades`) reúne chamadas publicadas em fontes
oficiais abertas. O que interessa ao produto é a chamada e a instituição que a publica. O nome de uma pessoa
física não é necessário para essa finalidade e não é gravado (LGPD, art. 6º, III).

## O problema corrigido

No Mapas Culturais, o dono de uma oportunidade é um **agente**, e um agente pode ser uma pessoa física
(`type` 1, "Individual") ou uma organização (`type` 2, "Coletivo"). A coleta pedia `owner.{id,name}` e gravava
o nome como instituição, sem olhar o tipo. Chamadas publicadas pela conta pessoal de alguém apareciam com o
nome dessa pessoa em `organization_name`, em `search_text` e em `raw_payload`. O mesmo valia para
`origin_name`, quando o vínculo da chamada (`ownerEntity`) era um agente pessoa física.

Isso é comum: muitas secretarias municipais publicam editais pela conta pessoal de um servidor. Na listagem
aberta de 11/10/2026, 46 das 82 chamadas tinham dono pessoa física (seção "Simulação").

## Regra de gravação (Mapas Culturais)

A coleta pede `owner.{id,name,type}` e `ownerEntity.{id,name,type}`. Nenhum campo de contato, documento ou
endereço de agente é pedido, em nenhuma consulta (`artifacts/api-server/src/ingest/mapas-client.ts`).

| Dono na fonte | `organization_name` | Nome gravado? |
|---|---|---|
| Organização (`type` 2) | nome da organização | sim |
| Pessoa física (`type` 1), chamada ligada a projeto, espaço, evento ou organização | nome do vínculo | não |
| Pessoa física (`type` 1), sem vínculo | `Proponente individual (<nome da instalação>)` | não |
| Tipo ausente e nome com palavra de instituição ("Secretaria", "Prefeitura", "Fundação", "Associação"…) | nome | sim |
| Tipo ausente e qualquer outro nome | como pessoa física | não |
| Qualquer tipo, nome com CPF, e-mail ou telefone (MEI registrado com o próprio CPF) | como pessoa física | não |

"Palavra de instituição" é uma lista curta, de órgãos públicos e formas jurídicas. Palavras de ofício ou de
arte ("Produções", "Ateliê", "Cultural", "Banda") não contam: é assim que um MEI se cadastra, com o próprio nome
junto.

O vínculo (`ownerEntity`) só vira instituição ou `origin_name` quando é projeto, espaço ou evento, ou quando é
um agente que é a própria organização dona ou tem nome de organização. Um agente vinculado que é a mesma pessoa
dona da chamada, ou outra pessoa, é descartado.

Do dono pessoa física ficam apenas o tipo do agente (`{"type": {"id": 1, "name": "Individual"}}`) e a decisão
tomada, em `raw_payload.ownerReview`:

```json
{ "version": 1, "ownerKind": "individual", "nameWithheld": true, "individualListing": false, "sourceChecked": true }
```

Não ficam nome, id do agente (que leva ao perfil público da pessoa), CPF, e-mail, telefone nem endereço.

`raw_payload` deixou de ser a resposta inteira da fonte. Ele guarda uma lista fechada de campos (`id`,
`name`, `shortDescription`, datas, `singleUrl`, `continuousFlow`, `type`, `terms`, `parent`, `isModel`), o dono
e o vínculo já minimizados e a decisão. Um campo novo que a API passe a mandar não entra.

Quando o dono é pessoa física, e-mail, telefone e CPF escritos no título ou no resumo são trocados por
`[contato removido]`. O texto de uma organização não é alterado. Limite conhecido: um nome próprio ou um
endereço escrito dentro do título ou do resumo não é detectado.

## Limpeza do que já estava gravado

Job `opportunity_owner_review` (`artifacts/api-server/src/ingest/opportunity-owner-review.ts`), no worker da
API. Roda **ao subir** e todo dia às **07:00** (`America/Sao_Paulo`), depois da coleta das 06:00, com o lock
consultivo compartilhado. Não precisa de migração nem de comando manual: faz parte do `dist/`. Quando não há
nada pendente, termina em uma consulta.

1. **Sem rede.** Toda linha do Mapas ainda não revisada (`raw_payload.ownerReview.version` diferente da
   versão atual) é reavaliada a partir do próprio `raw_payload`. As linhas antigas não têm o tipo do agente,
   então vale a regra de "tipo ausente": só fica nome com palavra de organização. `organization_name`,
   `origin_name`, `search_text`, `title`, `summary` e `raw_payload` são regravados. Datas, situação e áreas
   não mudam. Ao fim desta etapa, que não depende de nenhuma instalação responder, o único nome de dono que
   resta é o que tem palavra de organização; o passo 2 confere esses também.
2. **Com a fonte.** Para as linhas cujo tipo só foi lido do nome, o job pergunta o tipo à instalação
   (`GET /api/opportunity/find?id=IN(…)`, 40 chamadas por requisição, no ritmo do coletor). Organização cujo
   nome não parecia de organização recebe o nome de volta. Pessoa física com nome que parecia de organização
   perde o nome. Chamada que a fonte não publica mais fica como o passo 1 deixou. Instalação que falha mantém
   as linhas para a próxima execução; instalação que o coletor registrou como bloqueada ou desativada não é
   consultada. Este passo não roda com `CULTURE_DAILY_COLLECT=false`.

Idempotente: linha revisada não é selecionada de novo, e a segunda execução não regrava nada. `updated_at` só
muda quando a instituição, a origem ou o texto mudam. Mudar a regra é subir `OWNER_REVIEW_VERSION`
(`opportunity-owner.ts`): a execução seguinte reavalia todas as linhas do Mapas.

A coleta diária também regrava, com o tipo certo, toda chamada ainda aberta na fonte.

Conferência depois do deploy (o resultado esperado é zero):

```sql
select count(*) from cultural_opportunities
where source = 'mapas' and raw_payload #>> '{ownerReview,version}' is distinct from '1';
```

O resumo de cada execução fica no log (`Opportunity owner review finished`) e em `job_run_audit`
(`job_key = 'opportunity_owner_review'`).

## Órgão cadastrado como agente individual

A leitura real mostrou órgãos públicos cadastrados no Mapas como agente **individual**: o nome do agente é
"Secretaria Municipal de…", "Prefeitura Municipal de…", "Fundação…", mas o tipo é 1. Entre os agentes
individuais cujo nome tinha alguma palavra de organização, 5 de 8 começavam pelo nome de um órgão; em 2 a
única palavra era "Produções".

Decisão desta entrega: vale o tipo declarado na fonte. Agente individual não tem o nome gravado, mesmo quando
o nome parece o de um órgão, porque o mesmo campo recebe "Secretaria de Cultura — <nome do servidor>" e
"<nome> Produções", e não há como separar os casos sem ler o nome. O custo é de rótulo: o edital dessa
prefeitura aparece como `Proponente individual (<instalação>)`, continua visível (o texto cita edital ou órgão)
e leva à fonte. Abrir exceção para nomes que começam por órgão público é decisão do owner; a regra está em
`resolveOwner` (`opportunity-owner.ts`).

## Simulação (11/10/2026)

Sem acesso ao banco de produção, a contagem foi feita sobre a fonte: uma passada pela listagem aberta de todas
as instalações, no ritmo do coletor (o mesmo volume de uma coleta diária), aplicando a regra nova em memória.
Nada foi gravado e nenhum nome foi impresso. 32 instalações responderam; 12 falharam (entre elas a federal,
que responde 403 e não é contornada).

| | Chamadas |
|---|---|
| Abertas nas 32 instalações | 82 |
| Dono pessoa física: nome deixa de ser gravado | 46 |
| … passam a mostrar o projeto ou espaço vinculado | 10 |
| … passam a mostrar `Proponente individual (…)` | 36 |
| … continuam no hub (citam edital, lei ou órgão) | 29 |
| … viram anúncio individual, fora do hub por padrão | 17 |
| Vínculo (`origin_name`) que era pessoa física e deixa de ser gravado | 20 |
| Dono sem tipo declarado | 0 |

No banco, a limpeza alcança também as chamadas já encerradas, que a listagem aberta não mostra: o total de
linhas alteradas em produção deve passar de 46. Se a proporção das chamadas abertas se repetir nas encerradas,
é cerca de metade das linhas do Mapas. A consulta por `id=IN(…)` do passo 2 foi conferida no Mapa Cultural do
Ceará.

## Anúncios individuais (qualidade)

Nem tudo que uma pessoa física publica é chamada pública: há aulas, oficinas particulares e testes do
formulário. A chamada é marcada como **anúncio individual** (`raw_payload.ownerReview.individualListing`)
quando as duas condições valem:

- o dono é pessoa física (ou foi tratado como tal);
- o título, o resumo e o vínculo não citam instrumento público (edital, chamamento, chamada pública,
  credenciamento, concurso, prêmio, convocatória, seleção pública, licitação, fomento), lei de fomento (PNAB,
  Aldir Blanc, Lei Paulo Gustavo, termo de execução cultural) nem órgão público (prefeitura, secretaria,
  município, governo, fundação, conselho, fundo, ministério) — ou o título diz que é teste.

Anúncio individual fica **fora** de `/oportunidades` e de `GET /api/v1/opportunities` por padrão. Entra com
`includeIndividual=true` (na tela, "Incluir anúncios de proponentes individuais", com a contagem do que ficou de
fora) e aparece com o selo "Anúncio individual". O link direto continua abrindo, sem dado pessoal.

O critério é conservador nos dois sentidos: o edital que uma prefeitura publica pela conta de um servidor
continua visível, só com o rótulo neutro; e nada é apagado — o anúncio apenas não é apresentado como edital.

## Outras fontes

| Fonte | Instituição gravada | `raw_payload` |
|---|---|---|
| Transferegov.br (parcerias) | órgão superior ou repassador do programa | registro do programa nos dados abertos: códigos, datas, objeto, público-alvo, UFs. Sem campo de pessoa. |
| Transferegov.br (discricionárias) | órgão superior do programa | campos escolhidos do CSV (códigos, datas, modalidades, naturezas jurídicas, UFs) |
| MinC, Lei Rouanet (Salic) e Funarte | constante por portal | endereço da lista e do cartão, situação e datas |
| CNPq, CAPES e FINEP | constante por fonte | só o endereço da chamada |

Correção nesta entrega: CNPq e FINEP guardavam em `raw_payload.text` o texto inteiro da página da chamada, que
pode citar pessoas (coordenação, assinaturas, contatos). O texto deixou de ser gravado, e o job acima apaga
`text` das linhas existentes das fontes de fomento. A API do Salic não é coletada (ela lista projetos e
proponentes, não chamadas).

Os testes `LGPD: …` em `federal-sources.test.ts` e `funding-parsers.test.ts` falham se uma dessas fontes passar
a gravar nome com forma de pessoa como instituição, CPF, e-mail ou telefone no payload, ou campo de pessoa.

## Pedido de titular

Quem encontrar um dado pessoal seu em um registro do hub escreve para `contato@pardaldigital.com`
(Política de Privacidade, seção 2). Depois desta correção, o que pode restar é um nome escrito pelo próprio
publicador no título ou no resumo da chamada.

Pendência: não existe lista de supressão. Apagar o trecho na linha resolve uma chamada encerrada, mas uma
chamada ainda aberta na fonte é regravada pela coleta seguinte. Até existir a lista, o pedido sobre chamada
aberta precisa de acompanhamento manual do owner.
