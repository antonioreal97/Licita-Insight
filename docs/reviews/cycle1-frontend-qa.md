# Ciclo 1 — QA de frontend (Licita Insight)

Data: 2026-09-22 · Ambiente: frontend `http://127.0.0.1:24252` + API real `http://localhost:3001/api` (PostgreSQL, 19 editais PNCP/DF).
Método: navegador embutido do Orca (aba própria), medições via `orca eval` no DOM, screenshots em `/tmp/claude-li/qa/`, chamadas diretas à API com `curl`. Nenhum código-fonte foi alterado.

**Limitações de ferramenta.** A aba embutida não tinha foco de documento (`document.hasFocus() === false`). Por isso: (1) teclas nativas (`orca keypress`, `exec press`) não chegavam à página e o teclado foi exercitado com `KeyboardEvent` sintético (o React trata esses eventos); (2) `:focus-visible` não renderiza, então o foco foi verificado por `document.activeElement` e pelas regras CSS, não visualmente. Onde isso vale, está escrito "verificado só programaticamente". A superfície de edital (linha, tabela, detalhe) estava em polish concorrente; os achados ali estão marcados **provisório (em polish)** e foram reconferidos uma vez depois do hot reload (todos se mantiveram).

## Resumo

| Classificação | Qtde |
| --- | --- |
| PASS | 46 |
| FAIL | 15 (blocker 0 · major 4 · minor 11) |
| WARNING | 21 |
| RECOMMENDATION | 9 |

FAILs de severidade major: QA-001 (scroll horizontal de página na visão tabela, provisório), QA-002 (`?page=` fora do intervalo), QA-003 (editais salvos resolvidos só pelos 100 primeiros resultados), QA-004 (drawer de navegação mobile inacessível por teclado).

---

## FAIL

### QA-001 — Visão tabela gera scroll horizontal de página (256 px) · FAIL · major · provisório (em polish)
- **Página / viewport / tema:** `/search`, 1024×768, 1280×800, 1440×900 (ok em 1920×1080); ambos os temas.
- **Repro:** abrir `/search` → clicar no botão "Visualização em tabela".
- **Esperado:** a tabela (`min-w-[960px]`) rola dentro do próprio wrapper; a página não rola na horizontal.
- **Obtido:** `documentElement.scrollWidth` 1521 vs `clientWidth` 1265 em 1280; `scrollTo(400,0)` resulta em `scrollX = 256`. Em 1024: 1233 vs 1009.
- **Evidência:** as spans `sr-only` (`position:absolute`) dentro das células têm `offsetParent = BODY` e ficam em `right = 1521`. O wrapper `max-h-[calc(100dvh-9rem)] overflow-auto` tem `position: static`, então não recorta descendentes absolutos. Aplicar `contain: paint` no wrapper zera o overflow (1521 → 1265); `overflow:hidden` não resolve.
- **Arquivo suspeito:** `artifacts/licitainsight/src/features/search/components/results-table.tsx` (wrapper da linha 36, sem `relative`).

### QA-002 — `?page=` além do total mostra estado contraditório e sem saída · FAIL · major
- **Página / viewport / tema:** `/search?page=999`, 1280×800, claro.
- **Repro:** abrir `/search?page=999` (ou chegar a um link compartilhado de uma página que deixou de existir depois que o total caiu).
- **Esperado:** limitar a página a `totalPages` (e fazer replace na URL), ou oferecer "Ir para a primeira página".
- **Obtido:** o contador diz "19 resultados", o corpo diz "Nenhuma oportunidade encontrada / Não encontramos editais." e o rodapé diz "Mostrando 19.961–19 de 19 oportunidades". Não aparecem botões de página (totalPages = 1) nem ações no estado vazio (sem query, sem filtros). O usuário fica preso.
- **Evidência:** `/tmp/claude-li/qa/page999-1280.png`. A API devolve `200 {page:999,total:19,totalPages:1,data:[]}`.
- **Arquivos suspeitos:** `src/features/search/search-page.tsx` (sem clamp de página), `src/features/search/components/search-pagination.tsx` (`first = (page-1)*pageSize+1` sem clamp), `src/features/search/components/empty-search.tsx`.

