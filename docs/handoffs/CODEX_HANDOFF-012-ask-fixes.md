```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-012

Feature: Onda 3, fatia 1 — correções do QA de integração (docs/reviews/onda3-ask-qa.md)

Priority: P0 (itens 1 e 2 deixam o recurso inoperante no Docker). Branch: antonioreal97/cycle4.
Sem mudança de contrato público. O frontend já está integrado e não muda.

1. P0 — pdf.worker fora do bundle
   No caminho do Docker (build.mjs → dist/index.mjs) toda extração de PDF falha:
     Setting up fake worker failed: "Cannot find module '.../api-server/dist/pdf.worker.mjs'"
   Os testes e o smoke rodaram via tsx (src/), onde o worker resolve. Reproduz com
   `pnpm --filter @workspace/api-server run dev` + GET ask-status de um edital com PDF.
   Opções: externalizar pdfjs-dist no esbuild, ou copiar o worker para dist/ e apontar
   GlobalWorkerOptions.workerSrc. Também aparecem avisos de @napi-rs/canvas/DOMMatrix no boot.
   Critério: teste ou script que extrai um PDF pelo dist/ buildado (não só por tsx).

2. P0 — search_vector nulo com push-force
   0005_ask_tender.sql cria search_vector como GENERATED ALWAYS AS (to_tsvector('portuguese', text)),
   mas lib/db/src/schema/ai.ts declara uma coluna comum. push-force (db-setup do Compose e o caminho
   definido no HANDOFF-010 para banco vazio) cria coluna nula → shortlist vazia → todo ask vira
   not_found sem chamar o Jev. Visto no licita_cycle4: 352/352 trechos com search_vector nulo.
   Corrigir no schema Drizzle (generatedAlwaysAs) e garantir que push-force num banco que já tem a
   coluna gerada (via migrate) não tente recriá-la. Critério: teste que roda push-force num banco vazio
   e verifica is_generated = 'ALWAYS' e shortlist não vazia.

3. P1 — índice preso em 'unsupported' quando a extração falha
   Com os PDFs em 'failed' e os ZIPs em 'unsupported', o índice ficou 'unsupported', que não é
   retentado. Mesmo depois de corrigir o item 1, esse edital não volta sozinho. Regra sugerida:
   'unsupported' só quando todos os documentos legíveis são sem texto; qualquer 'failed' → índice
   'failed' (retentável). Incluir um caminho de reprocessamento para índices já gravados assim.

4. P1 — texto das ligaduras
   A remoção do U+FFFD deixou "par cipação", "admi da", "compa vel" (era "ti"); o NFKC ou a junção dos
   itens do pdfjs deixou "de fi nição", "fi cará", "o fi cial", "h ps://" ("tt"). Isso degrada o
   tsvector ("participação" não casa) e aparece para o usuário no trecho citado.
   - Juntar os itens de texto pela posição (hasEOL / distância horizontal), sem espaço fixo entre itens.
   - U+FFFD entre letras: nas fontes do SEI é a ligadura "ti"; medir no corpus e repor "ti"
     quando a palavra resultante existir no dicionário do tsvector (ts_lexize) ou, no mínimo, entre
     letras minúsculas.
   Critério: fixture com o EDITAL_PGE_26000415_AM.pdf (ou trecho) produzindo "participação",
   "admitida", "definição", "https://".

5. P2 — corte relativo dos trechos
   "Pode participar em consórcio?" devolveu 97% (4.3, a resposta), 70% (assinatura/cooperativas do
   Aviso, ruído) e 57%. A UI já separa o melhor trecho dos demais. Avaliar com a calibração se um corte
   relativo (ex.: descartar abaixo de melhor − 0,25) reduz ruído sem perder respostas; não mudar o
   limiar absoluto sem dados.

Processo: commite só seus paths (`git commit -- <paths>`).
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-012-ask-fixes.md
```
