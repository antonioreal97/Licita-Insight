# UX — MVP de participação para pequenas empresas (28 set 2026)

Especificação implementável para o frontend (`artifacts/licitainsight`). Nenhum código foi alterado nesta onda.

Atualização de implementação: o backend proposto abaixo foi implementado e ampliado. O contrato
vigente está em [participation-v1.md](../contracts/participation-v1.md): seis etapas, checklist
"Tenho / Não tenho / Não sei", protocolo, próxima ação e histórico. As tabelas de quatro etapas
e checkbox desta revisão permanecem como registro da proposta original, não como contrato da API.

## Resumo

O LicitAI já responde bem a "o que diz este edital" (fatos oficiais, ficha com trecho e página, checklist de
habilitação, aderência ao perfil). Não responde ainda a "o que **eu** faço com ele": salvar e monitorar são os
únicos estados, a aderência fica escondida no fim da página no celular e nada separa o que veio do órgão, o que
o LicitAI leu automaticamente e o que o usuário declarou.

O MVP organiza o produto em quatro perguntas — **existe algo para mim, vale analisar, o que preparar, o que
acontece agora** — e acrescenta uma única camada nova de dado: a **declaração do usuário** (etapa do edital e
itens que ele marcou como prontos), sempre rotulada como "Você marcou" e nunca misturada com dado oficial.

A fase 1 (P0) usa só dados e endpoints que já existem. A fase 2 (P1) depende de estender o contrato de
`PUT /api/v1/me/saved-tenders/{tenderId}` — proposta descrita abaixo, **ainda não existe**.

## 1. Público, escopo e limites

**Para quem.** Pequena empresa (ME/EPP ou cooperativa, em geral 1–3 pessoas cuidando de licitação) que já
participou de pelo menos uma licitação. Conhece "pregão", "habilitação", "ME/EPP" e "proposta"; não precisa de
tutorial sobre o que é licitação. Precisa de triagem rápida, clareza do que preparar e não perder prazo.
O "já participou" é posicionamento de copy, não uma pergunta nem um bloqueio no produto.

**Dentro do MVP.** Painel, busca, detalhe (com ficha e checklist), editais salvos e monitoramento — as telas
que já existem — reorganizadas pelas quatro perguntas, mais etapa declarada e checklist de preparação por edital.

**Fora do MVP.** Cofre de documentos da empresa com validade (sugestão ao owner ainda sem resposta; ver
`memory-bank/activeContext.md`), envio de proposta, integração com portais de compra, WhatsApp, histórico de
preços, novas fontes.

**Regras que não se negociam** (herdadas de `.cursorrules`, `productContext.md` e das revisões anteriores):

1. O LicitAI **não confirma nada em portal oficial**. Não sabe se a empresa está cadastrada no SICAF, se a
   proposta foi enviada nem se foi aceita. Tudo isso só existe como declaração do usuário.
2. O LicitAI **não promete habilitação**. Nunca usar "apto", "habilitado", "pode participar", "cumpre os
   requisitos", "garantido". O checklist diz o que foi *encontrado* no edital; a marcação diz o que o usuário
   *disse* ter.
3. Ausência não é resposta: "Não encontrado nos documentos", nunca "Não exige" por omissão (regra da ficha).
4. Dado oficial é sempre público; leitura automática e declaração exigem assinatura (gate atual:
   `SUBSCRIPTION_REQUIRED` / `RequireSubscription`).
5. Design system e simplificação Apple de `docs/reviews/ux-simplification-2026-09-28.md` valem: tipografia
   atual, sem sobretítulos decorativos, sem jargão interno, sem cards dentro de cards, status com texto e cor.

## 2. Auditoria do produto atual

Método: leitura do código de todas as telas envolvidas (rotas em `App.tsx`, `tender-detail-page.tsx`,
`tender-sheet-panel.tsx`, `tender-fit-panel.tsx`, `fit-badge.tsx`, `saved-tenders-page.tsx`,
`monitoring-page.tsx`, `dashboard-page.tsx`, `require-subscription.tsx`, `access-gate.tsx`,
`query-states.tsx`, `deadline.ts`) e das revisões `ux-simplification`, `qualification-checklist`,
`onda3-sheet-frontend`, `onda3-fit-frontend` e `competitive-analysis`. Não houve sessão com navegador nesta
onda; as observações de layout vêm do markup e das medições registradas nessas revisões.

### 2.1 Onde cada pergunta é respondida hoje

| Pergunta | Onde responde hoje | Lacuna |
|---|---|---|
| Existe algo para mim? | Busca com `FitBadge` por linha; painel "Prazos mais próximos"; buscas salvas com alerta; notificação `profile_new_matches` | O painel lista os prazos **do Brasil inteiro**, não os do perfil. Sem perfil não há selo e o convite (`ProfileInviteCard`) disputa espaço com monitoramento e chamadas culturais. |
| Vale analisar? | Faixa de fatos (prazo, valor, local) + `TenderFitPanel` + grupo "Quem pode participar" da ficha | A resposta está espalhada em três painéis. A aderência fica no `<aside>`; abaixo de `xl` a grade vira uma coluna e o `aside` vem **depois** de Objeto, Ficha, Perguntar, Itens e Cronologia — no celular ela é o último bloco da página. |
| O que preparar? | Ficha: "Documentos exigidos" (checklist de habilitação por tipo, com página) + visita técnica, amostra e garantias | É leitura, não ação: não dá para marcar o que já está pronto nem ver quanto falta. Visita técnica obrigatória, amostra e garantia de proposta — que exigem preparo — ficam em grupos diferentes ("Quem pode participar", "Garantias e multas"). |
| O que acontece agora? | Cronologia (eventos oficiais, "Previsto" para datas futuras) + "Monitorar" + aba Notificações | Não há próximo passo. O detalhe não diz "o recebimento começa em…", "envie até…" nem "o resultado sai no portal". Editais salvos é uma lista plana ordenada por data em que foi salvo, sem etapa. |