### QA-003 — Editais salvos: só aparecem se estiverem entre os 100 primeiros resultados; IDs órfãos dão estado vazio enganoso · FAIL · major
- **Página / viewport / tema:** `/saved-tenders`, 1280×800, claro.
- **Repro:** o `localStorage` já tem `licita-saved-tenders = ["pe-042-2026","pe-301-2026"]` (IDs da era dos mocks). Abrir `/saved-tenders`.
- **Esperado:** cada ID salvo é resolvido individualmente (ou por um endpoint de lote). IDs que não existem mais aparecem como "indisponível", com opção de remover.
- **Obtido:** a página busca `pageSize=100` sem filtro e filtra no cliente. Mostra "Nenhum edital salvo ainda." com 2 IDs salvos. Quando o banco passar de 100 editais, os salvos fora da primeira página somem sem aviso. Ida e volta (salvar em /search → aparece; remover → some) funciona com o banco atual de 19.
- **Arquivo suspeito:** `src/features/saved-tenders/saved-tenders-page.tsx` (`useTenderSearch({ pageSize: 100, facets: false })` + `.filter`).

### QA-004 — Drawer de navegação mobile/tablet: links fechados continuam tabuláveis; aberto não tem trap, Escape nem foco · FAIL · major (a11y)
- **Página / viewport / tema:** qualquer página do shell em 375×812 e 768×1024 (abaixo de `lg`).
- **Repro:** em 375, apertar Tab a partir do topo; depois abrir "Abrir menu" e apertar Escape.
- **Esperado:** com o drawer fechado, os links ficam fora da ordem de tab e da árvore de acessibilidade (`inert`/`aria-hidden`). Aberto, o foco entra no drawer, fica preso nele, Escape fecha, o foco volta ao botão e o botão expõe `aria-expanded`.
- **Obtido:** fechado (`left:-248px`), o `<aside>` não é `inert` e continua visível para leitor de tela. "Fechar menu" e os 7 links de navegação vêm antes do cabeçalho na ordem de tab. Aberto: o foco fica em "Abrir menu", Escape não fecha (continua em `left:0`), não há focus trap e "Abrir menu" não tem `aria-expanded`.
- **Evidência:** saída do eval: `tabbables: ["Pular para o conteúdo","Fechar menu","Visão geral",…,"Design system","Abrir menu",…]`; `/tmp/claude-li/qa/drawer-375.png`. Verificado só programaticamente.
- **Arquivo suspeito:** `src/components/app-shell.tsx`.

### QA-005 — Painel de filtros (sheet) não devolve o foco ao botão "Filtros" ao fechar · FAIL · minor (a11y)
- **Página / viewport:** `/search?q=correios`, 375×812.
- **Repro:** focar "Filtros" → abrir → Escape (ou "Aplicar").
- **Esperado:** o foco volta para `[data-testid=button-filter-drawer]`.
- **Obtido:** `document.activeElement` = `BODY`. Como o sheet não usa `DialogPrimitive.Trigger`, o Radix não tem `triggerRef` para onde devolver o foco. O focus trap funciona: Tab em "Aplicar" volta para "Fechar filtros". Escape descarta o rascunho corretamente.
- **Arquivo suspeito:** `src/features/search/components/filters-sheet.tsx` (sem `Trigger` nem `onCloseAutoFocus`). Verificado só programaticamente.

