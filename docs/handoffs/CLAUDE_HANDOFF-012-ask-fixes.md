# CLAUDE_HANDOFF

**ID:** CLAUDE_HANDOFF-012

**Feature:** Onda 3, fatia 1 — correções do QA de integração do “Perguntar ao edital”

**Status:** READY_FOR_CLAUDE

**Contrato:** sem alteração pública. Frontend e rotas permanecem compatíveis com [`docs/contracts/ai-v1.md`](../contracts/ai-v1.md).

## Correções

### P0 — extração de PDF no bundle

- `pdfjs-dist/*` agora fica externo ao bundle da API, permitindo que o próprio pacote resolva seus módulos e worker em runtime.
- O build expõe também `dist/document-extractor.mjs` para uma verificação executável da mesma configuração usada pelo bundle.
- `pnpm --filter @workspace/api-server run test:dist-pdf` builda a API e extrai um PDF pelo artefato em `dist/`.
- Confirmado no `dist/index.mjs`: o import permanece `pdfjs-dist/legacy/build/pdf.mjs`; não há referência relativa a `dist/pdf.worker.mjs`.

### P0 — `search_vector` no `push-force`

- O schema Drizzle declara `search_vector` como `GENERATED ALWAYS AS (to_tsvector('portuguese', text))`.
- `pnpm --filter @workspace/db run verify:ai-push` cria um banco descartável, executa `push --force` duas vezes, verifica `is_generated = 'ALWAYS'` e comprova uma shortlist em português.
- O `db-setup` do Compose aplicou o schema sobre o banco existente sem tentar recriar a coluna gerada.

### P1 — retry de índices

- Qualquer documento com extração `failed` deixa o índice em `failed`, mesmo quando há documentos `ready`; assim o índice continua retentável.
- `unsupported` fica reservado ao caso em que nenhum documento falhou e todos os documentos processáveis ficaram sem texto.
- A versão do extrator entrou no fingerprint. Índices antigos gravados como `unsupported` recebem fingerprint diferente e são reprocessados no próximo acesso com entitlement.

### P1 — ligaduras e fragmentos do PDF

- Itens do `pdfjs` são unidos usando linha, `hasEOL` e distância horizontal, sem inserir espaço fixo entre fragmentos adjacentes.
- U+FFFD entre letras minúsculas é recomposto como a ligadura `ti`; ocorrências restantes continuam removidas.
- Fixture cobre `participação`, `admitida`, `definição` e `https://`.
- No `EDITAL_PGE_26000415_AM.pdf` real (29 páginas), `participação`, `admitida` e `definição` foram recuperadas, e as formas quebradas antigas ficaram ausentes. O URL repetido do cabeçalho é corretamente removido pela deduplicação de cabeçalho/rodapé.

### P2 — corte relativo

- Mantido o limiar absoluto de `0,5`.
- Após ordenar os resultados, passagens abaixo de `melhor nota - 0,25` são descartadas.
- O delta pode ser ajustado com `JEV_RELATIVE_RELEVANCE_DELTA`; padrão `0.25`.
- Na amostra `0,97 / 0,70 / 0,57`, apenas a evidência de `0,97` permanece. O teste de fronteira confirma que `0,75` permanece quando a melhor nota é `0,97`.

## Validação

- Typecheck de libs e API: PASS.
- Testes completos da API com PostgreSQL: 108 PASS, 0 FAIL.
- Testes focados de IA: 10 PASS, 0 FAIL.
- Extração de PDF pelo bundle `dist/`: PASS.
- `push-force` duas vezes em banco vazio + coluna gerada + shortlist: PASS.
- PDF real de 29 páginas: PASS.
- `docker compose up --build -d`: imagem criada, `db-setup` concluído e API/web saudáveis.
- Banco do Compose após `push-force`: `search_vector` com `is_generated = ALWAYS`.

**Migration required:** NO

**Breaking changes:** NO

**READY_FOR_CLAUDE:** YES
