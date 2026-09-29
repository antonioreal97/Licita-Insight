# Ciclo 12 — ajustes finais no detalhe do edital e em Configurações (29 set 2026)

Tarefa C do ciclo 12. Escopo: `features/tenders`, `features/participation`, `features/settings`. Sem mudança de API
nem de contrato (`docs/contracts/participation-v1.md`), sem redesenho. Os critérios são os princípios de
[`ux-simplification-2026-09-28.md`](ux-simplification-2026-09-28.md): rótulos repetidos, textos longos, jargão,
hierarquia (prazo e próxima ação primeiro) e estados vazios/erro.

## 1. Aviso único sobre trechos automáticos

| Antes | Depois | Motivo |
|---|---|---|
| "Os trechos são escolhidos automaticamente e podem não ser os únicos relevantes. Confira o edital original antes de decidir." ficava num parágrafo solto no **fim** do detalhe (`tender-detail-page.tsx`), depois de Documentos e da Cronologia. Aparecia também para visitante e para conta sem assinatura, que não veem nenhum trecho. "Antes de decidir" mostrava só o rótulo "Encontrado no edital". | O aviso aparece uma vez, em **Antes de decidir**, colado ao rótulo de camada: "Encontrado no edital. Os trechos são escolhidos automaticamente e podem não ser os únicos relevantes. Confira o edital original antes de decidir." (`data-testid="text-sheet-disclaimer"`). O parágrafo do rodapé saiu. | É o primeiro bloco com trechos (links `p. N`) e o que se lê antes de decidir; no rodapé o aviso era lido por último. Só aparece para quem tem acesso, porque só essas pessoas veem trechos. O texto é o mesmo da tabela de copy de `participation-mvp-ux-2026-09-28.md` ("aviso único"), então nada da honestidade se perde. |
| O texto vivia como literal no JSX. | Constante `AUTO_PASSAGES_NOTICE` em `participation/lib/provenance.ts`. | Uma fonte só para o texto; o teste abaixo garante que ele não volta a ser duplicado. |

Continuam, porque dizem outra coisa:

- Ficha: "Encontrado no edital. Cada campo mostra o trecho oficial e a página; campo sem trecho fica como não
  encontrado." — explica como ler a ficha e o "não encontrado".
- O que preparar: "Pode haver outras exigências. Confira sempre o edital." — está na tabela de copy como
  "aviso checklist"; diz que a lista de exigências não é completa.
- Perguntar ao edital: "A resposta é sempre um trecho dos documentos oficiais, com a página, nunca um texto gerado."
- Landing: sem mudança (fora do escopo).

Teste novo: `participation/lib/provenance.test.ts`. Ele lê os fontes de `features/tenders` e
`features/participation` e verifica que o texto "escolhidos automaticamente" existe só na constante e que
`{AUTO_PASSAGES_NOTICE}` e `text-sheet-disclaimer` aparecem uma vez, só em `decision-panel.tsx`.

## 2. Painel de participação e detalhe

| Onde | Antes | Depois | Motivo |
|---|---|---|---|
| Sua participação — ordem | Etapas → "Você marcou: …" → **Ver histórico** → formulário (próxima ação, prazo, protocolo) | Etapas → "Você marcou: …" → formulário → Ver histórico | A próxima ação e o prazo são o mais importante do painel; o histórico é consulta. |
| Sua participação — campo | "Protocolo informado por você" | "Protocolo" (a dica continua: "O LicitAI não confere este número no sistema de compras.") | Rótulo repetido: o cabeçalho do painel já diz "Informado por você. O LicitAI não envia propostas nem confirma envio, protocolo ou resultado no portal oficial." |
| Sua participação — dica | "O que falta fazer, do seu jeito. 0/500" | "O que falta fazer. 0/500" | "do seu jeito" não informa nada. |
| Ficha — O que preparar vazio | "Nenhuma exigência de documento foi encontrada nos documentos lidos. Confira o edital." | "Nenhuma exigência encontrada nos documentos lidos. Confira o edital." | Repetia "documento… documentos"; mais curto e mantém "Confira o edital". |

Revisado e mantido:

- **Rótulos "Você marcou".** Aparecem na etapa, em cada item do checklist (com data) e no resumo do checklist.
  É a camada de declaração do usuário exigida pela tabela de proveniência (`participation-mvp-ux`, seção 3:
  "Você marcou" com data quando houver). Tirar qualquer um deles apagaria a distinção entre fonte oficial,
  leitura automática e declaração do usuário.
- **Prazo repetido.** O prazo aparece no cabeçalho, em "Antes de decidir" e em "O que acontece agora". São três
  perguntas diferentes (fatos, decisão, próximo passo) e a ordem dos blocos segue a seção 5.3 da mesma revisão.
  Juntar esses blocos seria redesenho.
- **Ordem dos blocos.** "Sua participação" logo depois de "Antes de decidir" continua: os botões "Vou analisar /
  Vou participar / Não é para mim" são a ação da decisão.
- **Estados vazios e de erro.** Participação, checklist, ficha, aderência e perguntas já mostram a mensagem real
  com `ref.` e "Tentar de novo" dentro do próprio bloco, e o resto da página continua usável. Nenhuma mudança.
- **Jargão.** "ME/EPP", "Aderência" e "Protocolo" são termos do usuário (licitante). Nenhuma sigla interna aparece.

## 3. Configurações › Notificações

| Antes | Depois | Motivo |
|---|---|---|
| "Um e-mail por dia, às 07:00 (horário de Brasília), com os avisos novos: mudanças nos editais monitorados e editais novos das buscas salvas com alertas. Sem novidade, não enviamos." | "Um e-mail por dia, às 07:00 (horário de Brasília), com os avisos novos (mudanças nos editais monitorados e editais novos das buscas salvas com alertas) e os prazos dos próximos 3 dias dos editais que você está analisando ou preparando. Sem novidade nem prazo próximo, não enviamos." | O resumo passa a trazer esses prazos (tarefa A do ciclo 12, backend). O coordenador confirmou que o e-mail sai mesmo quando só há prazo próximo, então a última frase mudou junto. Só texto. |

## Verificação

- `pnpm --filter @workspace/licitainsight run test`: 18 testes, 18 passam (2 novos).
- `pnpm --filter @workspace/licitainsight run typecheck`: OK.
- `PORT=24254 BASE_PATH=/ pnpm --filter @workspace/licitainsight run build`: OK. Continuam só os avisos já
  conhecidos de bundle > 500 kB.
- Largura: não surgiu nenhum contêiner novo nem largura fixa. O aviso usa o `ProvenanceLabel` existente
  (`inline-flex`, texto quebra). Não abri a página no navegador a 390 px: a stack não estava rodando, e subir
  API e Vite no worktree compartilhado atrapalharia os outros workers.
