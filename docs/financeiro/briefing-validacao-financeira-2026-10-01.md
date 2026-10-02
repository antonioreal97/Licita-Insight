# LicitAI | Briefing de validação financeira

**Data-base:** 1º de outubro de 2026. **Moeda:** reais por mês, salvo indicação contrária. **Status:** modelo de pré-validação, sem histórico comercial comprovado.

## 1. Decisão e conclusão

O objetivo é dimensionar quantos assinantes pagantes sustentam o LicitAI no Render, quanto pode sobrar e quanto capital seria necessário durante a aquisição dos primeiros clientes.

Com mensalidade provisória de **R$ 49,90**, a margem de contribuição estimada é **R$ 37,94499 por assinatura**, ou **76,04%**. Esse valor paga as despesas fixas; não é lucro líquido.

| Marco | Pagantes mensais necessários |
|---|---:|
| Cobrir somente a provisão de Render, já descontados os custos variáveis | 9 |
| Cobrir a operação básica, sem aquisição e sem remuneração do fundador | 22 |
| Cobrir operação e aquisição, sem remuneração do fundador | 37 |
| Cobrir operação, aquisição e R$ 3.000 de remuneração do fundador | **116** |
| Além de tudo acima, sobrar R$ 1.000 | **143** |
| Além de tudo acima, sobrar R$ 3.000 | **196** |
| Além de tudo acima, sobrar R$ 5.000 | **248** |

O número anterior de aproximadamente oito clientes respondia a uma conta simplificada de hospedagem e consumo. Não representava a empresa inteira. Este briefing acrescenta despesas administrativas, IA compartilhada, aquisição e remuneração, e substitui aquela simplificação para planejamento.

**Recomendação provisória:** validar uma primeira turma de 20 a 30 pagantes, medir três ciclos de cobrança e testar disposição a pagar R$ 79,90. Não há evidência ainda de que o preço maior manterá conversão e retenção. Não assumir que a retirada de R$ 3.000 poderá começar no primeiro mês sem capital externo à operação.

## 2. O que é conhecido e o que é hipótese

| Entrada | Evidência ou premissa | Situação |
|---|---|---|
| Mensalidade de R$ 49,90 | Exemplo comentado em `.env.example` | Não confirmada como preço comercial |
| Banco PostgreSQL, cobrança Asaas e coleta em segundo plano | Código e contratos locais | Arquitetura confirmada; desempenho em produção não medido |
| Preços de infraestrutura | Tabela pública do Render | Referência consultada; contratação não realizada |
| Taxas de cobrança | Página pública do Asaas | Confirmar condições específicas da conta |
| Dólar a R$ 5,50 | Mesmo câmbio ilustrativo da conversa | Não é cotação de mercado |
| Provisão tributária de 6% | Hipótese de modelagem | Não determina enquadramento, anexo ou alíquota efetiva |
| IA de R$ 5 por pagante e R$ 150 compartilhados | Verbas de planejamento | Não são custos observados nem limites implementados |
| Aquisição, cancelamento, conversão e remuneração | Cenários apresentados abaixo | Não são métricas históricas do LicitAI |

Não foram consultadas faturas reais, vendas, clientes, extratos, custos reais de modelos de IA nem dados de uso em produção. O número de editais no banco não comprova demanda ou disposição a pagar. A análise usa preços públicos, comportamento documentado do projeto e hipóteses explícitas.

**Unidade econômica:** uma assinatura mensal efetivamente paga, antes da provisão de estornos. Cadastro, acesso gratuito, teste e acesso concedido sem cobrança não contam como pagantes. Uma assinatura não é necessariamente uma empresa ou um assento adicional: o modelo pressupõe uma cobrança por conta.

## 3. Infraestrutura e despesas fixas

### Render