### 2.2 Achados

1. **Dois tipos de dado já convivem sem distinção visual consistente.** Dado oficial (PNCP) aparece como texto
   comum; leitura automática aparece com `blockquote` de borda azul e link "p. N" na ficha, mas a aderência usa
   outro padrão (documento · página por extenso) e o selo de aderência usa `primary-subtle`, a mesma cor de
   toggle pressionado. Com a camada de declaração, a confusão viraria risco de promessa falsa.
2. **O aviso "Os trechos são escolhidos automaticamente…" aparece duas vezes** (ficha e Perguntar ao edital),
   já registrado como pendência em `ux-simplification`.
3. **Colisão de rótulo.** O status oficial `under_review` é "Em análise". Qualquer etapa do usuário não pode se
   chamar "Em análise"; usar "Analisando".
4. **Status oficial atrasa.** Edital "Aberto" com prazo vencido existe (o painel já filtra com `deadlineFrom`).
   O detalhe precisa dizer que o prazo publicado passou, sem mudar o status.
5. **Gate inconsistente no detalhe.** Sem assinatura: a ficha mostra "A ficha do edital faz parte da
   assinatura"; a aderência simplesmente some; Perguntar mostra outra frase. Visitante: a ficha convida a entrar,
   a aderência some. O MVP deve explicar o gate uma vez, no bloco de decisão.
6. **Rotas privadas redirecionam** para `/settings?billing=required#assinatura` (`RequireSubscription`). Funciona
   e é mantido; o `AccessPanel` de `/oportunidades` é o padrão melhor (explica antes) e serve de base para o
   estado sem acesso dos blocos novos.
7. **"Início das propostas" (`openingAt`) já está certo** no código (é quando começa o recebimento, não a
   sessão). A copy de próximo passo deve seguir isso e não chamar `openingAt` de "abertura da sessão".
8. **Dívida de documentação.** A tabela de tipografia em `design-system/tokens.md` ainda descreve `type-label` e
   `type-eyebrow` como 10 px mono em caixa-alta; o `index.css` atual usa 12 px (`--type-label-size: 0.75rem`).
   Não bloqueia o MVP, mas quem implementar deve seguir o `index.css`.

## 3. Proveniência: oficial, leitura automática, declaração

Regra central do MVP. Todo dado mostrado nas telas de decisão pertence a exatamente uma camada.

| Camada | O que é | Exemplos | Como aparece | Nunca |
|---|---|---|---|---|
| **Oficial** | Publicado pelo órgão e coletado do PNCP | objeto, órgão, status, prazo, valor, datas, itens, documentos, cronologia | Texto comum, sem rótulo extra; o texto oficial nunca é reescrito nem recaixado (regra atual). Origem no detalhe via "Abrir fonte original". | Ser editado ou "corrigido" pelo usuário |
| **Encontrado no edital** | Trecho escolhido automaticamente nos documentos oficiais | campos da ficha, checklist de habilitação, restrição ME/EPP da aderência | Resposta curta + link `p. N` (componente `SourceLink`) + trecho sob demanda em `blockquote border-l-2 border-primary/50`. Rótulo de grupo "Encontrado no edital". | "Confirmado", "verificado", "lista completa" |
| **Avaliação automática** | Cálculo do LicitAI sobre perfil × edital | selo e motivos de aderência | `FitBadge` + frase "Avaliação automática com base no perfil da empresa" (já existe em `FitDetails`) | Virar recomendação ("vale a pena", "participe") |
| **Você marcou** | Declaração do usuário | etapa ("Vou participar"), item do checklist marcado como pronto, "Enviei proposta", porte e área do perfil | Ícone `UserRound` 13 px + texto "Você marcou" (ou "Seu perfil diz") em `type-meta text-muted-foreground`, com data quando houver. Controles com `aria-pressed`/checkbox; nenhuma cor de status. | Usar `status-*`, `primary-subtle` como fundo de rótulo, ou texto que soe oficial ("Proposta enviada ao órgão") |

Regras visuais:

- **Cor não é proveniência.** A camada é dita em texto; cor e ícone só reforçam.
- **Tokens `status-*` são exclusivos do status oficial** (`StatusBadge`) e da urgência de prazo
  (`urgent-subtle`, `warning-subtle` em `DeadlineIndicator`). Etapa do usuário usa superfície neutra
  (`bg-muted`, `text-foreground`) e, quando selecionada, o estado pressionado padrão do `Button outline`
  (`aria-pressed` → `primary-subtle`), porque é um controle, não um selo.
- **Combinação oficial + declaração** sempre em duas frases, cada uma com sua origem:
  "O edital é exclusivo para ME/EPP (p. 4). Seu perfil diz que vocês são ME/EPP." Nunca "Vocês podem participar".
- **`accent` (âmbar forte) continua só para contadores.** "Atenção" usa `warning`.

Palavras proibidas em qualquer tela do MVP: apto, habilitado, habilitação garantida, pode participar, cumpre,
confirmado pelo portal, inscrito, proposta aceita, vale a pena, recomendado para você.

## 4. Jornada pelas quatro perguntas