### QA-006 — Paginação: o foco se perde quando "Próxima/Anterior" fica desabilitado · FAIL · minor (a11y)
- **Página / viewport:** `/search?page=2&pageSize=7`, 1280×800.
- **Repro:** focar "Próxima página" e ativar → página 3 (última).
- **Esperado:** o foco continua num controle útil (botão da página atual ou topo dos resultados).
- **Obtido:** o botão recebe `disabled` e `activeElement` vira `BODY`. O mesmo acontece com "Anterior" ao chegar na página 1. Também não há anúncio da troca de página (ver QA-027).
- **Arquivo suspeito:** `src/features/search/components/search-pagination.tsx`.

### QA-007 — Parâmetros inválidos que passam na validação do front caem num erro genérico sem saída útil · FAIL · minor
- **Página / viewport:** `/search?deadlineFrom=2026-13-40`, `/search?state=ZZZ`, 1280×800.
- **Esperado:** o front descarta datas impossíveis e UFs inválidas (como já faz com `status`, `sort`, `page`), ou o estado de erro oferece "Limpar filtros".
- **Obtido:** a regex `^\d{4}-\d{2}-\d{2}$` aceita `2026-13-40` e `state` não é validado, então a API responde 400. A UI mostra "Filtros inválidos / Revise os filtros aplicados" com um único botão, "Tentar novamente", que nunca vai funcionar. O chip mostra "Prazo: a partir de —" enquanto o campo de data aparece vazio (dd/mm/aaaa) com o badge "1". O painel de facets troca tudo por "Filtros indisponíveis".
- **Evidência:** `/tmp/claude-li/qa/deadline-invalid-1280.png`; a rede registra `400 …search?deadlineFrom=2026-13-40`.
- **Arquivos suspeitos:** `src/services/search-service.ts` (`searchParamsFromUrl`), `src/components/common/query-states.tsx` (ErrorState de `INVALID_PARAMETER` só com retry).

### QA-008 — `index.html`: `lang="en"`, zoom bloqueado e metadados de template · FAIL · minor (a11y)
- **Evidência:** `<html lang="en">` numa UI em PT-BR (leitores de tela pronunciam em inglês). `<meta name="viewport" … maximum-scale=1>` impede o zoom por pinça no iOS (WCAG 1.4.4). A meta description diz "Licita Insight — built on Replit. Update this description…". A página ainda carrega a fonte Inter, que não é usada (o DS usa DM Sans e Space Mono).
- **Arquivo suspeito:** `artifacts/licitainsight/index.html`.

### QA-009 — Tema escuro inconsistente fora do shell e com flash no carregamento · FAIL · minor
- **Repro:** `localStorage['licita-theme']='dark'` → carregar `/login`, `/`, `/rota-inexistente`: tudo claro (`html.dark = false`). Navegar de `/dashboard` (escuro) para uma rota 404 por SPA: fica escuro.
- **Esperado:** o tema escolhido vale para todas as rotas e é aplicado antes da primeira pintura.
- **Obtido:** a classe `dark` só é aplicada pelo `useEffect` do `AppShell`, depois do primeiro render (flash claro nas páginas do shell) e nunca nas páginas fora dele em carregamento direto. O tema de login/landing/404 depende de como o usuário chegou lá.
- **Evidência:** saída do eval: `/login dark=false`, `/dashboard dark=true`, 404 via SPA `dark=true` (`/tmp/claude-li/qa/404-dark-spa.png`).
- **Arquivos suspeitos:** `src/components/app-shell.tsx` (linhas 51–56), `index.html` (falta script de tema pré-hidratação).

### QA-010 — Landing tem scroll horizontal em 375 px · FAIL · minor
- **Repro:** `/` em 375×812 → `scrollWidth` 379 > 375; `scrollTo(100,0)` → `scrollX = 4`.
- **Evidência:** o elemento decorativo `div.absolute -inset-6 rounded-[30px] bg-primary-subtle/70` termina em `right = 379`. `/tmp/claude-li/qa/landing-375.png`.
- **Arquivo suspeito:** `src/features/landing/landing-page.tsx`.

