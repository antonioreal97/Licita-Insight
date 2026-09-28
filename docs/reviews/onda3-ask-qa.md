# Onda 3, fatia 1 — QA de integração ("Perguntar ao edital")

Data: 25 set 2026. Branch `antonioreal97/cycle4`. Backend: `fb9310a` ([CLAUDE_HANDOFF-011](../handoffs/CLAUDE_HANDOFF-011-ask-tender.md)). Frontend: painel no detalhe do edital.

## Ambiente

- Banco `licita_cycle4` (push-force) com os 8.431 editais copiados do banco principal (3 com anexos).
- API do cycle4 na `:3101` com `JEV_API_KEY` real, `JEV_MODEL=jev-1.13.0`, `AI_DAILY_ASK_LIMIT_TRIAL=4`.
- Vite na `:24352`. Chromium headless em 1366×900 e 375×812.

## Bloqueios do backend ([CODEX_HANDOFF-012](../handoffs/CODEX_HANDOFF-012-ask-fixes.md))

1. **PDF não extrai pelo `dist/`**: `pdf.worker.mjs` fica fora do bundle do esbuild. Todo PDF vira `failed` no caminho do Docker. Os testes rodam via `tsx` e não pegam isso.
2. **`search_vector` nulo com `push-force`**: a migration cria coluna gerada; o schema Drizzle, coluna comum. Todo ask vira `not_found` sem chamar o Jev.
3. Índice preso em `unsupported` quando a extração falha (não é retentado).
4. Ligaduras: "par cipação", "de fi nição", "h ps://" no texto indexado e no trecho exibido.

Para seguir o QA, a API rodou via `tsx` e a coluna foi recriada como gerada **só no banco de teste**.

## Resultado com o Jev real (depois dos contornos)

| Caso | Resultado |
|---|---|
| Visitante | Painel convida a entrar com Google |
| Teste expirado | Nota "faz parte da assinatura" com link |
| Indexação | Estado "Lendo os documentos", polling 2 s → pronto em 2,5 s (ZIP) / ~25 s (PDFs) |
| Edital só com ZIP | 4 PDFs internos lidos (54 páginas), índice `ready` |
| "Pode participar em consórcio?" | `answered` em 1,2 s; 97% na p. 4 (item 4.3, a resposta) |
| "Exige visita técnica?" | `not_found` (não existe no edital) |
| Mesma pergunta de novo | cache: 0,4 s, cota não muda |
| "Qual a multa por descumprimento?" | `answered`, 84% e 83% na p. 20 |
| Cota (4) esgotada | campo e botão desabilitados, texto de renovação à meia-noite |
| Mobile 375 px | sem rolagem horizontal |
| Erros de console | nenhum além dos esperados |

## Ajustes de UI feitos nesta rodada

- Termos da pergunta destacados no trecho (prefixo de 6 letras, sem acento); o texto oficial não muda.
- O melhor trecho aparece sozinho; os demais acima do limiar ficam em "Outros trechos que podem ajudar". O 2º trecho de consórcio (70%) era ruído.
- `unsupported` não diz mais só "digitalizado": ZIP só com planilhas também cai nesse estado.
- Chance mostrada como "97% de chance de responder", que é o que a noul calibrada significa.
- Sugestões de pergunta preenchem o campo e não enviam (cada pergunta gasta cota).

## Não verificado

- Build Docker do frontend e da API juntos (bloqueado pelo item 1).
- Estado `failed` na UI com erro real de rede do PNCP (coberto por leitura do código: GET de quem tem acesso retenta).

## Reteste após [CODEX_HANDOFF-012](../handoffs/CODEX_HANDOFF-012-ask-fixes.md) (`7ce9ef4`)

- Container do Compose (este worktree): `test:dist-pdf` PASS; `search_vector` gerado (`ALWAYS`) no banco `licita`.
- `push-force` sobre banco que já tinha a coluna gerada: sem erro, coluna continua `ALWAYS`.
- API pelo caminho do Docker (`build.mjs` → `dist/`), Jev real, índice zerado:
  - PDF dos Correios indexado em 6,4 s; edital só com ZIP: 4 PDFs, 54 páginas.
  - Consórcio: 98% (p. 4) e 97% (o item 4.3 exato); o trecho de ruído de 70% saiu com o corte relativo.
  - Multa: 84% e 84% (p. 20). Visita técnica e garantia: `not_found`. Cache e cota esgotada: ok.
  - 352 trechos sem U+FFFD e sem "par cipação", "admi da", "de fi nição", "h ps:"; texto exibido limpo.
- Resta no log só aviso de fonte do pdfjs (`Warning: TT: undefined function`), sem efeito na extração.
- Login pelo Google no stack Docker não testado (sem `AUTH_DEV_LOGIN` lá; precisa do owner).
