# Análise competitiva — 27 set 2026

Verificação direta nos sites dos concorrentes, antes do deploy. Os números do roadmap original (`docs/roadmap-monetizacao.md`) vinham de um documento de terceiros, nunca conferidos na fonte.

## Preços (fonte pública, na data acima)

| Concorrente | Entrada | Observação |
|---|---|---|
| **Acumi** | **R$ 49/mês** (Essencial, 1 análise de cortesia/mês) | IA com chat citado, campo a campo. Pro R$ 197/mês, 120 análises, 3 pessoas. |
| **Licitei** | não publicado | "IA" com resposta citada por página; "analise editais em 30s". |
| Siga Pregão | R$ 397/mês (fonte: Acumi) **ou** R$ 497/mês (fonte: b2bstack) | As duas fontes divergem; não confirmei no site deles (conteúdo carregado por JS). Nota 4,9/5 no B2B Stack. |
| ConLicitação | não publicado | Site não mostra preço nenhuma das vezes que tentei (nem por busca, nem por acesso direto); é preciso pedir orçamento. O valor de R$ 264/mês usado nas nossas contas anteriores não pôde ser confirmado de forma independente. |
| Effecti | não publicado (calculadora) | Tem plano gratuito ("plano-gratis.effecti.com.br"). IA própria chamada "Aimê". |
| ContrataX | R$ 59–149/mês | Multi-CNPJ mais barato citado no mercado (R$ 51,88–69,70/empresa). |

**LicitAI a R$ 49,90/mês** empata com o Acumi na entrada e fica entre 4x e 8x mais barato que Siga Pregão. Não somos o mais barato do mercado (ContrataX Starter é R$ 59, mas sem IA citada nesse preço); somos o mais barato entre quem tem IA com trecho citado sem limite mensal de análises.

## Achado que muda a estratégia

**A IA com trecho citado NÃO é mais um diferencial exclusivo nosso.** Pelo menos dois concorrentes já entregam a mesma ideia central:

- **Acumi:** "cada campo declara o status: encontrado, não encontrado ou incerto" e "no chat com o edital, cada resposta cita o trecho, e a citação é verificada contra o texto do documento". É quase a descrição literal da nossa Ficha do Edital e do Perguntar ao Edital.
- **Licitei:** "a IA lê o edital e os anexos e responde com citação da página de origem", com checklist automático de habilitação (nossa Onda 3 ainda não tem isso).

A frase do nosso roadmap interno "a Onda 3 é o que tira o LicitAI da comparação por preço" (`docs/roadmap-monetizacao.md`) está desatualizada: hoje competimos por **preço** dentro da categoria "IA com fonte", não por sermos os únicos a ter IA com fonte. Isso não invalida a Onda 3 — só muda a justificativa dela.

**O que continua sendo diferencial**, pelo que a pesquisa não achou em nenhum concorrente:
- Chamadas de fomento cultural/audiovisual (`/oportunidades`) — nenhum concorrente pesquisado cobre isso.
- Busca e detalhe públicos, sem cadastro (Acumi e Licitei não deixam claro se isso existe; Effecti e ConLicitação normalmente pedem CNPJ/cadastro para ver o edital).
- Preço parado em R$ 49,90 sem limite mensal de análises de IA (o Acumi Essencial dá só 1 análise de cortesia por mês nesse preço; o resto é cobrado à parte).

**O que o mercado já oferece e nós não:**
- **Alerta por WhatsApp** (Monitora Licitações e outros citam isso). Hoje só temos sino e e-mail.
- **Checklist de habilitação automático** (Licitei, Acumi). Nossa Ficha lista os campos, mas não gera um checklist "o que falta apresentar".
- **Histórico de preços** (Monitora Licitações).

## Fontes
[Acumi × Siga Pregão](https://acumi.com.br/comparar/siga-pregao) · [Acumi (home)](https://acumi.com.br/) · [Licitei IA](https://www.licitei.com.br/ia) · [Siga Pregão B2B Stack](https://www.b2bstack.com.br/product/siga-pregao/planos-e-precos) · [ConLicitação planos](https://conlicitacao.com.br/planos/) · [Effecti plataforma](https://effecti.com.br/plataforma/) · [ContrataX comparativo](https://www.contratax.com.br/comparativo) (o próprio ContrataX comparando-se; tratar com cautela)

## Não verificado
- Preço real de Siga Pregão e ConLicitação direto no site deles (conteúdo carregado por JavaScript; só fontes de terceiros).
- Se Acumi/Licitei cobrem chamadas culturais, WhatsApp de verdade funciona, ou a qualidade real da IA deles (não testei as ferramentas).

## Auditoria de promessas × ambiente real (mesma data)

Verificação direta do que já foi testado nesta sessão (código e comportamento ao vivo) contra o `.env` real que o Docker usa:

| Promessa | Estado |
|---|---|
| "Sem dados fictícios": sem banco, a busca nunca inventa resultado | **Confirmado.** Nenhum mock/fixture fora dos testes; sem `DATABASE_URL`, a busca responde `503 SEARCH_UNAVAILABLE`. |
| Ficha do edital, Perguntar ao edital, aderência com selo, e-mail com descadastro | **Confirmado ao vivo** com o Jev real, em ciclos anteriores desta sessão (não retestado agora). |
| Login só com Google, sem senha | Código correto; **`GOOGLE_CLIENT_ID`/`SECRET` agora estão no `.env`** (novidade desde o último ciclo). Falta o clique real de login (2FA/consentimento), que só você pode fazer. |
| E-mail de alerta chega de verdade | **`RESEND_API_KEY`/`MAIL_FROM` agora estão no `.env`** (novidade). O envio de teste real não foi disparado nesta auditoria: mandar e-mail é ação que precisa da sua aprovação. |
| Preço de R$ 49,90/mês | **Decidido, mas não aplicado no ambiente**: `BILLING_MONTHLY_BRL` não está no `.env` real (só no `.env.example`, que é o modelo). Continua faltando `ASAAS_API_KEY`. Enquanto isso, o checkout responde `503 BILLING_UNAVAILABLE`. |

## Custo de IA por usuário: números reais medidos (não estimativa)

Do `ai_usage_ledger` acumulado nesta sessão (54 chamadas reais ao Jev, `licita_cycle4`):

| Função | Tokens médios/chamada | Custo/chamada | No teto diário |
|---|---:|---:|---:|
| Perguntar ao edital | 5.183 | US$ 0,00022 | 30/dia → **US$ 0,20/mês** (era estimado US$ 0,34) |
| Aderência (fit) | 879 | US$ 0,0000369 | 1.000/dia → **US$ 1,11/mês** (confirma a estimativa anterior) |
| Ficha (custo da plataforma, não do usuário) | 23.796 | US$ 0,001 | 500/dia → **US$ 15/mês no total**, para todos os usuários |

Os números medidos confirmam a estimativa dada ao owner; a de "Perguntar ao edital" fica ainda mais barata do que o previsto.
