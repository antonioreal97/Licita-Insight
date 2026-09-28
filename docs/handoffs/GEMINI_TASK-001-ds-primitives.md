# GEMINI_TASK-001 — Dívida de Design System nos primitivos de UI

**De:** Claude Orchestrator · **Para:** agente Gemini (Antigravity CLI) · **Prioridade:** P2

## Contexto (leia antes)

- Regras do projeto: [`AGENTS.md`](../../AGENTS.md), `.cursorrules`, [`memory-bank/systemPatterns.md`](../../memory-bank/systemPatterns.md).
- Design system: [`design-system/README.md`](../../design-system/README.md), [`tokens.md`](../../design-system/tokens.md), [`components.md`](../../design-system/components.md), [`motion.md`](../../design-system/motion.md).
- Tokens em `artifacts/licitainsight/src/index.css` (Tailwind 4, `@theme inline`, HSL, light/dark).
- Regras do owner: copy em PT-BR; sem dado inventado; erros visíveis (sem `catch` vazio); menos código; não inventar libs.

## Tarefas

1. **Primitivos de overlay com escala do DS.** Em `artifacts/licitainsight/src/components/ui/`:
   `popover.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`, `select.tsx`, `hover-card.tsx`, `context-menu.tsx`, `menubar.tsx`
   usam `z-50` → trocar por `z-popover` (tooltip: `z-popover` também). Itens de menu usam foco
   `focus:bg-accent focus:text-accent-foreground` (âmbar, reservado para contadores) → `focus:bg-muted focus:text-foreground`.
   Tooltip usa `bg-primary text-primary-foreground` → `bg-inverse text-inverse-foreground`.
   Depois disso, remova os overrides locais equivalentes que existirem em
   `src/components/app-shell.tsx` (procure `z-popover` / `focus:bg-muted` passados via `className`) **somente se** ficarem redundantes.
2. **Variante destrutiva do Button de produto.** Em `src/components/common/action-button.tsx` adicione
   `variant="destructive"` (tokens `bg-destructive text-destructive-foreground`, hover/active/focus como as demais).
   **Não edite** `saved-searches-page.tsx` (o Claude está mexendo nela e vai adotar a variante depois).
   Documente a variante em [`design-system/components.md`](../../design-system/components.md).
3. **Token de altura do header mobile.** Crie `--spacing-header-mobile: 3.5rem` em `index.css` (junto de
   `--spacing-header`) e use no shell (`h-14` → `h-header-mobile`) e no rail de filtros de
   `src/features/search/search-page.tsx` (`3.5rem` literal → `var(--spacing-header-mobile)`). Documente em [`tokens.md`](../../design-system/tokens.md).
4. **Registro de dívida desatualizado.** Atualize a seção "Debt register" de [`design-system/README.md`](../../design-system/README.md)
   removendo itens já resolvidos (verifique no código antes de remover) e acrescentando o que você não resolver.

## Propriedade de arquivos (não edite nada fora disso)

`artifacts/licitainsight/src/components/ui/*`, `src/components/common/action-button.tsx`,
`src/index.css` (só o token do item 3), `src/components/app-shell.tsx` (só itens 1 e 3),
`src/features/search/search-page.tsx` (só item 3),
`design-system/*.md`.

**Não toque** em: `src/features/saved-tenders/**`, `src/features/tenders/**`, `src/features/monitoring/**`, `src/features/saved-searches/**`, `src/features/auth/**`
(o Claude está editando), `artifacts/api-server/**`, `lib/**`, `pnpm-*` (o Codex é dono).

## Restrições

- Sem novas dependências. **Não faça commit, stash nem reset** — o orquestrador revisa e commita.
- Formatação: `cd artifacts/licitainsight && ../../node_modules/.bin/prettier --write <arquivos>` (config `.prettierrc.json`).
- Mantenha APIs exportadas e `data-testid` existentes.

## Aceite

- `cd artifacts/licitainsight && ../../node_modules/.bin/tsc -p tsconfig.json --noEmit` passa.
- `grep -rn "z-50\|focus:bg-accent" artifacts/licitainsight/src/components/ui` não retorna nada nos arquivos listados.
- Contraste do tooltip (`inverse` sobre `inverse-foreground`) ≥ 4.5:1 nos dois temas — cite o valor.

## Resposta

Escreva [`docs/handoffs/GEMINI_REPORT-001-ds-primitives.md`](GEMINI_REPORT-001-ds-primitives.md) com: arquivos alterados, o que foi feito por item,
evidência (saída do tsc e do grep), o que ficou pendente e por quê. Depois avise no terminal que terminou.
