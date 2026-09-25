```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-014

Feature: aderência — correções da revisão do CLAUDE_HANDOFF-013 (5fcc392)

Priority: P1 (itens 1 e 2). Branch: antonioreal97/cycle5. Sem mudança de contrato público,
exceto a semântica do item 1 (documentar em company-fit-v1.md).

1. P1 — cota para ME/EPP não pode forçar "baixa aderência"
   company-fit-policy.ts: fitLevel(score, excluded, sizeRestricted) força 'low' para qualquer
   size_restricted. Pela LC 123/2006 art. 48, III, a cota reservada (até 25%) deixa a cota principal
   aberta a qualquer porte. Regra: só me_epp_exclusive força 'low' para size = 'other';
   me_epp_quota vira motivo informativo, sem mudar o nível.
   Hoje "exclusivo" vs "cota" sai de /cota|reservad/ sobre o trecho (company-fit-service.ts ~254):
   um trecho de exclusividade que cita "cota" em outra frase vira quota, e o contrário. Trocar por
   uma Choice no mesmo request do trecho: { exclusive, quota, none } com critérios explícitos
   (ex.: exclusive = "participação exclusiva de ME/EPP no item/lote/certame"; quota = "cota
   reservada de parte do objeto para ME/EPP"; none = "só benefícios como empate ficto/preferência
   ou regularidade fiscal tardia"). O 5.14 do edital dos Correios (preferência pós-lances) é none.
   Critério: testes com os três casos e com trecho misto.

2. P1 — cache de aderência invalida todo dia
   tenderFingerprint inclui updatedAt, e upsert-tenders.ts grava updatedAt = now em toda revisita de
   edital aberto. Resultado: todo edital aberto recalcula no dia seguinte (custo e fila à toa, e o
   selo volta a 'pending'). Usar só conteúdo (título, objeto, descrição, itens, órgão, valor, UF).
   Critério: teste que revisita o mesmo edital sem mudança e mantém o fit em cache.

3. P2 — níveis da Score concretos (guia TypeSafe: níveis devem descrever situações)
   Hoje: "Sem relação comercial relevante / Relação fraca ou apenas indireta / Boa relação, embora
   parcial / Relação direta e forte". Usar os do handoff 013, citando os caminhos do state:
     0 "O objeto e os itens em `licitacao` não têm relação com o que `perfil_da_empresa` fornece."
     1 "Relação indireta: tema vizinho, ou a empresa forneceria só um item acessório."
     2 "A empresa fornece parte relevante dos itens, mas não o objeto principal."
     3 "A empresa fornece o objeto principal da licitação."
   Idem na Noul de exclusão: referenciar `perfil_da_empresa.exclusoes`, falso = "só menciona o tema".
   Subir promptVersion (invalida o cache, como previsto).

4. P2 — amostra da calibração
   scripts/calibrate-company-fit.ts usa os mesmos 30 editais (os primeiros por id, que agrupam poucos
   órgãos) para os 3 perfis: quase sem positivos nem vizinhos. Por perfil: 10 prováveis positivos
   (tsvector com os offerings), 10 vizinhos que testam falso positivo (ex.: facilities → "material de
   limpeza", "produtos de limpeza", "vigilância"; construção → "material de construção", "locação de
   máquinas"; TI → "servidores públicos", "telefonia", "impressão"), 10 aleatórios. valueRange null na
   calibração para ver a nota semântica de todos. O JSON deve trazer título + objeto curto para revisão
   humana. Rodar exige DATABASE_URL com editais e JEV_API_KEY (o Claude roda se o ambiente não tiver).

5. P3 — 400 do PUT traz só o primeiro campo inválido
   O contrato diz erro por campo; devolver todos os details (a UI já mapeia vários).

ADENDO (25 set 2026, QA real com Jev jev-1.13.0, 8.431 editais no licita_cycle5) — vira o item mais grave:

0. P0 — a Noul de exclusão rebaixa o próprio negócio do perfil
   Perfil de limpeza/facilities com exclusões ["material de limpeza", "produtos de limpeza"]. Na busca
   "limpeza", os SERVIÇOS de limpeza e conservação (o negócio do perfil) saíram 'low' com o motivo
   "parece ser algo que vocês não atendem". Nenhum edital saiu 'high'. Causa: contrato de serviço
   "com fornecimento de materiais" faz a pergunta atual responder sim acima de 0,65.
   Sondagem com o state atual (perfil_da_empresa + licitacao), mesma chamada:
     edital                                          exclusão atual   reescrita
     Aquisição de materiais de limpeza diversos       0,96             0,96
     AQUISIÇÃO DE MATERIAL DE LIMPEZA                 0,97             0,95
     Serviços de limpeza e conservação diária         0,70             0,04
     Serviços de limpeza, asseio e conservação        0,68             0,04
     Serviços de copeiragem                           0,50             0,06
   Reescrita:
     instructions: "O objeto principal de `licitacao` é a compra ou a prestação de algo listado em
       `perfil_da_empresa.exclusoes`? Julgue o que o órgão está contratando como um todo, não os insumos
       de um serviço."
     true:  "O que se contrata é, em si, um item de `perfil_da_empresa.exclusoes` (ex.: a licitação é
       para comprar esse produto)."
     false: "O objeto é outro, ou o item excluído aparece só como insumo, material ou parte de um serviço
       que a empresa presta."
   Motivo 'exclusion' hoje lista todas as exclusões do perfil (até 6), não a que casou. Opções: uma
   Noul por termo excluído no mesmo request (fan-out) e listar só os acima do limiar; ou listar só os
   termos que casam lexicalmente com o edital. Nunca todos.

3. (reforço) Níveis concretos da Score — sondagem nos mesmos editais, nota/3:
     edital                                   rubrica atual   rubrica concreta (item 3)
     Serviços de limpeza, asseio e conservação   0,77            0,94
     Serviços de limpeza e conservação diária    0,74            0,81
     Serviços de copeiragem                      0,74            0,96
     Dedetização (vizinho)                       0,28            0,18
     Pintura predial (vizinho)                   0,30            0,25
     Compra de material de limpeza               0,07–0,11       0,11
   Instructions usada: "Quanto do que `licitacao` contrata é o que `perfil_da_empresa` fornece?"
   Com a rubrica atual, os três positivos claros ficam 'medium'.

O que funcionou no QA real: 20 selos em ~4 s por página, filtros sem Jev, cache, detalhe com motivos,
sem erros de console. A ordenação pela nota já era boa; o problema é a exclusão sobrepondo a nota.

Processo: commite só seus paths (`git commit -- <paths>`).
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-014-fit-fixes.md
```