As perguntas organizam a arquitetura; só viram título literal quando o LicitAI mostra fatos e não uma resposta
pronta. "Vale analisar?" não é título porque o produto não responde sim/não — mostra o que pesa e o usuário decide.

| Pergunta | Título na interface | Tela | Resposta do produto | Ação do usuário |
|---|---|---|---|---|
| Existe algo para mim? | "Para você" | Painel, busca | Editais abertos com aderência alta/média ao perfil; buscas salvas com novos editais | Abrir edital; cadastrar perfil; salvar busca |
| Vale analisar? | "Antes de decidir" | Detalhe (topo) | Prazo, valor × faixa do perfil, aderência, regras de participação encontradas, quanto da ficha foi lido | "Vou analisar" / "Vou participar" / "Não é para mim" |
| O que preparar? | "O que preparar" | Detalhe (ficha) e Editais salvos | Itens encontrados no edital que pedem preparo, com página; itens não encontrados listados para conferir | Marcar "Tenho pronto" por item |
| O que acontece agora? | "O que acontece agora" | Detalhe, Editais salvos, Monitoramento | Próxima data oficial, onde a proposta é enviada (no sistema indicado no edital), mudanças monitoradas | Abrir fonte; marcar "Enviei proposta"; monitorar |

## 5. Arquitetura de informação

### 5.1 Navegação

Sem item novo no menu (seis itens hoje; simplicidade). Mudanças:

- `/saved-tenders` passa a ser organizado por **etapa**. O rótulo "Editais salvos" fica (decisão aberta D1).
- `/monitoring` não muda de estrutura; ganha a etapa em cada edital monitorado.
- `/dashboard` troca a ordem dos blocos (ver 6.1).

### 5.2 Etapas declaradas (fase 2)

| Chave (proposta) | Rótulo | Quando | Efeito colateral |
|---|---|---|---|
| `analyzing` | Analisando | Padrão ao salvar | nenhum |
| `participating` | Vou participar | Usuário escolhe | liga o monitoramento (toast com Desfazer) |
| `submitted` | Enviei proposta | Usuário escolhe; oferecido quando o prazo passa com etapa "Vou participar" | mantém monitoramento |
| `dismissed` | Não vou participar | Usuário escolhe ("Não é para mim" no detalhe) | desliga o monitoramento (decisão aberta D3); continua salvo |

Etapa só existe para edital salvo. Escolher uma etapa num edital não salvo salva o edital (mesma regra de hoje:
monitorar implica salvar, `toggleMonitor` em `use-saved-tenders.tsx`).

### 5.3 Ordem do detalhe do edital

Hoje: cabeçalho → fatos → Objeto → Ficha → Perguntar → Itens → Cronologia | aside: Aderência, Documentos.

MVP (uma coluna abaixo de `xl`, na ordem abaixo; em `xl` a coluna lateral mantém Documentos):

1. Trilha, cabeçalho e ações (sem mudança; preserva `button-detail-save`, `button-detail-monitor`, `button-open-source`)
2. Faixa de fatos (sem mudança)
3. **Antes de decidir** (novo; absorve o `TenderFitPanel`)
4. **O que acontece agora** (novo; resumo por cima da cronologia)
5. Objeto
6. **Ficha do edital**, com o grupo "Documentos exigidos" renomeado para **O que preparar** e reunindo visita
   técnica obrigatória, amostra e garantia de proposta quando encontradas
7. Perguntar ao edital
8. Itens da contratação
9. Cronologia completa
10. Documentos (aside em `xl`; último bloco abaixo disso)

## 6. Mapa de telas

| Tela | Rota | Pergunta | Hoje | Mudança no MVP | Gate |
|---|---|---|---|---|---|
| Painel | `/dashboard` | Existe algo para mim? | métricas nacionais, prazos nacionais, cards de perfil/monitoramento/chamadas | 6.1 | público; "Para você" exige perfil + assinatura |
| Busca | `/search` | Existe algo para mim? | resultados com selo de aderência | etapa declarada no `TenderRow` quando salvo (fase 2) | público |
| Detalhe | `/tenders/:id` | Vale analisar? · O que preparar? · O que acontece agora? | 5.3 "Hoje" | 6.2 | fatos públicos; blocos automáticos e declarações exigem assinatura |
| Editais salvos | `/saved-tenders` | O que preparar? · O que acontece agora? | lista plana + Monitorar + CSV | 6.3 | `RequireAuth` + `RequireSubscription` (sem mudança) |
| Monitoramento | `/monitoring` | O que acontece agora? | Notificações + Editais monitorados | etapa e próximo passo em cada monitorado (fase 2) | idem |
| Perfil da empresa | `/settings#perfil-empresa` | Existe algo para mim? | formulário de 6 campos | só copy (6.4) | sessão; aderência exige assinatura |

### 6.1 Painel

Ordem nova da coluna principal:

1. **Seus próximos prazos** — editais salvos com etapa "Analisando" ou "Vou participar" e prazo a partir de hoje,
   ordenados por prazo, até 4. Fase 1 (sem etapa): editais monitorados com prazo futuro.
   Limitação: `GET /me/saved-tenders` só ordena por `savedAt desc`; a fase 1 ordena no cliente a primeira página
   com `pageSize=100` e diz "entre os 100 salvos mais recentes" quando `total > 100`. A fase 2 deve pedir
   ordenação por prazo no contrato.
2. **Para você** — busca atual de "Prazos mais próximos" (`status=open`, `deadlineFrom=hoje`) filtrada no cliente
   pelos selos alto/médio já calculados; se nenhum dos 4 tiver selo, mostra os 4 com o texto
   "Nenhum destes tem alta aderência ao seu perfil" e o link "Ver todos com prazo". Sem perfil: o bloco vira o
   `ProfileInviteCard` (sai da coluna lateral). Não inventar filtro de aderência na API de busca.
