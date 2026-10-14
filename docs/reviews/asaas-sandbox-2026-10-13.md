# Asaas Sandbox — verificações de 13/10/2026

## Confirmado no provedor

- A consulta `GET /v3/payments` devolveu duas cobranças da assinatura sintética com `externalReference: asaas-e2e-20261013`. Ambas apontavam para o mesmo link de pagamento e a mesma assinatura. `GET /v3/paymentLinks/{id}` e `GET /v3/subscriptions/{id}` também devolveram essa referência. Portanto, a referência definida no link chegou às cobranças deste teste.
- Antes da remoção, `GET /v3/subscriptions/{id}` devolveu `200`, `status: ACTIVE` e `deleted: false`. O `DELETE` devolveu `200` e `deleted: true`. Depois, o mesmo `GET` devolveu **`200`, `status: INACTIVE` e `deleted: true`**. Neste caso, assinatura removida não resultou em `404`.
- A regra local de reconciliação já trata `deleted: true` e `INACTIVE` como cancelamento sem estorno, mantendo o período pago.

Essas observações são do sandbox e da assinatura sintética `asaas-e2e-20261013`. Isoladamente, não comprovam o fluxo pelo Pardal Digital; a etapa iniciada pelo site está registrada abaixo.

## Checkout iniciado pelo site

- O login Google na conta de teste indicada pelo dono funcionou em `pardaldigital.com`. O teste gratuito dessa conta já havia terminado.
- O botão **Assinar** em Configurações abriu um link em `sandbox.asaas.com`, com R$ 49,90 por mês e ciclo recorrente mensal.
- Uma consulta de leitura a `GET /v3/paymentLinks/{id}` confirmou que o link estava ativo, tinha `externalReference` no formato de UUID e correspondia ao checkout aberto. Ao recarregar as Configurações, o app mostrou **Continuar pagamento**, evidência de checkout pendente no estado local.
- O checkout ficou com Pix selecionado. O dono clicou em **COMPRAR**, que abriu o formulário de dados do comprador; essa ação ainda não criou cobrança (`GET /v3/payments?externalReference=...` devolveu zero). Por orientação do dono, o formulário foi preenchido com dados fictícios e **GERAR PIX** criou uma cobrança `PIX` de R$ 49,90, vinculada ao link e à assinatura, com a mesma `externalReference` do link.
- A operação oficial de confirmação exclusiva do sandbox (`POST /v3/sandbox/payment/{id}/confirm`) respondeu `200` e marcou a cobrança como `RECEIVED`. O webhook `PAYMENT_RECEIVED` foi entregue a `https://pardaldigital.com/api/v1/billing/asaas/webhook`, recebeu HTTP `200` e respondeu `{ "received": true }`. Depois de atualizar Configurações, o app mostrou assinatura ativa até 13/11/2026.
- O mesmo evento foi reenviado pelo painel do Asaas. Houve uma segunda entrega HTTP `200`, com o mesmo ID do evento e da cobrança; a data final exibida no app permaneceu 13/11/2026. Isso confirma a idempotência observável do reenvio nesse fluxo.
- Uma consulta ao carnê da assinatura criou cobranças futuras com vencimento em 13/11 e 13/12; o `nextDueDate` da assinatura avançou para 13/01. Não repetir essa consulta durante este ensaio. Esse estado revelou que o webhook local usava apenas `nextDueDate` e poderia conceder dois meses a uma única cobrança paga. O cálculo do webhook foi corrigido no código local para usar o vencimento da cobrança seguinte, como a reconciliação já fazia. A correção ainda não foi publicada no site.
- Após a correção, os 38 testes direcionados de cliente Asaas, acesso, webhook e reconciliação passaram, bem como a checagem de tipos da API após regenerar os pacotes internos locais.

## Pendente para homologação ponta a ponta

- Simular perda de webhook e executar reconciliação manual em banco local isolado, primeiro com `--dry-run` e depois efetiva. O webhook do sandbox aponta para `https://pardaldigital.com/api/v1/billing/asaas/webhook` e permanecerá ativo durante o ensaio local.
- Validar inadimplência e reembolso, conferindo o estado da conta de teste e restaurando seu acesso ao fim.
- Transação controlada em produção: depende da chave de produção do Asaas e de autorização operacional específica.
- Ensaio do corte no servidor: aguarda o SQL definitivo e a ferramenta de corte da unidade G, conforme o plano da Fase 1.

O Docker local oscilou entre erro 500, falta de permissão no socket e chamadas sem resposta. Por isso, ainda não há banco local isolado para executar a reconciliação manual. A configuração atual do webhook é global para a conta sandbox e aponta ao site público; desativá-lo agora poderia afetar outros eventos.