### QA-011 — Item ativo da sidebar abaixo do contraste AA · FAIL · minor (a11y)
- **Página / tema:** todas as páginas do shell, tema claro, 1280×800.
- **Obtido:** texto do link ativo `rgb(62,148,234)` sobre `rgb(27,47,69)` = **4,32:1** em 13 px (precisa de 4,5:1). O tema escuro passou. Nenhuma outra falha de contraste foi encontrada no primeiro viewport de /search, /dashboard, /saved-tenders, /monitoring, /settings, /design-system, /login, / e 404, nos dois temas (medido com as cores computadas normalizadas por canvas).
- **Arquivo suspeito:** `src/components/app-shell.tsx` (`bg-sidebar-primary/15 text-sidebar-primary`) e o token `--sidebar-primary` em `src/index.css`.

### QA-012 — Controles mortos ou que fingem sucesso · FAIL · minor
Viola a regra do owner "Erros visíveis":
- `/saved-tenders` "Exportar lista": sem `onClick`, habilitado (aparece até com a lista vazia).
- `/saved-searches` "Nova busca" e `/monitoring` "Preferências de alerta": sem `onClick`.
- No cabeçalho, o sino "Notificações": sem `onClick`.
- `/settings`: as abas "Preferências de busca / Notificações / Aparência" não fazem nada. "Salvar alterações" troca para "✓ Alterações salvas" sem persistir nada. Os toggles de notificação não persistem.
- `/tenders/:id`, **provisório (em polish):** "Monitorar" vira "Monitorando" (`aria-pressed=true`) só em estado local. Some ao navegar, e `/monitoring` continua dizendo "Nenhum alerta ligado".
- **Esperado:** o mesmo padrão do `SaveSearchButton` (`aria-disabled` + tooltip/toast "em breve"), ou esconder o controle.
- **Arquivos suspeitos:** `src/features/saved-tenders/saved-tenders-page.tsx`, `src/features/saved-searches/saved-searches-page.tsx`, `src/features/monitoring/monitoring-page.tsx`, `src/components/app-shell.tsx`, `src/features/settings/settings-page.tsx`, `src/features/tenders/tender-detail-page.tsx`.

### QA-013 — Detalhe: o objeto aparece três vezes e o resumo é cortado no meio da palavra · FAIL · minor · provisório (em polish)
- **Página:** `/tenders/34028316000103-1-000087-2026`, 1280×800 e 375×812.
- **Obtido:** H1 (limitado a 3 linhas, com "Ver objeto completo"), depois o parágrafo `objectSummary` (300 caracteres, termina em "A Licitação será realiza", sem reticências), depois `description` (510 caracteres) repetindo o mesmo texto do começo. A condição `description !== objectSummary` não detecta que o resumo é um prefixo da descrição.
- **Evidência:** saída do eval: `["300:PREGÃO CORREIOS Nº 26000415/2016 - SE/AM…A Licitação será realiza","510:PREGÃO CORREIOS …SEUS ANEXOS)."]`; `/tmp/claude-li/qa/detail-1280.png`.
- **Arquivo suspeito:** `src/features/tenders/tender-detail-page.tsx` (linhas ~269–271).

### QA-014 — Detalhe 404 sem H1 · FAIL · minor (a11y) · provisório (em polish)
- **Repro:** `/tenders/nope-123`.
- **Obtido:** a página só tem o `h2` "Licitação não encontrada" dentro do `role=alert`; `document.querySelectorAll('h1').length === 0`. O resto está certo: mensagem clara, `ref.` com requestId, link "Voltar para a busca", sem botão de retry inútil.
- **Evidência:** `/tmp/claude-li/qa/detail-404.png`. Arquivo suspeito: `src/features/tenders/tender-detail-page.tsx` / `src/components/common/query-states.tsx`.

