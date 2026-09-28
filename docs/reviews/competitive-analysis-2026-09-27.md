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

## Adendo — nomes parecidos com "LicitAI" e preço do Licitei (27 set 2026, noite)

Motivo: busca de marca do owner apontou vários "LicitaAI" no mesmo segmento. Conferido nos sites (ou em busca,
quando o site só carrega por JavaScript):

| Produto | Vende para | Preço público | Observação |
|---|---|---|---|
| LICITAI (`licitai.lovable.app`) | empresas licitantes | R$ 199 / 399 / 899 por mês (10 / 50 / ilimitadas licitações) | 14 dias grátis; diz ter "500+ empresas", mas roda num subdomínio do Lovable com logos de exemplo — tratar como não verificado |
| LicitaIA (`licitaia.app`, Clareou Soluções Digitais) | empresas licitantes | R$ 297/mês (1 usuário); R$ 2.970/ano; Multi+ R$ 579/mês (2 usuários) | gera propostas e documentos, planilha de custos, pesquisa de preços, alertas e radar por WhatsApp, kanban, raio-X de concorrentes |
| Portal Licita.ia (`portallicitaia.com.br`) | empresas licitantes | não publicado (teste grátis) | análise de edital, histórico de pagamento do órgão, preços, concorrentes |
| **Licitei** (`licitei.com.br/planos`) | empresas licitantes | **Busca R$ 101/mês (R$ 1.031/ano ≈ R$ 86/mês); Premium R$ 393/mês; Multiempresas 3 R$ 1.179/mês** | 7 dias grátis. Busca já inclui consulta ao edital com IA, gestão de documentos de habilitação, alertas diários e gerador de declarações/propostas. Premium: robô de lances, monitoramento de chat, concorrentes. (Na análise da manhã o preço não estava publicado.) |
| Licita IA (`licitaia.com.br`, Y2TI) | **órgãos públicos** | não publicado | "não atendemos fornecedores privados licitantes" — não é concorrente direto |
| LICITA.AI (`licitaaidigital.com.br`) | **órgãos públicos** | não publicado (sob solicitação) | cotação de preços/CATMAT para setores de compras |
| LiciteAI (`liciteai.com.br`) | órgãos **e** fornecedores | não publicado | portal de licitação (publicação, sessão, recursos) com IA; outro modelo de negócio |
| LicitAI (`licitai.org`) | — | — | DNS não resolve em 27 set 2026 |

Além desses, a busca mostrou `licitaia.pro`, `licitai.mbest.site` e um "LicitAI – Busca Inteligente de
Licitações" (`licitaieditais.com.br`, DNS não resolve). Domínios `licitai.com.br` e `licitaia.com.br`
pertencem a terceiros; `licitai.com` existe desde 2024. Conclusão para a marca: o espaço "Licita + IA" está
saturado; trocar o nome antes do beta.

**Posição de preço de quem vende para empresas licitantes:** Acumi R$ 49 (1 análise/mês) · **LicitAI R$ 49,90
sem teto de análises** · ContrataX R$ 59–149 · Licitei Busca R$ 86–101 · LICITAI R$ 199 · LicitaIA R$ 297 ·
Licitei Premium R$ 393 · Siga Pregão R$ 397–497.

**O que os concorrentes diretos têm e nós não:** gerador de declarações/propostas (Licitei Busca, LICITAI,
LicitaIA), gestão de documentos de habilitação com alerta de vencimento (Licitei, LiciteAI), WhatsApp
(LicitaIA), pesquisa/histórico de preços (LicitaIA, Portal Licita.ia), concorrentes, robô de lances (Licitei
Premium). Nosso checklist lista o que o edital **exige**; ainda não diz o que **falta** à empresa — isso
precisa da gestão de documentos com validade.

### licitaia.pro e "LicitAI Editais" (28 set 2026)

- **`licitaia.pro` (LICITA.IA)**: fora do ar (sem DNS em nenhum resolvedor; sem registro no whois). Pela cópia do
  Internet Archive de 14 fev 2026 ("v2.0 Expandida", página única de ~11 KB): produto do lado **comprador**, para
  estatais (Lei 13.303/2016) e administração direta (Lei 14.133/2021). O usuário escolhe o regime jurídico,
  preenche um formulário (tipo de licitação, objeto, valor estimado, prazo) e clica "Gerar Análise IA", que devolve
  uma "análise jurídica automatizada" gerada, mais banco de jurisprudência e modelos de documento. Sem busca de
  editais, sem dados do PNCP, sem alertas, sem preço publicado; link "Admin" exposto na página pública; alega
  "validação jurídica por especialistas" e "auditoria de segurança" sem evidência. Aparência de protótipo. Não
  compete pelo nosso cliente (empresa licitante).
- **`licitaieditais.com.br` ("LicitAI – Busca Inteligente de Licitações", "a partir de R$ 39,90/mês" segundo a
  busca)**: domínio criado em 07 set 2025 e **expirado em 07 set 2026**; sem DNS. Não verificável e, ao que tudo
  indica, descontinuado.
