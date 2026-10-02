# Design QA — filtros da busca no desktop

- Source visual truth: capturas inline dos Browser Comments 1 e 2 desta tarefa (o navegador não expôs um caminho local), 1456 × 788 px.
- Implementation screenshot: capturas do Codex In-app Browser renderizando `http://localhost:24252/search?view=table` (o navegador não expôs um caminho local), 1456 × 788 px.
- Viewport: 1456 × 788 CSS px, densidade 1×. Verificação responsiva adicional em 800 × 788 CSS px.
- State: filtros expandidos no topo e após rolagem; filtros recolhidos; fallback de filtros em largura menor.

## Full-view comparison evidence

- O layout, a tipografia, as cores, os controles, a tabela e o conteúdo existentes permaneceram alinhados às capturas de referência.
- O novo controle usa o mesmo padrão visual e a mesma biblioteca de ícones da barra lateral principal.
- Recolhido, o trilho mede 40 px e a região de resultados cresce de 840 px para 1.064 px após a transição.
- Expandido no topo, o painel usa 508 px da altura disponível e termina 16 px antes do fim da viewport. Ao ficar preso abaixo do cabeçalho, cresce para até 692 px conforme o espaço visível.

## Focused region comparison evidence

- Cabeçalho dos filtros: rótulo, divisor, contador e espaçamento preservados; o botão de recolher foi alinhado à direita.
- Estado recolhido: botão de expandir permanece visível, com `aria-expanded="false"`, e o divisor vertical mantém a separação entre filtros e resultados.
- Largura menor: o controle desktop fica oculto e o botão original “Filtros” continua visível.

## Findings

- Nenhuma diferença P0, P1 ou P2 acionável.
- Tipografia: família, pesos, tamanhos, truncamento e hierarquia existentes foram preservados.
- Espaçamento/layout: grade, separadores, raios e ritmos existentes foram preservados; apenas as duas larguras solicitadas (264/40 px) alternam.
- Cores/tokens: somente tokens existentes de fundo, borda e texto são usados.
- Imagens/assets: nenhuma imagem foi adicionada ou alterada; os ícones vêm de `lucide-react`, já usado pelo produto.
- Copy/conteúdo: conteúdo da busca e dos filtros foi preservado; foram adicionados apenas os rótulos acessíveis “Recolher filtros” e “Expandir filtros”.

## Comparison history

- Primeira verificação: interação, expansão da tabela e altura dinâmica funcionaram; havia um pequeno atraso de um frame na medida após a fixação sticky.
- Ajuste: a medição passou a ocorrer depois de a posição sticky estabilizar.
- Evidência pós-ajuste: painel alinhado ao espaço disponível no topo e durante a rolagem; recolher/expandir e breakpoint de 800 px verificados; nenhum erro ou aviso no console.

## Implementation checklist

- [x] Recolher e expandir filtros no desktop.
- [x] Expandir a área de resultados quando os filtros estão recolhidos.
- [x] Ajustar a altura rolável à porção visível da página.
- [x] Preservar o fluxo de filtros em larguras menores.
- [x] Verificar acessibilidade do controle e ausência de erros no console.

## Follow-up polish

- Nenhum P3 pendente.

final result: passed