### QA-015 — Landmarks e headings nas páginas fora do shell · FAIL · minor (a11y)
- `/login`, `/forgot-password`: dois `h1` ("A decisão começa antes do lance." e "Entre no seu workspace.") e nenhum `<main>`.
- `/` (landing) e a página 404 também não têm `<main>`.
- **Arquivos suspeitos:** `src/features/auth/auth-page.tsx`, `src/features/landing/landing-page.tsx`, `src/pages/not-found.tsx`.

---

## WARNING

- **QA-016 — Parâmetros inválidos são ignorados mas ficam na URL.** `?status=bogus`, `?sort=x`, `?page=-1`, `?valueMin=abc`, `?mode=bogus` mostram corretamente os 19 resultados, mas a URL não é normalizada (continua `?status=bogus`) e o lixo se propaga em links compartilhados. `search-service.ts` / `use-search-url-state.ts`.
- **QA-017 — Valor máximo absurdo vira notação científica.** Digitar `99999999999999999999999` em "Máximo" gera `?valueMax=1e+23` e o chip "R$ 100 mil – R$ 100.000.000.000 tri". Casas decimais ("1.000.000,99") são truncadas em silêncio (o comportamento está documentado em `money-input.ts`). `lib/money-input.ts`.
- **QA-018 — Dado: valor "sigiloso" classificado como `not_published`.** Nos dois pregões dos Correios o objeto diz "O valor estimado da contratação é sigiloso", mas a API devolve `estimatedValueStatus: "not_published"` e a UI mostra "Não informado" em vez de "Sigiloso". É do backend (`artifacts/api-server/src/ingest/pncp-map.ts`); relatado porque aparece na UI.
- **QA-019 — Labels de facet da API divergem do contrato v1.2.** A API manda `"Aberta"` e `"Pregão Eletrônico"`; o contrato fixa `Aberto` e `Pregão eletrônico`. Não aparece para o usuário porque `labelFor` sobrescreve status e modalidade. Backend.
- **QA-020 — Sugestão de relaxamento aponta o filtro errado.** `/search?q=xyzzyqq&valueMin=1000` → "Filtro mais restritivo: Faixa de valor", mas tirar essa faixa ainda dá 0; a causa é a query. `lib/relaxation.ts`.
- **QA-021 — Textos e links do dashboard.** "Aberturas próximas" mede o prazo de proposta, não a abertura (o contrato v1.2 separa `openingAt` de `proposalDeadline`). "Publicados em 7 dias · contados a partir de hoje" soa como futuro. "Ver todos" leva a `/search` sem `status=open&sort=deadline_asc`, então não bate com a lista "Prazos mais próximos". A lista de prioridade não usa `deadlineFrom=today`, então editais "open" com prazo vencido podem aparecer no topo. `dashboard-page.tsx`.
- **QA-022 — `document.title` fixo em todas as rotas** ("Licita Insight"), e a navegação SPA não move o foco nem anuncia a troca de página (WCAG 2.4.2). `App.tsx`/páginas.
- **QA-023 — Ordenação "Relevância" com query vazia.** O select mostra "Relevância", mas o contrato diz que o backend ordena por `published_desc` nesse caso. `search-page.tsx`.
- **QA-024 — Toggle de tema sem estado acessível.** O `aria-label` é fixo ("Alternar tema"), sem `aria-pressed` nem rótulo que diga o tema atual. `app-shell.tsx`.
- **QA-025 — Editais salvos não sincronizam entre abas** (sem listener de `storage`), e IDs órfãos nunca são limpos. `use-saved-tenders.ts`.
- **QA-026 — Landing "Seu radar · ATUALIZADO AGORA"** mostra a busca "tecnologia educacional", mas lista editais dos Correios e do SESC. A moldura de demonstração não bate com os dados reais exibidos. `landing-page.tsx`.
- **QA-027 — Troca de página não é anunciada.** O `aria-live` do contador continua "19 resultados" nas páginas 1→2→3; só a faixa "Mostrando 8–14" muda, e ela não é live. `search-page.tsx`.
- **QA-028 — Login.** Não há link para `/forgot-password` (a rota existe). Os inputs não têm `autocomplete` (`email`, `current-password`). O rodapé diz "Ambiente demonstrativo · 2024". `auth-page.tsx`.
- **QA-029 — Drawer mobile trunca o tagline** "PROCUREMENT INTEL…" por causa do botão fechar (`/tmp/claude-li/qa/drawer-375.png`). Cosmético.
- **QA-030 — "Limpar histórico" do combobox não é alcançável por teclado.** Tab fecha o popup antes de chegar ao botão. `search-combobox.tsx`.
- **QA-031 — Modo semântico com query vazia.** `/search?mode=semantic` mostra "Busca semântica precisa de ao menos 3 caracteres" antes de o usuário digitar qualquer coisa. `search-mode-control.tsx`.
- **QA-032 — Escolha lista/tabela não fica na URL nem em armazenamento.** Some no reload, no voltar/avançar e em links compartilhados. `search-page.tsx`.
- **QA-033 — Campos de data disparam navegação e request a cada mudança.** `onChange` faz `update()` direto; digitar o ano num `<input type=date>` gera URLs e requests intermediários. Evidência de código, não reproduzido com teclado real. `facet-panel.tsx` (DeadlineRange).
- **QA-034 — Breadcrumb do detalhe usa o rótulo cru da fonte,** "Pregão - Eletrônico 26000415/2026", enquanto o badge diz "Pregão eletrônico". Provisório (em polish). `tender-detail-page.tsx`.
- **QA-035 — "Abrir fonte original" é `<button>` com `window.open`, não link.** Não dá para abrir com o botão do meio nem copiar o endereço. Os links de documento estão certos (`<a target=_blank rel="noopener noreferrer">` com `aria-label` descritivo). Provisório (em polish). `tender-detail-page.tsx`.
- **QA-036 — Crash transitório durante edição concorrente:** "ReferenceError: scoresVary is not defined" em `SearchPage` (HMR no meio de um edit do agente de polish). O `ErrorBoundary` segurou a falha (o shell continuou funcionando) e um reload resolveu. Não é bug de produto, mas é o único `console.error` de toda a sessão.