3. Métricas nacionais (as três atuais) descem para baixo desses blocos.

Visitante e sem assinatura: painel igual ao de hoje (métricas + prazos nacionais + card de entrada/assinatura).

### 6.2 Detalhe — blocos novos

**Antes de decidir** (`panel-decision`). Um `section` com `Panel` padrão (`rounded-xl border bg-card p-5 sm:p-7`).
Conteúdo em `dl` de linhas, cada uma com rótulo à esquerda (13rem em `sm+`, como `FieldRow`) e origem explícita:

| Linha | Fonte | Mostra quando |
|---|---|---|
| Prazo | oficial (`DeadlineIndicator variant="inline"`) | sempre |
| Valor e sua faixa | oficial + "Seu perfil diz" (motivo `out_of_value_range` / `value_not_published`) | sempre o valor; a faixa só com perfil |
| Aderência | avaliação automática (`FitBadge` + `reasonText`) | assinatura + perfil |
| ME/EPP | encontrado no edital (`me_epp`) + porte do perfil | campo encontrado |
| Consórcio, visita técnica, amostra, garantia de proposta | encontrado no edital | só os encontrados com resposta categórica; os não encontrados não aparecem aqui (ficam na ficha) |
| Leitura | "N de 13 campos encontrados" + documentos não lidos | ficha pronta |

Abaixo, o controle de etapa (fase 2) ou, na fase 1, os botões atuais de salvar/monitorar não se repetem — o bloco
termina com o link "Ver ficha completa" (âncora para a ficha).

Nenhuma linha calcula veredito. O bloco não mostra nota, semáforo nem "vale a pena".

**O que acontece agora** (`panel-next-steps`). Uma frase principal e no máximo duas secundárias, derivadas de
status oficial, datas oficiais e etapa declarada (tabela em 8.3). Link "Ver cronologia completa". Quando há
evento futuro na cronologia, mostra o mais próximo com o selo "Previsto" já existente.

**O que preparar** (grupo da ficha, fase 1 só leitura, fase 2 com marcação). Itens, na ordem:
`QUALIFICATION_ORDER` (ato societário, fiscal, trabalhista, técnica, econômico-financeira), depois visita técnica
se `mandatory`, amostra se `required`, garantia de proposta se `required`. Cada item mantém o `QualificationRow`
ou `FieldRow` atual; a fase 2 acrescenta à direita um checkbox "Tenho pronto". Resumo acima da lista:
"3 de 6 marcados como prontos por você". Abaixo, sempre: "Pode haver outras exigências. Confira sempre o edital."
e a linha "Não encontrados nos documentos: …" já existente.

### 6.3 Editais salvos

- Controle segmentado no topo (mesmo padrão do filtro "Todas / Não lidas" de Monitoramento, `role="group"` +
  `aria-pressed`): **Todos · Analisando · Vou participar · Enviei proposta · Não vou** com contagem. Estado na URL
  (`?etapa=`), como a busca faz com `useSearchUrlState`.
