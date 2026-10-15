# Proposta — pré-gerar fichas para editais de alta aderência (não implementado)

Status: **proposta para decisão do owner.** Nada disto está no código. O "alerta inteligente" entregue lê só
dados já armazenados e tem custo de IA zero por alerta; esta proposta é o passo seguinte, se o owner quiser que
mais editais cheguem ao e-mail com as exigências.

## Problema

Os destaques de exigências (cota ME/EPP, visita técnica, garantia de proposta, atestado…) vêm da ficha
(`tender_ai_sheets`). Hoje a ficha só nasce quando alguém abre o edital com acesso. Um edital novo, que acabou de
entrar num alerta, quase nunca tem ficha pronta: o e-mail sai com a aderência e a plataforma, mas sem as
exigências.

## Proposta

1. **Quem entra:** só editais `high` de `profile_new_matches` (no máximo 5 por usuário por dia, já limitados pela
   avaliação de perfil). Busca salva fica de fora no início: o volume é maior e não há sinal de aderência.
2. **Quando:** ao fim de `evaluateProfileAlertNotifications`, enfileirar índice + ficha na lane `batch` da fila
   durável (`ai_jobs`), com o `dedupeKey` atual da ficha (`sheet:{tender}:{indexVersion}:{model}:{prompt}`).
   A avaliação roda logo antes do resumo das 07:00, então a ficha pronta aparece no card do app no mesmo dia e
   no e-mail seguinte que citar o edital. Para chegar já no resumo do dia seria preciso mover a avaliação de
   perfil para depois da coleta das 06:00 (cerca de uma hora de folga) — mudança de agenda que é decisão do owner.
3. **Limites:** flag `SMART_ALERTS_PREGENERATE_SHEETS` (padrão `false`) e teto próprio
   `SMART_ALERTS_PREGENERATE_DAILY` (sugestão: 50 editais/dia), abaixo de `AI_DAILY_SHEET_LIMIT` (500) e
   respeitando `AI_DAILY_BUDGET_USD`: com o orçamento pausado, nada é enfileirado (mesma regra de `fit`).
4. **Sem mudança de esquema.** Usa as tabelas e jobs que já existem; nenhuma migração.

## Custo

- A ficha é cache **global por edital**: o custo cresce com editais distintos, não com usuários. Dez usuários
  com o mesmo edital `high` pagam uma ficha.
- Cada ficha pode exigir indexar os documentos (download, extração e OCR quando o PDF é imagem) e as chamadas do
  Jev da ficha; o resumo OpenAI opcional segue a configuração atual.
- Antes de ligar, medir com dados reais (o owner roda em produção):
  - custo médio de `sheet` (e `sheet_summary`, se ligado) no ledger: `pnpm --filter @workspace/api-server run report:ai-cost`;
  - editais distintos `high` por dia:
    `select date(created_at at time zone 'America/Sao_Paulo') as dia, count(distinct t.id) from notifications n, jsonb_array_elements_text(n.tender_ids) t(id) where n.type = 'profile_new_matches' group by 1 order by 1 desc limit 14;`
  - quantos desses já têm ficha `ready` (o que a pré-geração economizaria de espera).
- Estimativa de teto: custo médio por ficha × min(editais distintos `high`/dia, teto diário).

## Riscos

- Fichas de editais que ninguém abre: custo sem uso. Mitigação: teto baixo e medir cliques no e-mail
  (`/tenders/{id}`) por duas semanas antes de subir o teto.
- Editais sem documento legível terminam com índice `failed`; a política de retentativa atual já limita isso.
- Privacidade: a ficha não leva dado de usuário (cache global), então pré-gerar não muda o que vai ao Jev.

## Recomendação

Ligar primeiro em produção com `SMART_ALERTS_PREGENERATE_DAILY=50`, só para `high` de perfil, e decidir a
expansão (busca salva, teto maior, mudança de horário) com os números do ledger depois de duas semanas.