## RECOMMENDATION

- **QA-037** — Adicionar `relative` (ou `contain: paint`) ao wrapper rolável da tabela (QA-001).
- **QA-038** — Limitar `page` a `[1, totalPages]` no `useSearchUrlState` e fazer replace da URL quando a resposta vier com `page > totalPages` (QA-002). Normalizar a URL depois do parse (QA-016).
- **QA-039** — Usar um Sheet/Dialog do Radix para o drawer mobile (focus trap, Escape, retorno de foco) e `inert` no `<aside>` fechado abaixo de `lg` (QA-004).
- **QA-040** — ErrorState de `INVALID_PARAMETER` na busca: trocar "Tentar novamente" por "Limpar filtros" (QA-007).
- **QA-041** — Script inline de tema no `index.html` (lê `licita-theme` antes do React) e aplicar o tema também fora do `AppShell` (QA-009).
- **QA-042** — `document.title` por rota ("Explorar editais · Licita Insight", o título do edital no detalhe) e foco no `h1`/`main` na troca de rota (QA-022).
- **QA-043** — Toast com "Desfazer" ao remover um edital em `/saved-tenders` (hoje a linha some na hora, sem volta).
- **QA-044** — Persistir o estado recolhido da sidebar (hoje reseta em todo reload).
- **QA-045** — Estrutura de headings em `/search`: os títulos dos editais (`h3`) ficam logo abaixo do `h1`, e no outline caem sob o `h2` "Filtros". Um `h2` (visível ou `sr-only`) "Resultados" na seção de resultados corrige isso. As 19 regiões `aria-live` vazias por linha (botão salvar) são aceitáveis, mas uma região única compartilhada é mais limpa.