| Componente | Configuração de referência | USD/mês |
|---|---|---:|
| Interface e API | 1 CPU, 2 GB | 25,00 |
| Worker de coletas | 0,5 CPU, 512 MB | 7,00 |
| PostgreSQL | 0,5 CPU, 1 GB | 19,00 |
| Armazenamento PostgreSQL | Hipótese de 10 GB a US$ 0,30/GB | 3,00 |
| Workspace Hobby | Um responsável | 0,00 |
| **Total de referência** | | **54,00** |

Fonte: [preços Render](https://render.com/pricing), consultados em 01/10/2026. A capacidade e o armazenamento escolhidos precisam de medição, especialmente durante as coletas. Um worker de 512 MB não foi validado para essa carga.

Conversão de planejamento: US$ 54 × R$ 5,50 = **R$ 297,00**. Acrescentando reserva genérica de 10% para variação cambial e custos de pagamento internacional: **R$ 326,70**, arredondados para **R$ 330/mês**. Essa reserva não é uma alíquota tributária. Tráfego excedente, builds e aumento de capacidade são adicionais possíveis.

### Orçamento mensal completo

| Despesa | BRL/mês | Natureza |
|---|---:|---|
| Render, com reserva cambial | 330,00 | Estimativa acima |
| Domínio | 10,00 | Provisão anualizada; não é cotação |
| E-mail operacional, monitoramento e ferramentas | 60,00 | Verba agregada; provedores ainda não cotados |
| IA compartilhada e testes gratuitos | 150,00 | Envelope provisório; pode crescer com uso |
| Contabilidade e administração | 250,00 | Hipótese; solicitar proposta |
| **Operação básica** | **800,00** | Sem fundador e sem aquisição |
| Aquisição de clientes | 600,00 | Mídia e ações comerciais em dinheiro |
| **Operação com aquisição** | **1.400,00** | Sem fundador |
| Remuneração total do fundador | 3.000,00 | Custo total para a empresa, não líquido pessoal garantido |
| **Orçamento completo** | **4.400,00** | Base dos cenários de resultado |

Se os R$ 3.000 forem a retirada líquida desejada, encargos e tributos pessoais podem exigir um custo empresarial maior. Não foi incluída contratação adicional. Desenvolvimento, suporte e vendas feitos pelo fundador devem caber no tempo remunerado por essa verba.

## 4. Custo por assinatura e margem

Hipótese de recebimento: 100% das assinaturas mensais no cartão, uma cobrança por ciclo, sem antecipação. Para planejamento, foi usada a tarifa pública não promocional de **2,99% + R$ 0,49**. A mesma página exibe valores promocionais e um FAQ com percentual diferente; a taxa contratual da conta é a fonte final. Também provisionamos R$ 0,99 para pacote de notificações e R$ 0,49 para nota, somente como hipótese de uso desses serviços. [Preços Asaas](https://www.asaas.com/precos-e-taxas).

| Item por pagante/mês | Cálculo | BRL aproximado |
|---|---|---:|
| Receita bruta | Mensalidade | 49,90 |
| Recebimento no cartão | 49,90 × 2,99% + 0,49 | -1,98 |
| Notificação de cobrança | Provisão por cobrança | -0,99 |
| Emissão de nota fiscal | Provisão por nota | -0,49 |
| Tributos sobre faturamento | Hipótese de 6% | -2,99 |
| Estornos e perdas posteriores ao pagamento | Reserva de 1% | -0,50 |
| IA atribuída ao pagante | Hipótese média | -5,00 |
| **Margem de contribuição** | Valor sem arredondamento: 37,94499 | **37,94** |

Os valores individuais são exibidos com dois decimais; a soma das linhas arredondadas pode diferir em um centavo. Todas as projeções usam precisão integral antes da apresentação.

Não há desconto duplicado de inadimplência: mensalidades não pagas já ficam fora da quantidade de pagantes. A reserva de 1% representa perdas depois de um pagamento, sem constituir uma apuração fiscal de estornos. O custo de IA considera todos os pagantes, inclusive quem não usa IA naquele mês, e deve ser recalibrado pela média da base paga completa.

**Fórmulas:**

```text
P = mensalidade
MC = P × (1 - 0,0299 - 0,06 - 0,01) - 0,49 - 0,99 - 0,49 - 5
MC = 0,9001 × P - 6,97
Resultado mensal = pagantes × MC - custos fixos
Pagantes necessários = arredondar para cima((custos fixos + resultado desejado) / MC)
```

Tributos são uma provisão, não uma orientação de enquadramento. Confirmar com a contabilidade regime, faturamento acumulado, atividade, folha e custos da remuneração. Os resultados abaixo são gerenciais estimados depois das provisões, não lucro contábil auditado.

## 5. Resultado mensal por tamanho da base

Preço de R$ 49,90, custos fixos de R$ 4.400 e consumo médio de IA de R$ 5. Sem descontos comerciais e sem aumento de capacidade.

| Pagantes | Receita bruta | Custos variáveis | Margem total | Resultado antes do fundador¹ | Resultado após fundador |
|---:|---:|---:|---:|---:|---:|
| 10 | 499,00 | 119,55 | 379,45 | -1.020,55 | -4.020,55 |
| 25 | 1.247,50 | 298,88 | 948,62 | -451,38 | -3.451,38 |
| 50 | 2.495,00 | 597,75 | 1.897,25 | 497,25 | -2.502,75 |
| 100 | 4.990,00 | 1.195,50 | 3.794,50 | 2.394,50 | -605,50 |
| 116 | 5.788,40 | 1.386,78 | 4.401,62 | 3.001,62 | **1,62** |
| 150 | 7.485,00 | 1.793,25 | 5.691,75 | 4.291,75 | **1.291,75** |
| 200 | 9.980,00 | 2.391,00 | 7.589,00 | 6.189,00 | **3.189,00** |
| 250 | 12.475,00 | 2.988,75 | 9.486,25 | 8.086,25 | **5.086,25** |

¹ Já desconta R$ 1.400 de operação e aquisição. Não representa ganho pessoal livre de encargos.

O equilíbrio em 116 tem apenas R$ 1,62 de folga. Portanto, é uma fronteira aritmética, não uma meta confortável. As linhas de 150 a 250 não prometem que a infraestrutura inicial suportará esse uso; são cenários mantendo os custos fixos constantes.

## 6. Efeito do preço

Mesmos custos e consumo por pagante; conversão e retenção iguais apenas para isolar a matemática.

| Mensalidade | Margem por pagante | Empatar | Sobrar R$ 1.000 | Sobrar R$ 3.000 | Sobrar R$ 5.000 |
|---:|---:|---:|---:|---:|---:|
| R$ 49,90 | R$ 37,94 | 116 | 143 | 196 | 248 |
| R$ 79,90 | R$ 64,95 | 68 | 84 | 114 | 145 |
| R$ 99,90 | R$ 82,95 | 54 | 66 | 90 | 114 |

Aumentar preço pode reduzir conversão ou elevar expectativas de suporte. Validar com ofertas reais em públicos comparáveis, acompanhando renovação; uma pesquisa de intenção não substitui pagamento.

Com 100 pagantes e este orçamento, o preço de equilíbrio seria aproximadamente **R$ 56,63**. A R$ 49,90, seria necessário reduzir despesas, ampliar a base ou diminuir custos variáveis. Esse preço de equilíbrio não inclui uma margem desejada nem valida aceitação comercial.

## 7. IA, carga gratuita e sensibilidade

O contrato local separa `ask` e `fit`, atribuídos ao usuário, de `sheet`, custo compartilhado da plataforma. Há também testes e acessos gratuitos. Por isso o modelo usa **R$ 5 por pagante + R$ 150 compartilhados**, evitando atribuir todo custo apenas a quem paga.

O `AI_DAILY_BUDGET_USD` tem padrão de US$ 10. US$ 10 × 30 dias × R$ 5,50 = **R$ 1.650/mês**, sem custos cambiais. Isso é uma simulação de consumo, não despesa observada ou teto rígido: o mecanismo pausa o lote de `fit`, mas perguntas e fichas continuam. Não somar esse valor à provisão-base de IA; ele ilustra um cenário alternativo de consumo total.

| IA individual média por pagante | Margem por pagante | Pagantes para cobrir R$ 4.400 |
|---:|---:|---:|
| R$ 2 | R$ 40,94 | 108 |
| R$ 5 | R$ 37,94 | 116 |
| R$ 15 | R$ 27,94 | 158 |
| R$ 25 | R$ 17,94 | 246 |

Outras variações isoladas: provisão tributária de 10% leva o equilíbrio a **123 pagantes**; 15,5% leva a **133**. São testes de sensibilidade, não classificações fiscais. Aumento fixo de infraestrutura de R$ 100, R$ 300 ou R$ 600 leva a **119, 124 ou 132 pagantes**, respectivamente.

A reserva compartilhada de R$ 150 não é realmente fixa por natureza: mais testes, fichas, documentos e visitantes podem elevá-la. Usuários públicos também consomem banco e tráfego. Medir custos por recurso, média por pagante, p90/p99 entre usuários de IA, consumo de não pagantes e custo compartilhado total. Comparar o ledger local com a fatura do provedor para capturar chamadas com falha, retries e despesas não registradas.

## 8. Aquisição e cancelamentos

**CAC de caixa** = gastos de aquisição / novos clientes que efetivamente pagaram. O orçamento de R$ 600 já está nos custos fixos: não descontar CAC novamente na tabela de resultado. Horas comerciais do fundador estão na remuneração, mas devem ser medidas separadamente para calcular CAC econômico por canal.

| CAC de caixa hipotético | Novos pagantes/mês com R$ 600 | Retorno simples do CAC² | Base-limite com 5% de cancelamento mensal³ |
|---:|---:|---:|---:|
| R$ 60 | 10 | 1,58 mês | 200 |
| R$ 100 | 6 | 2,64 meses | 120 |
| R$ 150 | 4 | 3,95 meses | 80 |
| R$ 250 | 2,4 | 6,59 meses | 48 |

² CAC / margem mensal, sem atraso de recebimento e sem ajuste por cancelamento antes do retorno. ³ Novos por mês / churn, mantendo taxas constantes; limite teórico aproximado ao longo do tempo, não uma meta atingida imediatamente. Não há comprovação de CAC ou churn.

Com 116 pagantes, churn de 5% e CAC de R$ 100, a reposição de aproximadamente 5,8 clientes custa **R$ 580/mês**. Quase toda a verba de R$ 600 seria consumida só para manter a base. Para crescer dez clientes líquidos seriam necessários aproximadamente 15,8 novos, ou **R$ 1.580/mês** nesse CAC. Nesse caso, recalcular os custos fixos: o crescimento não cabe no orçamento original.

O LTV de contribuição simplificado é MC / churn: a 5%, **R$ 758,90**; a 10%, **R$ 379,45**. Ele pressupõe cancelamento constante e uma vida útil geométrica, sem desconto financeiro e sem custos fixos. Não usar como previsão de lucro ou justificativa para gastar antes de observar coortes.

Para sustentar 116 com R$ 600 e churn de 5%, o CAC de caixa precisa ficar próximo ou abaixo de **R$ 103,45**. Para recuperar CAC em três meses de margem, o teto aritmético seria **R$ 113,83**. Ambos são limites do modelo, não benchmarks do mercado.

Funil ilustrativo: para obter dez novos pagantes com conversão cadastro→primeiro pagamento de 5%, seriam necessários 200 cadastros qualificados por mês. A 2%, seriam 500; a 10%, 100. Não confundir essas taxas com visita→pagamento nem com percentual pagante da base total.

## 9. Simulação de crescimento e caixa

Premissas: base inicial zero; dez novos pagantes por mês; churn de 5% aplicado à base do mês anterior; R$ 600 de aquisição, equivalente a CAC de R$ 60; mensalidade cheia no mês de entrada; orçamento completo desde o primeiro mês. Sem reajustes e sem aumento de infraestrutura. Quantidades fracionárias são expectativas matemáticas, não pessoas medidas.

```text
Pagantes no mês t = pagantes no mês t-1 × 0,95 + 10
Resultado no mês t = pagantes no mês t × 37,94499 - 4.400
```

| Mês | Pagantes esperados | Receita bruta | Resultado após fundador | Resultado acumulado |
|---:|---:|---:|---:|---:|
| 1 | 10,00 | 499,00 | -4.020,55 | -4.020,55 |
| 2 | 19,50 | 973,05 | -3.660,07 | -7.680,62 |
| 3 | 28,53 | 1.423,40 | -3.317,62 | -10.998,24 |
| 4 | 37,10 | 1.851,23 | -2.992,29 | -13.990,53 |
| 5 | 45,24 | 2.257,67 | -2.683,22 | -16.673,75 |
| 6 | 52,98 | 2.643,78 | -2.389,61 | -19.063,37 |
| 7 | 60,33 | 3.010,59 | -2.110,68 | -21.174,05 |
| 8 | 67,32 | 3.359,06 | -1.845,70 | -23.019,75 |
| 9 | 73,95 | 3.690,11 | -1.593,96 | -24.613,71 |
| 10 | 80,25 | 4.004,61 | -1.354,82 | -25.968,53 |
| 11 | 86,24 | 4.303,38 | -1.127,62 | -27.096,15 |
| 12 | 91,93 | 4.587,21 | -911,79 | **-28.007,95** |

O primeiro mês com resultado não negativo seria o **mês 17**, com cerca de 116,38 pagantes esperados. Isso não recupera o prejuízo acumulado. A receita bruta nos primeiros 12 meses seria **R$ 32.603,09**, contra resultado de **-R$ 28.007,95** após fundador. Sem a remuneração desde o início, o mesmo cenário produziria resultado anual de **R$ 7.992,05**, mas o trabalho do fundador continuaria existindo e precisaria ser financiado pessoalmente.

### Capital de giro

Foi simulado recebimento com atraso de um ciclo mensal, como aproximação de D+32, e desembolso de IA e custos fixos no mês corrente. Taxas, tributos, notificações, nota e reserva de perdas ficam segregados da receita quando ela é recebida. O fluxo diário e as datas reais de impostos podem exigir mais capital. Antecipação não está incluída.

Com **R$ 1.500 de implantação hipotética**, o maior déficit de caixa dentro dos primeiros 12 meses seria **R$ 33.455,79**. Com colchão de 20%: **R$ 40.146,95**, arredondando o orçamento de capital para **R$ 40,2 mil**. Isso cobre apenas esse horizonte simulado, não garante chegar ao equilíbrio ou sustentar crescimento posterior.

Sem retirada do fundador durante todo o período, o maior déficit nos mesmos 12 meses seria aproximadamente **R$ 5.116,75**; com 20%, cerca de **R$ 6.140,10**. Esse cenário exclui o custo de vida do fundador e não pode ser tratado como negócio economicamente autossuficiente.

A implantação de R$ 1.500 é apenas uma verba inicial para planejamento. Não inclui recuperação do investimento histórico em desenvolvimento, contratação de equipe, aquisição de equipamentos ou um orçamento jurídico detalhado. Domínio anual e outros pagamentos antecipados devem entrar no fluxo real na data de vencimento.

## 10. Plano de validação

| Questão | Evidência a levantar | Critério provisório para decidir |
|---|---|---|
| O público paga? | 20 a 30 clientes com primeiro pagamento real; separar descontos e gratuidades | Não contar intenção como venda |
| O público renova? | Coortes por mês do primeiro pagamento, observadas por pelo menos três ciclos | Comparar churn com cenários de 3%, 5% e 10%; não generalizar coorte pequena |
| O custo de IA cabe? | Ledger e fatura conciliados; separar pago, teste e plataforma | Média por pagante próxima de R$ 5; compartilhado dentro do envelope ou preço revisto |
| A aquisição é sustentável? | Gasto por canal / novos pagantes, incluindo esforço do fundador à parte | CAC de caixa compatível com orçamento de reposição e crescimento |
| O preço maior funciona? | Ofertas de R$ 49,90 e R$ 79,90 em grupos comparáveis | Comparar margem por prospect e retenção, não só conversão |
| A infraestrutura aguenta? | CPU, memória, latência, tamanho do banco e custos durante coleta | Redimensionar antes de assumir atendimento a 150+ pagantes |
| Há margem após suporte? | Minutos por cliente e horas totais por mês | Fundador consegue entregar dentro da remuneração ou incluir contratação |

Exemplo de suporte: dez minutos por pagante/mês em uma base de 116 já representam **19,3 horas mensais**, antes de desenvolvimento e vendas. Esse tempo não é gratuito e não está coberto por uma contratação adicional no orçamento.

Na fase inicial, 20 a 30 pagantes podem validar pagamento e cobrir boa parte da operação básica, mas não remuneram integralmente o fundador. O avanço para aquisição em escala deve depender de renovação, custo de entrega e caixa disponível, não apenas de cadastro ou visita.

## 11. Limitações e critérios de revisão

- Todas as despesas não cotadas são envelopes de planejamento, não propostas comerciais.
- Tributos e remuneração precisam ser fechados com a contabilidade; 6% não é alíquota garantida.
- Preço de R$ 49,90 ainda não foi confirmado pelo usuário como preço comercial.
- Conversão, churn, CAC e uso de IA não têm evidência comercial suficiente nesta análise.
- Manter hospedagem constante é uma hipótese. Público gratuito, base documental, uso de IA e concorrência podem forçar expansão antes dos marcos calculados.
- Não há custo de financiamento, antecipação de recebíveis, equipe adicional nem recuperação do investimento passado em desenvolvimento.
- A provisão de perdas não modela eventos extremos de fraude, estornos ou ressarcimentos.
- Lucro por competência, recebimento de caixa, retirada pessoal e recuperação do investimento são medidas diferentes.

Revisar após o primeiro ciclo de faturamento e, depois, mensalmente: preço recebido, clientes pagos, cancelamentos, impostos reais, tarifas, IA, tempo de suporte e fatura de infraestrutura. Não foi criado agendamento automático.

## 12. Fontes e memória de cálculo

Fontes consultadas em 01/10/2026:

1. [Render: preços](https://render.com/pricing). Valores de computação e armazenamento; página extraída também via índice de busca porque a abertura direta não exibiu a tabela dinâmica.
2. [Render: recursos por plano](https://render.com/docs/platform-features-by-plan). Workspace Hobby sem mensalidade adicional e com um integrante, conforme referência consultada nesta conversa.
3. [Asaas: preços e taxas](https://www.asaas.com/precos-e-taxas). Taxas públicas, período promocional, cobrança de notificações e notas; contrato específico não acessado.
4. [Exemplo de configuração](../../.env.example): mensalidade exemplificativa e orçamento diário de IA.
5. [Contrato de custo de IA](../contracts/ai-cost-v1.md): custos individuais e compartilhados, limites e ressalvas do relatório.
6. [Integração de cobrança](../../artifacts/api-server/src/billing/asaas-client.ts): valor configurável e assinatura mensal.

As contas estão em [memoria-calculo-2026-10-01.ipynb](memoria-calculo-2026-10-01.ipynb), com entradas, fórmulas e saídas. As células foram executadas sequencialmente com Python 3 em contexto limpo; foram verificados os pontos de equilíbrio com N e N-1 clientes e a identidade receita menos despesas. Como o ambiente não tem Jupyter, o notebook não foi executado em kernel Jupyter nem inspecionado em um visualizador de notebooks. A verificação foi numérica e estrutural; ela não valida as premissas de mercado.
