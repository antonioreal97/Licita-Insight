# Filtros laterais das oportunidades

As listas de Editais nacionais e Internacionais usam o trilho de filtros de 264 px do Explorar editais, recolhível para 40 px. O campo de busca permanece no topo; os filtros têm aplicação imediata no desktop, perguntas com ajuda e glossário, “Mais filtros” recolhido com contador e chips acima dos resultados. No celular, a folha mantém um rascunho com prévia do total, Limpar e Ver N oportunidades; cancelar descarta as escolhas e fechar devolve o foco ao botão.

A barra e a estrutura da folha foram extraídas para `src/components/filters/`. O Explorar editais consome esses componentes mantendo os filtros, defaults, URLs, ordenação e visualizações anteriores, inclusive o recálculo de altura após mudanças nos avisos da busca. Nas oportunidades, situação, fonte, programa e demais filtros secundários ficam em “Mais filtros”; elegibilidade e financiamento para brasileiros usam os parâmetros existentes. A ordem dos resultados continua sendo a fornecida pela API; o contrato de oportunidades não tem ordenação nem filtro de moeda. Região e o atalho de projetos no Brasil mantêm os controles geográficos internacionais existentes.

Não há alteração da API, dependências, esquema de URL, assinatura, access-gate ou selo da plataforma de inscrição. Custo adicional de IA: **R$ 0 por alerta**. Sem migração.

## Validação

- `pnpm --filter @workspace/licitainsight run typecheck`: aprovado.
- `pnpm --filter @workspace/licitainsight run test`: **296/296 aprovados**, sem skips; testes existentes de busca mantidos sem alterações.
- `PORT=24731 BASE_PATH=/ pnpm --filter @workspace/licitainsight run build`: aprovado; aviso de chunks acima de 500 kB.
- Navegador Chromium, com movimento reduzido: nacionais e internacionais passaram em largura 264/40 px, aplicação imediata e URL, contador de Mais filtros, prévia móvel, cancelar, aplicar, limpar, chips, foco e ausência de transbordamento horizontal.
- Explorar editais no navegador: recolher/expandir, prazo imediato, alternar tabela, prévia móvel, limpar/aplicar e foco aprovados.
- URLs antigas nacionais e internacionais, contadores, componentes e textos acessíveis cobertos pela suíte unitária. Os seletores e a serialização HTTP continuam usando o serviço existente.
- `git diff --check`: aprovado.

Os testes de navegador usam exclusivamente `fixture-server.mjs`, com oportunidades explicitamente fictícias e URLs `example.invalid`, sessão e assinatura simuladas. Não validam dados ou serviços reais. Não foi necessária suíte de API, PostgreSQL, Docker ou chamada real a PNCP, OpenAI, JEV, Brevo ou Asaas.

## Capturas comparativas

Antes: commit `a49cc45`, extraído com `git archive` para diretório temporário ignorado neste mesmo worktree, sem checkout nem descarte das mudanças. Depois: implementação desta branch. Viewports: desktop 1440 × 1000, celular 390 × 844. No celular nacional, a folha é mostrada em ambos; internacional antes mostra os filtros na página, porque ainda não existia folha.

| Lista / tela / tema                 | Antes                                              | Depois                                             |
| ----------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Nacionais / desktop / Creme         | [Antes](before/nacional-desktop-creme.png)         | [Depois](after/nacional-desktop-creme.png)         |
| Nacionais / desktop / Petróleo      | [Antes](before/nacional-desktop-petroleo.png)      | [Depois](after/nacional-desktop-petroleo.png)      |
| Nacionais / celular / Creme         | [Antes](before/nacional-celular-creme.png)         | [Depois](after/nacional-celular-creme.png)         |
| Nacionais / celular / Petróleo      | [Antes](before/nacional-celular-petroleo.png)      | [Depois](after/nacional-celular-petroleo.png)      |
| Internacionais / desktop / Creme    | [Antes](before/internacional-desktop-creme.png)    | [Depois](after/internacional-desktop-creme.png)    |
| Internacionais / desktop / Petróleo | [Antes](before/internacional-desktop-petroleo.png) | [Depois](after/internacional-desktop-petroleo.png) |
| Internacionais / celular / Creme    | [Antes](before/internacional-celular-creme.png)    | [Depois](after/internacional-celular-creme.png)    |
| Internacionais / celular / Petróleo | [Antes](before/internacional-celular-petroleo.png) | [Depois](after/internacional-celular-petroleo.png) |

Chips acima dos resultados no celular: nacionais em [Creme](after/nacional-celular-chips-creme.png) e [Petróleo](after/nacional-celular-chips-petroleo.png); internacionais em [Creme](after/internacional-celular-chips-creme.png) e [Petróleo](after/internacional-celular-chips-petroleo.png).

## Reprodução local

Com as dependências já instaladas, iniciar o servidor fictício e o frontend em terminais próprios:

```sh
node docs/reviews/opportunity-filters-sidebar/fixture-server.mjs
PORT=24731 BASE_PATH=/ API_PROXY_TARGET=http://127.0.0.1:24732 pnpm --filter @workspace/licitainsight run dev
```

Iniciar Chromium com perfil temporário exclusivo e CDP em 24733; em macOS:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=24733 --user-data-dir=/tmp/feat-opportunity-filters-review-chrome --no-first-run --disable-gpu about:blank
node docs/reviews/opportunity-filters-sidebar/browser-review.mjs http://localhost:24731 docs/reviews/opportunity-filters-sidebar/after
```

O script captura os dois temas, desktop, folha móvel e chips, depois executa as verificações de interação. `CDP_URL` permite outra porta do navegador. O terceiro argumento `before` apenas captura a versão anterior; esse modo não exige a folha internacional nem a barra nova. Encerrar somente os processos próprios ao terminar.