---

## PASS (verificado funcionando)

**Busca e estado na URL**
1. `?status=bogus`, `?sort=x`, `?page=-1`, `?valueMin=abc`, `?mode=bogus` são descartados sem quebrar: 19 resultados, sem erro, nenhum 400 enviado à API.
2. `?pageSize=500` é limitado a 100 ("100 / pág."); `?pageSize=7` entra como opção no select.
3. `?valueMin=100000&valueMax=10`: validação inline "O valor mínimo deve ser menor que o máximo." (`role=alert`, `aria-invalid`).
4. `?organizationId=pncp-000` (órgão desconhecido): chip com o ID como label e relaxamento exato "Removê-lo mostraria 19 resultados".
5. Query sem resultado (`?q=xyzzyqq`): estado vazio com "Buscar sem “xyzzyqq”" e dicas.
6. Relaxamento com `groupTotals`: `?q=correios&status=under_review` → "Remover este filtro" → `?q=correios`, 2 resultados.
7. Pluralização: "1 resultado para “pastilhas”" e "Mostrando 1–1 de 1 oportunidade"; "2 resultados", "19 resultados".
8. Voltar/avançar com filtros: `status=under_review` → `+open` → voltar → voltar → avançar restauram URL, checkboxes, chips e contagem.
9. Link profundo com reload (`?q=correios&status=open`, `?city=5300108`) restaura query, chips e checkboxes; o chip de município mostra "Brasília/DF".
10. Checkbox de facet adiciona/remove na URL; contagens disjuntivas corretas (Aberto 17 / Em análise 2 continuam visíveis com um deles selecionado).
11. Chips: um por valor, "Limpar tudo" e "Limpar (n)" na barra lateral mantêm query, ordenação e modo.
12. Faixa de valor: Enter e blur fazem commit; `100000` → "100.000", chip "a partir de R$ 100 mil", 8 resultados; faixa 100 mil–1 mi → 6 resultados.
13. Ordenação: o select abre com 5 opções, "Maior valor" → `?sort=value_desc`; a API põe os nulos por último nos dois sentidos.
14. Tamanho de página: 50 / pág. → `?pageSize=50`, página volta a 1.
15. Paginação: 7/pág → 1–7, 8–14, 15–19; anterior desabilitado na 1, próxima desabilitado na 3, `aria-current=page` na página atual, rola até os resultados.
16. "Ver mais (11)" / "Ver menos" no grupo Órgão (16 opções); campo "Buscar órgão" aparece.
17. Modo de busca: radiogroup com ←/→ alterna e move o foco (`?mode=semantic` ↔ keyword); nota de fallback `not_available` com q=correios e `query_too_short` com q=co.

**Combobox**
18. Digitar "corr" → 2 sugestões ("corr · 6 · Termo", órgão Correios · 2); região live "2 sugestões disponíveis"; o destaque do trecho casado respeita acento e caixa.
19. ↓/↑ circulam e dão a volta, com `aria-activedescendant` e `aria-selected` sincronizados.
20. Enter numa sugestão de órgão → vira filtro `organizationId` (chip) e limpa o texto.
21. Esc com a lista aberta fecha e mantém o texto; um segundo Esc limpa o texto.
22. Atalho "/" foca a busca a partir do body e a partir de um checkbox de facet.
23. A contagem da sugestão bate com a API (`q=corr` → 6).

**Mobile / sheet**
24. `/search` em 375: sem scroll horizontal; ações de título, busca, modo, Filtros e ordenação cabem na largura (`/tmp/claude-li/qa/search-375.png`).
25. Sheet de filtros: `role=dialog`, foco inicial em "Fechar filtros", Tab em "Aplicar" volta para "Fechar filtros" (trap), contador ao vivo "Aplicar · 2 resultados", rascunho descartado com Esc, "Aplicar" grava `status=open` e o badge mostra "1".
26. Facet rail vs botão Filtros por container query: rail em 1280/1440/1920, botão em 375/768/1024.
27. Toggle de tabela escondido abaixo de `md`; celulares sempre usam a lista.