- Cada linha: `TenderRow` atual + barra inferior (a que hoje tem só "Monitorar") com: etapa ("Você marcou:
  Vou participar"), progresso do checklist ("3 de 6 prontos") quando houver, e a frase curta de próximo passo
  ("Envie até 03 out, 10:00"). Ações: menu de etapa (`Button outline sm` + `DropdownMenu` do kit), Monitorar.
- Ordenação padrão dentro de "Vou participar": prazo mais próximo primeiro (fase 2, depende do contrato).
- Exportar CSV ganha as colunas "Etapa (você marcou)" e "Itens prontos (você marcou)".

### 6.4 Perfil da empresa

Só copy: o convite sem perfil dentro de "Antes de decidir" (hoje no `TenderFitPanel`) passa a dizer a
consequência: "Cadastre o que sua empresa fornece e onde atua para ver a aderência e sua faixa de valor aqui."
O `ProfileInviteCard` do painel mantém o título atual ("Veja o que combina com sua empresa").

## 7. Fluxos

**F1 — Primeira visita logada (teste de 7 dias).**
1. Entra pelo Google e cai no painel. Sem perfil, "Para você" mostra o convite no topo da coluna principal.
2. "Cadastrar perfil" leva a `/settings#perfil-empresa` (formulário atual). Ao salvar, toast "Perfil salvo" e
   link "Voltar ao painel".
3. No painel, "Para você" mostra selos em até ~2 min (polling atual 2 s → 10 s); enquanto isso, linha
   "Avaliando a aderência ao seu perfil…".

**F2 — Da busca à decisão.**
1. Busca → linha com selo → detalhe.
2. "Antes de decidir" mostra prazo, valor × faixa, aderência e regras encontradas.
3. Usuário escolhe "Vou analisar" (salva, etapa Analisando), "Vou participar" (salva, liga monitoramento) ou
   "Não é para mim" (salva como "Não vou participar", com "Desfazer" no toast). Fase 1: só salvar/monitorar.

**F3 — Preparar.**
1. No detalhe ou a partir de Editais salvos → "O que preparar".
2. Abre o trecho ("Ver trecho") e a página oficial ("p. N") de cada item.
3. Marca "Tenho pronto" (fase 2). O resumo atualiza e é anunciado (`aria-live="polite"`).
4. Itens não encontrados aparecem como lista para conferir no edital; não dá para marcá-los (não são itens).

**F4 — Até o prazo.**
1. Etapa "Vou participar" com monitoramento ligado.
2. Mudança oficial (prazo, status, valor, documento) → notificação no sino e em Monitoramento (fluxo atual).
3. "O que acontece agora" diz quando começa o recebimento e até quando enviar, e que o envio é no sistema
   indicado no edital.

**F5 — Depois do prazo.**
1. Prazo passou com etapa "Vou participar": o bloco pergunta "O prazo terminou. Você enviou proposta?" com
   "Enviei proposta" e "Não enviei" (este vai para "Não vou participar").
2. "Enviei proposta": o bloco passa a dizer que o resultado sai no portal oficial e que o LicitAI avisa mudança
   de status. Nunca "aguardando resultado do órgão" como se soubéssemos que a proposta está lá.

**F6 — Visitante e sem assinatura.**
1. Detalhe: fatos oficiais completos, sempre.
2. "Antes de decidir" mostra só prazo e valor e uma nota: visitante → "Entre com Google para ver a ficha, a
   aderência ao seu perfil e o que preparar." + "Entrar com Google"; sem assinatura → "Ficha, aderência e
   checklist fazem parte da assinatura." + "Ver assinatura" (`BILLING_HREF`).
3. Os outros blocos automáticos (ficha, O que preparar, Perguntar) mostram só o título e uma linha
   "Incluso na assinatura" (`IncludedInAccessHint`), sem repetir a explicação três vezes.
4. Os controles de etapa ficam habilitados e, ao clicar, seguem o fluxo atual de `useSavedTenders` (visitante:
   login com retorno à página; sem assinatura: aviso de assinatura). É o mesmo comportamento do botão de salvar
   hoje.

## 8. Contrato de estados

### 8.1 Estados globais (reuso, sem mudança)

| Estado | Componente | Regra |
|---|---|---|
| Carregando lista | `RowsSkeleton` | aparece após 150 ms; espelha o `TenderRow` |
| Carregando bloco | barra `h-24 animate-pulse rounded-lg bg-muted` com `aria-busy` (padrão da ficha) | mesma altura do conteúdo final |
| Erro de consulta | `ErrorState` (mensagem por código + `ref.` do `requestId` + "Tentar novamente") | nunca vazio no lugar de erro |
| Erro de mutação | toast `destructive` com causa real e `ref.` (padrão `use-saved-tenders.tsx`) | estado otimista é revertido |
| Sessão expirada | toast "Sua sessão expirou" (`App.tsx`) | sem mudança |
| Sem assinatura (rota) | redirect `RequireSubscription` | sem mudança |

### 8.2 Blocos novos

| Bloco | Visitante | Sem assinatura | Carregando | Sem perfil | Parcial | Erro | Pronto |
|---|---|---|---|---|---|---|---|
| Antes de decidir | prazo + valor + nota de login | prazo + valor + nota de assinatura | linhas oficiais já visíveis; linhas automáticas com skeleton de linha | linhas oficiais + ficha; linha "Aderência" vira convite de perfil | ficha lendo: "Lendo os documentos… (até um minuto na primeira vez)"; documentos não lidos: aviso da ficha | erro de ficha ou aderência na própria linha, com `ref.` e "Tentar de novo"; as linhas oficiais continuam | todas as linhas aplicáveis |
| O que acontece agora | completo (só dado oficial) | completo, sem etapa | nunca (dados do detalhe) | — | status atrasado: frase de prazo vencido | — (depende do detalhe, que já trata erro) | frase principal + até 2 secundárias |
| O que preparar | título + "Incluso na assinatura" | idem | herda da ficha | — | sem itens encontrados: "Nenhuma exigência de documento foi encontrada nos documentos lidos. Confira o edital." | herda da ficha | lista + resumo |
| Controle de etapa (fase 2) | clique → login com retorno | clique → aviso de assinatura | `loading` no botão | — | — | toast de erro, etapa volta | etapa marcada + "Você marcou em dd/mm" |
| Editais salvos por etapa (fase 2) | — (rota privada) | — (redirect) | `RowsSkeleton` | — | — | `ErrorState` | lista filtrada |

Estados vazios de Editais salvos por etapa:

| Aba | Título | Texto |
|---|---|---|
| Todos | Nenhum edital salvo ainda | Salve um edital na busca ou no detalhe para acompanhar prazo e preparo aqui. [Explorar editais] |
| Analisando | Nada em análise | Editais que você salvar entram aqui até você decidir. |
| Vou participar | Nenhum edital com participação marcada | No edital, use "Vou participar" para ver aqui o que preparar e o próximo prazo. |
| Enviei proposta | Nenhuma proposta marcada como enviada | Depois de enviar no sistema indicado no edital, marque "Enviei proposta" para continuar acompanhando. |
| Não vou | Nenhum edital descartado | Editais marcados como "Não vou participar" ficam aqui. |

### 8.3 Regras de "O que acontece agora"

Avaliadas em ordem; a primeira que casar define a frase principal. `prazo` = `proposalDeadline`,
`início` = `openingAt`. Datas no formato de `formatDateTime`.

| # | Condição | Frase principal | Secundária |
|---|---|---|---|
| 1 | status `cancelled` | "O órgão revogou esta licitação." | "Dado oficial da fonte." |
| 2 | status `suspended` | "O órgão suspendeu esta licitação." | "Avisamos aqui quando houver nova data." (só se monitorado; senão: "Monitore para ser avisado da nova data.") |
| 3 | status `closed` | "Licitação encerrada na fonte." | etapa `submitted`: "Você marcou que enviou proposta. Consulte o resultado no portal oficial." |
| 4 | prazo nulo | "A fonte não publicou o prazo de propostas." | "Confira a data no edital." |
| 5 | prazo passou, status ainda ativo | "O prazo de propostas publicado terminou em {prazo}." | "A situação na fonte pode demorar a mudar." + pergunta de F5 se etapa `participating` |
| 6 | início no futuro | "O recebimento de propostas começa em {início}." | "Prazo final: {prazo}." |
| 7 | etapa `submitted` | "Você marcou que enviou proposta em {data da marcação}." | "O resultado sai no portal oficial. Avisamos aqui se o status mudar." |
| 8 | prazo futuro | "Envie a proposta até {prazo}." (+ `DeadlineIndicator` inline) | "O envio é feito no sistema indicado no edital, não no LicitAI." + etapa `analyzing`: "Decida antes disso." |

Nunca nomear o portal de envio (Compras.gov.br, BLL etc.): o dado não está no contrato atual.

## 9. Microcopy

Tom: direto, segunda pessoa ("você", "sua empresa"), frases curtas, sem "Ops!", sem culpa do usuário. Dizer o que
aconteceu e o próximo passo.

| Onde | Chave | Texto |
|---|---|---|
| Painel | título do bloco | Seus próximos prazos |
| Painel | vazio (fase 1) | Nenhum edital monitorado com prazo pela frente. Abra um edital e use "Monitorar". |
| Painel | vazio (fase 2) | Nenhum edital em análise ou com participação marcada com prazo pela frente. |
| Painel | limite fase 1 | Entre os 100 editais salvos mais recentes. |
| Painel | título | Para você |
| Painel | sem selo alto | Nenhum destes tem alta aderência ao seu perfil. |
| Detalhe | título | Antes de decidir |
| Detalhe | rótulo camada | Encontrado no edital |
| Detalhe | rótulo camada | Avaliação automática |
| Detalhe | rótulo camada | Você marcou · {data} |
| Detalhe | rótulo camada | Seu perfil diz |
| Detalhe | ME/EPP exclusivo + perfil ME/EPP | O edital é exclusivo para ME/EPP (p. {n}). Seu perfil diz que vocês são ME/EPP. |
| Detalhe | ME/EPP exclusivo + perfil outro | O edital é exclusivo para ME/EPP (p. {n}). Seu perfil diz que vocês não são ME/EPP. |
| Detalhe | valor sem faixa | Sem faixa de valor no seu perfil. |
| Detalhe | leitura | {n} de 13 campos encontrados nos documentos. |
| Detalhe | link | Ver ficha completa |
| Detalhe | etapa (botões) | Vou analisar · Vou participar · Não é para mim |
| Detalhe | toast participar | Participação marcada. Monitoramento ligado: avisamos aqui quando prazo, status, valor ou documentos mudarem. [Desfazer] |
| Detalhe | toast descartar | Marcado como "Não vou participar". [Desfazer] |
| Detalhe | título | O que acontece agora |
| Detalhe | pergunta pós-prazo | O prazo terminou. Você enviou proposta? · Enviei proposta · Não enviei |
| Detalhe | título do grupo da ficha | O que preparar |
| Detalhe | resumo checklist | {x} de {y} marcados como prontos por você |
| Detalhe | checkbox | Tenho pronto |
| Detalhe | aviso checklist | Pode haver outras exigências. Confira sempre o edital. |
| Detalhe | visitante | Entre com Google para ver a ficha, a aderência ao seu perfil e o que preparar. |
| Detalhe | sem assinatura | Ficha, aderência e checklist fazem parte da assinatura. |
| Detalhe | aviso único (substitui os dois atuais) | Os trechos são escolhidos automaticamente e podem não ser os únicos relevantes. Confira o edital original antes de decidir. |
| Salvos | segmentos | Todos · Analisando · Vou participar · Enviei proposta · Não vou |
| Salvos | etapa na linha | Você marcou: {etapa} |
| Salvos | progresso | {x} de {y} prontos |
| Erros | etapa | Não foi possível mudar a etapa. {causa} (ref. {id}) |
| Erros | checklist | Não foi possível salvar a marcação. {causa} (ref. {id}) |

`{causa}` segue o mapeamento de `errorDescription` em `use-saved-tenders.tsx` (assinatura, limite de 500, sem
conexão, `ref.`). Sem mensagens genéricas novas.

## 10. Responsividade

Mobile-first em 375 px; verificação em 390×844 e 1440×900 (mesmo método de `ux-simplification`).

- **< 640 px.** Blocos em uma coluna na ordem de 5.3. Em "Antes de decidir", rótulo acima do valor
  (a grade `sm:grid-cols-[13rem_minmax(0,1fr)]` já faz isso). Botões de etapa em linha com quebra; cada um
  `size="lg"` (44 px). A barra fixa inferior do detalhe **não muda** (salvar, monitorar, abrir fonte) e continua
  com os `data-testid` `*-mobile`; a etapa fica no conteúdo, não na barra.
- **640–1279 px.** Uma coluna; o cabeçalho mostra os botões de ação atuais.
- **≥ 1280 px (`xl`).** Duas colunas: principal com os blocos 3–9, lateral de 340 px com Documentos. A faixa de
  fatos continua `sticky`. "Antes de decidir" fica na coluna principal (não na lateral), para ser lido antes da
  ficha.
- **Editais salvos.** Controle segmentado com rolagem horizontal própria abaixo de `sm`
  (`overflow-x-auto`, sem rolagem da página); contagens em `tabular-nums`.
- **Critério.** Zero rolagem horizontal da página e zero erro de console em todas as telas, antes e depois.

## 11. Acessibilidade

Alvo WCAG 2.2 AA, mantendo o que já existe (skip link, foco em `#conteudo` na troca de rota, anel de foco 2 px,
`prefers-reduced-motion` e `prefers-reduced-transparency`).

1. Cada bloco é um `section` com `aria-labelledby` apontando para seu `h2` (padrão da ficha).
2. Proveniência sempre em texto; ícones `aria-hidden`. O link `p. N` mantém o texto oculto
   "({documento}, documento oficial, abre em nova aba)".
3. Controle de etapa: grupo de botões com `role="group"`, `aria-label="Etapa deste edital"` e `aria-pressed`
   (padrão de Monitoramento e do toggle de salvar). Mudança anunciada por região `aria-live="polite"`
   ("Etapa: Vou participar").
4. Checklist: `input type="checkbox"` nativo com `label` "Tenho pronto: {tipo}". O resumo "{x} de {y}" fica numa
   região `aria-live="polite"`.
5. Segmentos de Editais salvos: `role="group"` + `aria-pressed`; a contagem faz parte do nome acessível.
6. Alvos de toque ≥ 44×44 px abaixo de `sm`; ≥ 24×24 px no desktop (2.5.8).
7. Contraste: só tokens documentados (todos ≥ 4.5:1 para texto). Nada de `text-foreground-subtle` em texto.
8. Estados de erro com `role="alert"`; carregamento com `role="status"`/`aria-busy`.
9. Toasts com "Desfazer" ficam 10 s (`ACTION_TOAST_DURATION` em `hooks/use-toast.ts`, WCAG 2.2.1) e a ação
   também existe na própria tela (a etapa pode ser trocada de novo), para não depender só do toast.
10. Ordem de foco segue a ordem visual de 5.3; nenhum bloco muda de lugar por CSS `order` que contrarie o DOM.

## 12. Componentes

### 12.1 Reusar (sem mudar API)

| Componente | Arquivo | Uso no MVP |
|---|---|---|
| `Button` | `components/common/action-button.tsx` | etapa, marcações, ações |
| `TenderRow` | `features/tenders/components/tender-row.tsx` | painel, salvos, monitorados |
| `DeadlineIndicator` | `features/tenders/components/deadline-indicator.tsx` | prazo nos blocos novos |
| `StatusBadge` | `features/tenders/components/status-badge.tsx` | só status oficial |
| `FitBadge`, `reasonText` | `features/company-profile/components/fit-badge.tsx` | linha "Aderência" |
| `ValueDisplay` | `features/tenders/components/value-display.tsx` | linha de valor |
| `ErrorState`, `RowsSkeleton` | `components/common/query-states.tsx` | estados |
| `AccessPanel`, `IncludedInAccessHint` | `features/opportunities/components/access-gate.tsx` | gate nos blocos |
| `SearchPagination` | `features/search/components/search-pagination.tsx` | salvos por etapa |
| `PageTitle` | `components/common/page-title.tsx` | salvos |
| `DropdownMenu`, `Tabs` | `components/ui/*` | menu de etapa (kit interno permitido fora de `ui/button`) |
| hooks | `useTender`, `useTenderSheet`, `useTenderFits`, `useCompanyProfile`, `useSavedTenders`, `useSavedTendersList`, `useBilling`, `useSession` | mesma chave de cache: o bloco de decisão e a ficha compartilham a consulta da ficha, sem segunda chamada |

### 12.2 Extrair (já existe em dois lugares, ganha o terceiro)

- `SourceLink` (hoje privado em `tender-sheet-panel.tsx`) — usado por ficha, O que preparar e Antes de decidir.
  Mover para `features/tenders/components/source-link.tsx`.
- `EmptyState` de `monitoring-page.tsx` — Editais salvos tem hoje uma versão sem ícone e sem título; com as
  cinco abas vazias vira o segundo callsite. Mover para `components/common/`.
- `FIELDS` e `QUALIFICATION_LABELS` (rótulos da ficha) — o bloco de decisão precisa dos mesmos rótulos. Mover para
  `features/tenders/lib/sheet-labels.ts`.

### 12.3 Novos (em `features/participation/`, seguindo `src/features/<feature>/`)

| Componente | Responsabilidade | Callsites |
|---|---|---|
| `DecisionPanel` | bloco "Antes de decidir" | detalhe |
| `NextStepsPanel` | bloco "O que acontece agora" + regras de 8.3 (função pura em `lib/next-step.ts`, testável) | detalhe; a frase curta também em salvos e monitorados |
| `ProvenanceLabel` | rótulo "Encontrado no edital" / "Avaliação automática" / "Você marcou · data" / "Seu perfil diz" | decisão, preparar, salvos (≥ 2 callsites) |
| `StageControl` (fase 2) | botões/menu de etapa com otimismo e erro | detalhe, salvos |
| `PrepChecklist` (fase 2) | grupo "O que preparar" com checkbox; usa `QualificationRow`/`FieldRow` | ficha |

Nada de "motor de regras" genérico: `next-step.ts` é uma função com a tabela de 8.3.

## 13. Dependência de backend (fase 2)

Declarações são dado do usuário e vão para o servidor (o `localStorage` guarda só o relógio de inatividade e
preferências opcionais — regra do `AGENTS.md`). O contrato atual (`docs/contracts/account-v1.md`) tem:

- `PUT /api/v1/me/saved-tenders/{tenderId}` com `{ monitored?: boolean }`, idempotente, e `SavedTender =
  { tender, savedAt, monitored, monitoredAt }`.

**Proposta (não existe; precisa de handoff e contrato antes de qualquer código):**

- Estender o mesmo `PUT` com `stage?: 'analyzing' | 'participating' | 'submitted' | 'dismissed'` e
  `preparedItems?: string[]` (chaves dos tipos do checklist e dos campos `site_visit`, `samples`,
  `bid_guarantee`), preservando a regra atual de que campo ausente não altera nada.
- `SavedTender` ganha `stage`, `stageAt`, `preparedItems`.
- `GET /me/saved-tenders` ganha filtro `stage` e ordenação por prazo.
- Efeitos colaterais (participar liga monitoramento; descartar desliga) decididos no servidor, para o cliente não
  divergir entre abas.

Sem esse contrato, a fase 2 não começa. A fase 1 não depende dele.

## 14. Plano de implementação (frontend)

Cada item: arquivos, `data-testid` novos (os existentes ficam), aceite e verificação. Verificação padrão de cada
PR: `pnpm --filter @workspace/licitainsight run typecheck`, build, Playwright em 390×844 e 1440×900 com os três
estados de conta (visitante, sem assinatura, com assinatura), zero erro de console e zero rolagem horizontal.

### P0 — só dados existentes

| # | Entrega | Arquivos | Aceite |
|---|---|---|---|
| P0.1 | Proveniência consistente: extrair `SourceLink` e rótulos da ficha; `ProvenanceLabel`; aviso automático único no fim do detalhe (remove o duplicado da ficha e do Perguntar) | `tender-sheet-panel.tsx`, `ask-tender-panel.tsx`, novos `source-link.tsx`, `sheet-labels.ts`, `participation/components/provenance-label.tsx` | todo trecho automático tem `p. N`; um aviso por página (`text-sheet-disclaimer` passa a existir uma vez) |
| P0.2 | "Antes de decidir" com linhas oficiais + ficha + aderência; `TenderFitPanel` sai do aside | `tender-detail-page.tsx`, `participation/components/decision-panel.tsx` | `panel-decision` aparece antes do Objeto em todas as larguras; aderência visível sem rolar até o fim no celular; nenhum veredito |
| P0.3 | "O que acontece agora" com `lib/next-step.ts` (tabela 8.3 sem etapa) | `participation/lib/next-step.ts` (+ teste unitário das 8 regras), `next-steps-panel.tsx` | `panel-next-steps`; prazo vencido com status ativo mostra a frase 5; nenhum nome de portal |
| P0.4 | Grupo "O que preparar" (renomeia "Documentos exigidos" e junta visita técnica obrigatória, amostra e garantia de proposta encontradas) | `tender-sheet-panel.tsx` | mesmos itens, mesma ordem de `QUALIFICATION_ORDER`, sem "não exige" inferido |
| P0.5 | Gate explicado uma vez no bloco de decisão; `IncludedInAccessHint` nos demais | `tender-sheet-panel.tsx`, `ask-tender-panel.tsx`, `decision-panel.tsx` | visitante e sem assinatura veem uma explicação e um CTA |
| P0.6 | Painel: "Seus próximos prazos" (monitorados) e "Para você" acima das métricas; convite de perfil na coluna principal | `dashboard-page.tsx` | `section-dashboard-next-deadlines`, `section-dashboard-for-you`; aviso de limite quando `total > 100` |

### P1 — depende do contrato da seção 13

| # | Entrega | Aceite |
|---|---|---|
| P1.1 | `StageControl` no detalhe (etapa, toasts, efeitos no monitoramento) | `group-stage`, `button-stage-{chave}`; otimismo com reversão e toast de erro com `ref.` |
| P1.2 | `PrepChecklist` com "Tenho pronto" e resumo | `checkbox-prepared-{chave}`, `text-prep-summary`; marcação sobrevive a recarregar |
| P1.3 | Editais salvos por etapa (URL `?etapa=`), barra com etapa/progresso/próximo passo, CSV com colunas novas | `filter-stage-{chave}`; cinco estados vazios da tabela 8.2 |
| P1.4 | Pergunta pós-prazo (F5) e regra 7 de 8.3 | só aparece com etapa `participating` e prazo vencido |
| P1.5 | Etapa em monitorados e "Seus próximos prazos" por etapa | contagens batem com a aba correspondente |

### P2 — depois do MVP (decisão do owner)

- Documentos da empresa com validade, para "O que preparar" dizer o que falta sem marcação manual por edital.
- Etapa no `TenderRow` da busca e na tabela de resultados.
- Busca abrindo em "Abertos" por padrão (pendência de `ux-simplification`).

## 15. Decisões abertas para o owner

- **D1.** Manter "Editais salvos" no menu ou renomear (ex.: "Meus editais")? A especificação assume manter.
- **D2.** Incluir "Enviei proposta" já no MVP? Sem ela, a regra 7 e a pergunta pós-prazo somem e "o que acontece
  agora" termina no prazo. Recomendação: incluir.
- **D3.** "Não vou participar" desliga o monitoramento? Recomendação: sim, com Desfazer.
- **D4.** "Para você" no painel: aceitar a filtragem no cliente sobre os 4 prazos mais próximos, ou pedir à API
  um filtro por aderência (contrato novo)?

## 16. O que foi e o que não foi feito nesta onda

- Feito: leitura do código das telas e das revisões citadas; esta especificação.
- Não feito: nenhum código, nenhuma sessão com navegador, nenhuma medição nova, nenhum contrato de API alterado.
  As medidas de layout citadas vêm de `ux-simplification-2026-09-28.md`, `onda3-*` e
  `qualification-checklist-2026-09-27.md`.
