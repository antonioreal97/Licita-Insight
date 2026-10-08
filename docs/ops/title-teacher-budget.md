# Operação do professor de títulos OpenAI

## Orçamento e teto diário

O professor tem um disjuntor próprio: `TITLE_OPENAI_BUDGET_USD=1` por uma janela móvel de `TITLE_OPENAI_BUDGET_DAYS=3` dias. A leitura soma `ai_title_usage.estimated_cost_usd` desde `agora - 3 × 24h`; ao atingir US$ 1, o worker deixa de reivindicar jobs OpenAI. Isso não altera `AI_DAILY_BUDGET_USD`, reservado aos fluxos de resumo e fit.

`TITLE_OPENAI_DAILY_LIMIT` continua sendo um segundo limite. Ele é aplicado no claim e cada job recebe `payload.titleQuotaDay` no calendário de `America/Sao_Paulo`. Retry no mesmo dia conserva a reserva; um job que não coube fica `queued` e ganha uma nova reserva em um dia posterior. O claim usa lock transacional, portanto réplicas não ultrapassam a quantidade diária por corrida.

Na configuração de produção definida pelo owner, usar `TITLE_OPENAI_DAILY_LIMIT=7500`; o padrão de código permanece 5000 para instalações novas.

## Fila e prioridade

Editais novos ou com título oficial alterado sempre ganham um job durável, mesmo depois de esgotados o teto ou o orçamento. O limite de profundidade geral não descarta esses jobs. A chave `title_rewrite:<edital>:p<versão>:<hash>` mantém o fluxo idempotente.

A ordem do professor pago é:

1. editais `open` antes dos demais;
2. menor `proposal_deadline` primeiro;
3. publicação mais antiga primeiro;
4. criação do job e id como desempate.

## Backfill contínuo

Com `TITLE_BACKFILL_ENABLED=true` (padrão), o worker usa a capacidade diária restante para enfileirar, em lotes de `TITLE_BACKFILL_BATCH_SIZE=50`, editais `open` ainda com `display_title_source='rules'`. Linhas sem categoria vêm antes das demais. O ciclo roda no máximo uma vez a cada `TITLE_BACKFILL_INTERVAL_MS=300000` e não roda entre 06:00 e 06:59 em São Paulo, hora reservada à coleta PNCP. Se já houver fila paga suficiente para a capacidade diária, nenhuma consulta de lote é criada.

## Categoria de reserva

`src/titles/category-rules.ts` aplica palavras-chave somente ao título oficial normalizado e só pode emitir slugs de `TENDER_CATEGORIES`, a mesma taxonomia aceita pelo professor. A coleta grava a categoria como `category_source='rules'` quando a linha ainda não tem categoria. Uma categoria `teacher` nunca é substituída; a OpenAI pode substituir `rules` por `teacher` mais tarde.

Para preencher uma vez as linhas antigas sem categoria:

```sh
pnpm --filter @workspace/api-server run categorize:rules
```

O script percorre por id, em lotes configuráveis por `TITLE_RULES_BACKFILL_BATCH_SIZE` (padrão 500), atualiza também `search_text`, ignora `teacher` e imprime `scanned`, `categorized` e `coverage`.

## Medição das regras

Medição em 08/10/2026, antes de qualquer escrita, sobre o snapshot local de 146.269 editais:

- amostra determinística de 10.000 editais `open`, ordenada por `md5(id)`: 5.275 receberam ao menos uma categoria, cobertura de **52,75%**;
- 3.540 exemplos existentes rotulados pelo professor: as regras cobriram 1.886 (**53,28%**);
- entre os 1.886 exemplos comparáveis, ao menos uma categoria coincidiu em **80,70%** e o conjunto completo coincidiu em **62,41%**.

A concordância é condicional aos casos em que as regras conservadoras produziram categoria; `outros` não tem palavra-chave deliberadamente. Repetir a medição após mudanças na lista e registrar o tamanho da amostra, porque cobertura e concordância dependem do acervo.