**Shell**
28. Skip link é o primeiro item focável; ativá-lo foca `main#conteudo` sem quebrar a rota (`/search?q=correios#conteudo`).
29. Sidebar recolhida: 76 px, rótulo do botão troca para "Expandir barra lateral" com `aria-expanded`, links mantêm nome acessível (`sr-only`), tooltip aparece no hover ("Monitoramento").
30. Drawer mobile abre e fecha pelo X, pelo overlay e ao navegar por um link.
31. `aria-current=page` no item ativo, que também fica ativo em `/tenders/:id`.
32. O `ErrorBoundary` segura um crash da página e o shell continua utilizável.

**Páginas**
33. `/dashboard`: métricas coerentes com a API (19 / 19 / 0; o prazo aberto mais próximo é 02/10, fora dos 7 dias); 4 linhas de prioridade; sem overflow em 375.
34. `/saved-tenders`: ida e volta salvar/remover a partir da busca e da própria página; região live "Edital salvo"; `aria-pressed` e rótulo "Remover dos salvos".
35. `/saved-searches` e `/monitoring`: estados vazios honestos em PT-BR.
36. `/settings` em 375: a faixa de abas rola dentro de si (sem scroll de página).
37. `/design-system` em 375/768: tabelas largas rolam dentro do contêiner (sem scroll de página).
38. Página 404 (`/rota-inexistente`): "Erro 404 · Página não encontrada" com "Voltar ao início" e "Explorar editais".
39. `/forgot-password` renderiza e tem "Voltar para entrar".

**Detalhe (provisório, em polish)**
40. Objeto longo em CAIXA ALTA: título limitado com "Ver objeto completo" (`aria-expanded`), sem overflow em 375 e 1280.
41. "Início das propostas" com rótulo correto (`openingAt`, contrato v1.2); "Encerra em 23 dias"; valor nulo como "Não informado" com ícone e texto (cor não é o único sinal).
42. Links de documento: `target=_blank`, `rel="noopener noreferrer"`, `aria-label` "Baixar <arquivo> (Edital)"; "tamanho não informado" quando `sizeBytes` é null.
43. 404 de edital: mensagem, `ref.` com requestId, "Voltar para a busca".

**Transversal**
44. Nenhum overflow horizontal de página em /dashboard, /search (lista), /saved-tenders, /saved-searches, /monitoring, /settings, /design-system, /login e 404 em 375, 768, 1024, 1440 e 1920 (exceções: QA-001 e QA-010).
45. Console: nenhum erro ou warning de app em todas as páginas, fora o crash transitório de HMR (QA-036). Rede: as únicas falhas foram os 400 provocados de propósito (`deadlineFrom=2026-13-40`, `state=ZZZ`, `valueMin>valueMax`); nenhum 404/500 de assets ou API.
46. Contraste: nenhuma falha AA no primeiro viewport das páginas testadas nos dois temas, exceto QA-011.

## Artefatos

Screenshots em `/tmp/claude-li/qa/`: `search-1280.png`, `search-375.png`, `search-768.png`, `page999-1280.png`, `deadline-invalid-1280.png`, `combo-active.png`, `sheet-375.png`, `drawer-375.png`, `collapsed-1280.png`, `tooltip-1280.png`, `landing-375.png`, `p-login-1280.png`, `p-nope-404-1280.png`, `404-dark-spa.png`, `saved-tenders-1280.png`, `table-1280.png` (1920), `detail-375.png`, `detail-1280.png`, `detail-404.png`, `dashboard-375.png`.

Observação: o QA mexeu no `localStorage` compartilhado (`licita-theme`, que terminou em `light`) e restaurou `licita-saved-tenders` ao valor original.
