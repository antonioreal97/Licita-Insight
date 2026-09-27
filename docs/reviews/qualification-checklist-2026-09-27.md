# QA — Checklist automático de habilitação (HANDOFF-020) — 27 set 2026

Validação independente da entrega de `CODEX_HANDOFF-020` (`docs/handoffs/CLAUDE_HANDOFF-020-qualification-checklist.md`)
mais a integração do frontend, feita por mim depois da entrega do Codex.

## Backend — reverificação independente

Não confiei no autorrelato; rodei tudo de novo neste ciclo:

- `typecheck:libs`, typecheck da API e build: **passaram**.
- Suíte completa da API: **170/170 testes**, com o comando real documentado
  (`PNCP_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/licita_cycle4 pnpm --dir artifacts/api-server run test`,
  `DATABASE_URL` explicitamente `unset` — lição do ciclo 8).
- `pnpm --dir lib/db run verify:qualification-checklist`: **passou** (banco vazio, dois `push-force`, coluna
  `qualification_checklist` sobrevive com o valor inserido entre os pushes).
- Reteste ao vivo com o Jev real (não mock) nos 3 editais de calibração do `licita_cycle4`:
  - `03288908000483-1-000042-2026`: 4 itens — bate com a calibração do Codex.
  - `34028316000103-1-000086-2026`: 9 itens — a calibração original registrou 8; a variância de +1 é
    explicada por uma pontuação de confiança de tipo caindo exatamente no limiar de 0,5 num rerun
    (o próprio handoff já registra o "2º Noul" como sensível para o caso FGTS+CNDT). Não é regressão:
    o item extra é o par fiscal/trabalhista do mesmo trecho, split correto conforme a regra do item 2
    do CODEX_HANDOFF.
  - `34028316000103-1-000087-2026`: 8 itens — bate com a calibração.
  - Confirmado ao vivo: o falso positivo lexical do dispositivo TAG ("habilitação do dispositivo
    eletrônico") não aparece em nenhum dos 3 checklists.

## Frontend — integração (minha responsabilidade, fora do ownership do Codex)

Arquivos alterados: `artifacts/licitainsight/src/api/types.ts`,
`artifacts/licitainsight/src/features/tenders/components/tender-sheet-panel.tsx`.

- Adicionado `QualificationType`, `QualificationItem` e o campo `qualificationChecklist` em `TenderSheet`
  (aditivo, sem alterar os 13 campos existentes da ficha).
- Nova seção "Requisitos de habilitação encontrados" na Ficha do Edital, antes dos grupos de campos
  existentes. Cada item mostra o rótulo do tipo, um link "p. N" para o documento oficial e um toggle
  "Ver trecho"/"Ocultar trecho" que revela o texto oficial citado — mesmo padrão visual dos campos
  categóricos existentes (`FieldRow`).
- Ordem de exibição fixa (`QUALIFICATION_ORDER`): ato societário, regularidade fiscal, regularidade
  trabalhista, qualificação técnica, qualificação econômico-financeira — tipos ausentes simplesmente
  não renderizam (nunca "não exige" por omissão).
- Aviso fixo abaixo do título, seguindo a recomendação explícita do Codex no handoff: "Não é uma lista
  completa: pode haver mais de uma exigência do mesmo tipo na mesma página, e só uma aparece aqui.
  Confira sempre o edital." — rótulo é "Requisitos encontrados", nunca "Lista completa".
- Seção só renderiza quando `qualificationChecklist.length > 0` (`QualificationChecklist` retorna `null`
  se vazio) — cobre o caso "sem documentos"/"nenhum requisito do tipo encontrado" sem precisar de um
  estado de erro dedicado.
- Refatorei `SourceLink` para receber `evidence: SheetEvidence | null` diretamente em vez de um
  `SheetField` inteiro — meu primeiro rascunho fabricava um `SheetField` falso (`id: 'contract_term'`
  arbitrário) só para reaproveitar o componente; limpo agora, os dois call sites (as 13 linhas de campo
  fixo e as novas linhas do checklist) usam a mesma assinatura direta.
- `pnpm --filter @workspace/licitainsight run typecheck`: **0 erros**, antes e depois do refactor.

## QA visual ao vivo (Playwright headless, Chrome for Testing cacheado)

O `claude-in-chrome` não está conectado neste ambiente (confirmado de novo neste ciclo); usei o padrão
já estabelecido de Playwright headless direto contra o binário cacheado do Chrome for Testing.

Setup: subi a UI desta worktree (`pnpm --filter @workspace/licitainsight run dev`, porta 24253 — a 24252
já estava ocupada pelo container de produção local) e uma API temporária separada (porta 3002,
`DATABASE_URL` apontando para `licita_cycle4`, `AUTH_DEV_LOGIN=true` já presente no `.env` desta worktree,
`CULTURE_DAILY_COLLECT=false` para não disparar coleta externa à toa). **O stack Docker de produção local
(`licita-insight-api-1`, `licita-insight-web-1`, `licita-insight-postgres-1`) não foi tocado** — nem
parado, nem reiniciado; só li do mesmo Postgres. Os dois processos temporários (porta 24253 e 3002) foram
encerrados ao final do QA.

Testado nos 3 editais de calibração, em 1440×900 (desktop) e 390×844 (mobile):
- Seção "Requisitos de habilitação encontrados" presente nos 3, com a contagem de itens batendo com o
  reteste do backend acima.
- Ordem de exibição confere com `QUALIFICATION_ORDER` nos 3 casos.
- Toggle "Ver trecho" → "Ocultar trecho" funciona; o trecho oficial citado aparece (ex.: "b) ato
  constitutivo, estatuto ou contrato social em vigor...").
- Aviso de "não é lista completa" visível logo abaixo do título da seção.
- Layout mobile sem overflow horizontal; itens e links quebram corretamente.
- Console do navegador: nenhum erro atribuível à feature. O único erro observado (`401` em
  `GET /api/v1/auth/session`) é o comportamento padrão pré-login do app para visitante anônimo, não
  relacionado a esta mudança.

## Pendências / decisões do owner

- Nenhuma pendência técnica conhecida nesta entrega.
- Recomendação do próprio Codex, já aplicada na UI: nunca apresentar como lista exaustiva de documentos —
  a deduplicação por `(tipo, página)` pode omitir exigências irmãs na mesma página.
- Ainda em aberto (fora do escopo desta feature): decisão do owner sobre disparar um checkout de teste
  real no Asaas Sandbox para validar o fluxo de cobrança ponta a ponta (oferecido, sem resposta ainda).
