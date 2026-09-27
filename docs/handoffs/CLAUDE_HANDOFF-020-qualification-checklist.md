# CLAUDE_HANDOFF-020 — checklist automático de habilitação

## Entrega

- `GET /api/v1/tenders/:id/sheet` ganhou somente o campo aditivo `qualificationChecklist`; os 13 campos anteriores e as demais rotas de IA não mudaram.
- Cada item publicado reproduz texto extraído de documento oficial, com título, URL e página. Ausência continua significando apenas “não encontrado”; não há item negativo nem requisito gerado.
- As páginas já persistidas em `tender_ai_passages` são recompostas removendo a sobreposição de 20 palavras do indexador. A segmentação reconhece itens hierárquicos numerados e alíneas `a)`, `b)`, inclusive nos índices antigos que perderam quebras de linha.
- A shortlist usa vocabulário fixo PT-BR e no máximo `AI_QUALIFICATION_CANDIDATE_LIMIT=40` segmentos. Alíneas herdam apenas o contexto oficial do item numerado pai para a classificação; o texto exibido continua sendo exclusivamente a alínea oficial.
- O Jev recebe uma Noul `is_req` e uma Choice `tipo` no mesmo request. Tipo com confiança abaixo de `0.7` não é inferido; para fiscal/trabalhista, uma segunda Noul permite publicar os dois tipos quando o mesmo trecho combina FGTS/fiscal e CNDT.
- A deduplicação obrigatória por `(tipo, página)` mantém o maior `is_req`; repetições em outras páginas são removidas por sobreposição textual e âncoras documentais (por exemplo, modelo e exigência principal do mesmo atestado). Requisitos técnicos distintos, como atestado e registro ANTT, permanecem.

## Contrato e persistência

`qualificationChecklist` tem itens `{ type, evidence, confidence }`, nos cinco tipos documentados em `docs/contracts/ai-v1.md`. Fora de `ready`, ou sem documento/candidato válido, a lista é vazia.

O cache continua global pela mesma chave `(tender_id, index_version, requested_model, prompt_version)`. A migration `0016_qualification_checklist.sql` e o schema Drizzle acrescentam `qualification_checklist jsonb not null default '[]'`; `SHEET_PROMPT_VERSION` subiu de `2` para `3`.

`pnpm --dir lib/db run verify:qualification-checklist`, apontado para o PostgreSQL local, criou um banco temporário, executou dois `push-force`, inseriu uma ficha entre os pushes e confirmou que a coluna e o valor sobreviveram. Nenhum dado sintético foi escrito em `licita` ou `licita_cycle4`.

## Calibração real e leitura humana

Fonte: `licita_cycle4`, modelo `jev-1.13.0`, prompt `3`, limite `40`, limiar `is_req=0.5`. O JSON completo, inclusive todos os candidatos, melhor/segundo por tipo e a revisão humana estruturada, está em `CODEX_HANDOFF-020-calibration.json`.

| edital | candidatos | passaram Noul | itens finais | 2ª Noul | tokens | custo estimado | falso positivo | falso negativo documental |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `03288908000483-1-000042-2026` | 40 | 12 | 4 | 9 | 34.926 | US$ 0,00146689 | 0 | sim |
| `34028316000103-1-000086-2026` | 40 | 20 | 8 | 6 | 36.241 | US$ 0,00152212 | 0 | sim |
| `34028316000103-1-000087-2026` | 40 | 23 | 8 | 7 | 36.141 | US$ 0,00151792 | 0 | sim |

Total do checklist nos três editais: `107.308` tokens e `US$ 0,00450693`; média de `35.769` tokens e `US$ 0,00150231` por edital. Esse custo é global por geração da ficha; hit de cache não chama o Jev novamente.

A leitura humana cobriu as seções completas de habilitação e os anexos/modelos relevantes, não apenas as pontuações do Jev:

- `...000042...`: edital p. 11–13, Termo de Referência p. 3–4 e pagamento p. 20. Os quatro itens publicados são requisitos reais; documentos exigidos somente da contratada para pagamento foram rejeitados. Não há CNDT explícita. Ficaram fora documentos societários, fiscais e contábeis adicionais concentrados nas mesmas páginas.
- `...000086...`: seção 7, p. 16–22, e modelos p. 33–34. Os oito itens são reais; o modelo do atestado não virou um requisito duplicado. Ficaram fora documentos societários/cooperativos adicionais e a certidão federal que compartilha a p. 17 com o FGTS.
- `...000087...`: seção 6, p. 14–18, e modelo p. 27. Os oito itens são reais; atestado e registro ANTT são exigências técnicas distintas. Ficaram fora documentos societários adicionais, a certidão federal e a declaração do modelo III.

Os falsos negativos documentais decorrem principalmente da regra solicitada de manter apenas um candidato por `(tipo, página)`. O checklist cobre todos os cinco tipos quando eles existem, mas não deve ser apresentado pela UI como lista exaustiva de cada certidão quando várias estão na mesma página.

## Verificação

- Unitários cobrem segmentação numerada/lettered, reconstrução do overlap real, falso positivo lexical de “habilitação” de TAG, FGTS+CNDT, baixa confiança sem inferência, deduplicação e resposta vazia.
- Os mocks do Jev validam os corpos e formas reais de Noul/Choice; não usam resposta fixa incompatível com o SDK.
- O build agora gera e testa também `dist/qualification-checklist-policy.mjs`.
- Passaram: `typecheck:libs`, typecheck da API, build, `test:dist-sheet`, verify de schema e a suíte completa com `PNCP_TEST_DATABASE_URL=postgres://licita:licita@localhost:5432/licita_cycle4` em schema isolado.

## Integração

O frontend ficou intocado, conforme ownership. A UI deve tratar tipo ausente como “não encontrado” e sempre mostrar o trecho/página; nunca renderizar “não exige” por ausência. Como a deduplicação por página pode omitir documentos irmãos, recomenda-se o rótulo “Requisitos encontrados”, não “Lista completa”.

Commits anteriores deste handoff: `1c6c27c`, `8179dad`, `8ff4f1d`, `06bec87`. Não houve push.
